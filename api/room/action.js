import { getRoom, saveRoom } from "../../lib/redis.js";
import { judgeAnswer } from "../../lib/ai.js";
import { MongoClient } from 'mongodb';

let cachedDb = null;
async function getDb() {
  if (cachedDb) return cachedDb;
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  cachedDb = client.db();
  return cachedDb;
}

function addEv(room, type, data={}) {
  room.events = [...(room.events||[]), {type,data,id:Date.now()+Math.random()}].slice(-60);
}

async function saveGameResult(room) {
  try {
    const db = await getDb();
    const s = room.scores;
    const winner = s["1"]>s["2"]?1:s["2"]>s["1"]?2:0;
    const hostU  = room.hostUsername  || room.hostName;
    const guestU = room.guestUsername || room.guestName;
    const winnerUsername = winner===1 ? hostU : winner===2 ? guestU : null;
    await db.collection('gameHistory').insertOne({
      hostUsername: hostU, guestUsername: guestU,
      hostDisplayName: room.hostName, guestDisplayName: room.guestName,
      players: [hostU, guestU],
      scores: s, winner, winnerUsername,
      categories: (room.catsClient||[]).map(c=>c.category),
      playedAt: new Date(),
    });
  } catch(e) { console.error("Save game result error:", e); }
}

function endQuestion(room, winner, pts) {
  const cq = room.currentQ;
  const ap = room.activePower;
  if (winner && pts > 0) {
    const wk = String(winner);
    room.scores[wk] = (room.scores[wk]||0) + pts;
    if (ap?.type==="hole" && String(ap.team)===wk) {
      const lk = wk==="1"?"2":"1";
      const base = (cq?.basePts||0) * (cq?.isDouble?2:1);
      room.scores[lk] = (room.scores[lk]||0) - base;
    }
  }
  if (cq) {
    const bid = `${cq.catIndex}-${cq.qIndex}`;
    if (!room.doneBtns.includes(bid)) room.doneBtns.push(bid);
  }
  room.turn        = room.turn===1?2:1;
  room.activePower = null;
  room.timerStart  = room.timerSeconds = room.timerPhase = null;
  addEv(room, "question_ended", {
    winner, pts, correctAnswer: cq?.answer||"",
    doneBtns: room.doneBtns, scores: room.scores, turn: room.turn,
  });
  room.currentQ = null;
  const total = (room.gameData||[]).reduce((s,c)=>s+c.questions.length,0)||36;
  if (room.doneBtns.length >= total) {
    room.state = "ended";
    const sc = room.scores;
    const w = sc["1"]>sc["2"]?1:sc["2"]>sc["1"]?2:0;
    addEv(room, "game_over", {winner:w,scores:sc,hostName:room.hostName,guestName:room.guestName});
    saveGameResult(room);
  }
}

// ══════════════════════════════════════════
// المنطق الأساسي للحكم — يُستدعى في الخلفية بعد الرد على الـ client
// ══════════════════════════════════════════
async function runJudgment(code, playerNum, answer, savedCQ) {
  try {
    const correct = await judgeAnswer(savedCQ.question, savedCQ.answer, answer);
    const pts = correct ? savedCQ.points : 0;

    // أعد تحميل الـ room من Redis بعد ما Gemini خلص
    const room2 = await getRoom(code);
    if (!room2?.currentQ) return; // السؤال انتهى أو الروم اتحذف

    const pStr    = String(playerNum);
    const ownerStr = String(savedCQ.owner);
    const other   = ownerStr==="1"?"2":"1";
    const phase   = savedCQ.phase;
    const ap      = room2.activePower;

    // حالة: إجابة خاطئة في الـ playing + doubleAns مفعّلة
    if (!correct && phase==="playing" && ap?.type==="doubleAns" && String(ap.team)===ownerStr) {
      room2.currentQ.phase = "double_ans";
      addEv(room2, `wrong_try_double_ans_${ownerStr}`, {question:savedCQ.question});
      addEv(room2, `opponent_wrong_double_${other}`, {});
      await saveRoom(code, room2);
      return;
    }

    // حالة: إجابة خاطئة في الـ playing → فرصة للخصم
    if (!correct && phase==="playing") {
      if (ap?.type === "red" && String(ap.team) !== ownerStr) {
        room2.scores[ownerStr] = (room2.scores[ownerStr]||0) - savedCQ.points;
        addEv(room2, "red_penalty", {team:ownerStr, deduct:savedCQ.points});
      }
      room2.currentQ.phase = "pass";
      room2.timerStart = Date.now(); room2.timerSeconds = 20; room2.timerPhase = "pass";
      addEv(room2, "wrong_try_pass", {by:playerNum, givenAnswer:answer});
      addEv(room2, "time_up_pass",   {seconds:20});
      addEv(room2, `your_turn_${other}`, {});
      await saveRoom(code, room2);
      return;
    }

    // إظهار نتيجة الإجابة
    addEv(room2, "answer_revealed", {
      correct, correctAnswer:savedCQ.answer,
      givenAnswer:answer, by:playerNum, pts
    });

    if (correct) {
      const isOwnerAnswering = (pStr === ownerStr);
      const canY = isOwnerAnswering && !room2.powersUsed[other].yellow && !room2.activePower;
      if (canY) {
        room2.currentQ.phase = "yellow_window";
        room2.currentQ.pendingWinner = playerNum;
        room2.currentQ.pendingPts   = pts;
        room2.timerStart = Date.now(); room2.timerSeconds = 10; room2.timerPhase = "yellow_wait";
        addEv(room2, "yellow_window",           {seconds:10, pts});
        addEv(room2, `can_use_yellow_${other}`, {can:true, pts});
      } else {
        endQuestion(room2, playerNum, pts);
      }
    } else {
      endQuestion(room2, null, 0);
    }
    await saveRoom(code, room2);

  } catch(e) {
    // لو حصل أي خطأ في الحكم، انهِ السؤال بدون فائز
    console.error("runJudgment error:", e);
    try {
      const roomErr = await getRoom(code);
      if (roomErr?.currentQ) {
        endQuestion(roomErr, null, 0);
        await saveRoom(code, roomErr);
      }
    } catch(e2) { console.error("Fallback error:", e2); }
  }
}

// ══════════════════════════════════════════
// MAIN HANDLER
// ══════════════════════════════════════════
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { code, playerNum, action, payload={} } = req.body;
  if (!code||!playerNum||!action) return res.status(400).json({error:"بيانات ناقصة"});

  const room = await getRoom(code);
  if (!room) return res.status(404).json({error:"الروم مش موجود"});

  const pStr     = String(playerNum);
  const other    = pStr==="1"?"2":"1";
  const isMyTurn = room.turn===playerNum;

  // ── use_power_pre ──
  if (action==="use_power_pre") {
    const {type} = payload;
    if (!isMyTurn) return res.status(403).json({error:"مش دورك!"});
    if (room.powersUsed[pStr][type]) return res.status(400).json({error:"استخدمتها قبل!"});
    if (room.activePower)            return res.status(400).json({error:"هناك خاصية مفعّلة!"});
    room.powersUsed[pStr][type] = true;
    room.activePower = {team:playerNum, type};
    addEv(room, "power_pre_used", {type, by:playerNum});
    await saveRoom(code, room);
    return res.json({ok:true});
  }

  // ── open_question ──
  if (action==="open_question") {
    const {catIndex, qIndex} = payload;
    if (!isMyTurn) return res.status(403).json({error:"مش دورك!"});
    const bid = `${catIndex}-${qIndex}`;
    if (room.doneBtns.includes(bid)) return res.status(400).json({error:"سؤال اتجاوب قبل كده"});

    const q        = room.gameData[catIndex].questions[qIndex];
    const di       = room.doubleInfo;
    const isDouble = di.catIndex===catIndex && di.qIndex===qIndex;

    // لو السؤال دبل والحفرة مفعّلة → أعد الحفرة
    if (isDouble && room.activePower?.type === "hole") {
      room.activePower = null;
      room.powersUsed[pStr].hole = false;
      addEv(room, "hole_refunded", {by:playerNum});
    }

    const pts = q.points * (isDouble?2:1);
    room.currentQ = {
      catIndex, qIndex, question:q.q, answer:q.a,
      points:pts, basePts:q.points, isDouble, phase:"playing", owner:playerNum,
      pendingWinner:null, pendingPts:0,
    };

    // حفظ السؤال على أكونتات اللاعبين الحقيقيين
    try {
      const db = await getDb();
      const hostU  = room.hostUsername  || room.hostName;
      const guestU = room.guestUsername || room.guestName;
      await db.collection('users').updateMany(
        { username: { $in: [hostU, guestU] } },
        { $addToSet: { playedQuestions: q.q } }
      );
    } catch(e) { console.error("DB Error:", e); }

    room.timerStart = Date.now(); room.timerSeconds = 60; room.timerPhase = "main";
    addEv(room, "question_opened", {catIndex,qIndex,question:q.q,points:pts,isDouble,owner:playerNum});
    if (isDouble) addEv(room, "double_revealed", {});
    const canRed = !room.powersUsed[other].red && !room.activePower;
    addEv(room, `can_use_red_${other}`, {can:canRed});
    addEv(room, "timer_started", {seconds:60, team:playerNum});
    await saveRoom(code, room);
    return res.json({ok:true});
  }

  // ── use_power_red ──
  if (action==="use_power_red") {
    if (isMyTurn)                              return res.status(403).json({error:"مش قادر تستخدمه على نفسك!"});
    if (room.powersUsed[pStr].red)             return res.status(400).json({error:"استخدمتها قبل!"});
    if (room.currentQ?.phase !== "playing")    return res.status(400).json({error:"وقتها فات!"});
    if (room.activePower)                      return res.status(400).json({error:"تم استخدام خاصية أخرى في هذا السؤال!"});
    room.powersUsed[pStr].red = true;
    room.activePower = {team:playerNum, type:"red"};
    room.currentQ.points = Math.floor(room.currentQ.points / 2);
    addEv(room, "red_card_played", {by:pStr, newPoints:room.currentQ.points});
    await saveRoom(code, room);
    return res.json({ok:true});
  }

  // ── submit_answer ──
  if (action==="submit_answer") {
    const {answer} = payload;
    const cq = room.currentQ;
    if (!cq) return res.status(400).json({error:"مفيش سؤال مفتوح"});

    const ownerStr = String(cq.owner);
    const phase    = cq.phase;

    if (phase==="playing"    && pStr!==ownerStr) return res.status(403).json({error:"مش دورك!"});
    if (phase==="pass"       && pStr===ownerStr) return res.status(403).json({error:"مش دورك!"});
    if (phase==="double_ans" && pStr!==ownerStr) return res.status(403).json({error:"مش دورك!"});

    // ✅ أوقف التايمر، ماركّ السؤال كـ "judging" وابعت الحدث
    room.timerStart = room.timerSeconds = room.timerPhase = null;
    room.currentQ.phase = "judging"; // منع الـ timer_check من إعادة تشغيل الـ pass
    addEv(room, "answer_submitted", {by:playerNum});
    await saveRoom(code, room);

    // ✅ ارد على الـ client فوراً — مش محتاجين نستنى Gemini
    res.json({ok:true});

    // ✅ شغّل الحكم في الخلفية بعد الرد
    // (Vercel بتفضل تشغّل الكود بعد res.json حتى ما يخلص)
    await runJudgment(code, playerNum, answer, {
      question:   cq.question,
      answer:     cq.answer,
      points:     cq.points,
      basePts:    cq.basePts,
      isDouble:   cq.isDouble,
      phase:      cq.phase,
      owner:      cq.owner,
    });

    return;
  }

  // ── use_yellow_card ──
  if (action==="use_yellow_card") {
    if (isMyTurn)                                          return res.status(403).json({error:"مش قادر تستخدمه على نفسك!"});
    if (room.powersUsed[pStr].yellow)                     return res.status(400).json({error:"استخدمتها قبل!"});
    if (room.activePower)                                  return res.status(400).json({error:"تم استخدام خاصية أخرى في هذا السؤال!"});
    if (!room.currentQ || room.currentQ.phase !== "yellow_window") return res.json({ok:true});

    room.powersUsed[pStr].yellow = true;
    room.activePower = {team:playerNum, type:"yellow"};
    room.timerStart  = room.timerSeconds = room.timerPhase = null;
    addEv(room, "yellow_card_played", {by:pStr});
    endQuestion(room, null, 0);
    await saveRoom(code, room);
    return res.json({ok:true});
  }

  // ── skip_yellow ──
  if (action==="skip_yellow") {
    if (!room.currentQ || room.currentQ.phase !== "yellow_window") return res.json({ok:true});
    room.timerStart = room.timerSeconds = room.timerPhase = null;
    endQuestion(room, room.currentQ?.pendingWinner, room.currentQ?.pendingPts||0);
    await saveRoom(code, room);
    return res.json({ok:true});
  }

  // ── timer_check ──
  if (action==="timer_check") {
    if (!room.timerPhase || !room.timerStart)          return res.json({ok:true});
    if (!room.currentQ)                                return res.json({ok:true});
    if (room.currentQ.phase === "judging")             return res.json({ok:true}); // الـ AI لسه شغّال

    const elapsed = Math.floor((Date.now() - room.timerStart) / 1000);
    if (elapsed < room.timerSeconds) return res.json({ok:true});

    const phase = room.timerPhase;
    room.timerStart = room.timerSeconds = room.timerPhase = null;

    if (phase==="main") {
      const ownerStr = String(room.currentQ?.owner || room.turn);
      const otherStr = ownerStr==="1"?"2":"1";
      if (room.activePower?.type==="red" && String(room.activePower.team)!==ownerStr) {
        room.scores[ownerStr] = (room.scores[ownerStr]||0) - room.currentQ.points;
        addEv(room, "red_penalty", {team:ownerStr, deduct:room.currentQ.points});
      }
      if (room.currentQ) room.currentQ.phase = "pass";
      room.timerStart = Date.now(); room.timerSeconds = 20; room.timerPhase = "pass";
      addEv(room, "time_up_pass",        {seconds:20});
      addEv(room, `your_turn_${otherStr}`, {});

    } else if (phase==="pass") {
      endQuestion(room, null, 0);

    } else if (phase==="yellow_wait") {
      endQuestion(room, room.currentQ?.pendingWinner, room.currentQ?.pendingPts||0);
    }
    await saveRoom(code, room);
    return res.json({ok:true});
  }

  return res.status(400).json({error:`action مش معروف: ${action}`});
}
