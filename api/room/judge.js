/**
 * /api/room/judge
 * 
 * endpoint مستقل للحكم على الإجابة عن طريق Gemini.
 * الـ client ينادي عليه مباشرةً بعد submit_answer عشان
 * يضمن إن الـ function بتتنفذ كامل بدون ما Vercel يقطعها.
 */
import { getRoom, saveRoom } from "../../lib/redis.js";
import { judgeAnswer } from "../../lib/ai.js";

function addEv(room, type, data={}) {
  room.events = [...(room.events||[]), {type,data,id:Date.now()+Math.random()}].slice(-60);
}

function endQuestion(room, winner, pts) {
  const cq = room.currentQ;
  const ap = room.activePower;
  if (winner && pts > 0) {
    const wk = String(winner);
    room.scores[wk] = (room.scores[wk]||0) + pts;
    if (ap?.type==="hole" && String(ap.team)===wk) {
      const lk = wk==="1"?"2":"1";
      room.scores[lk] = (room.scores[lk]||0) - ((cq?.basePts||0)*(cq?.isDouble?2:1));
    }
  }
  if (cq) {
    const bid = `${cq.catIndex}-${cq.qIndex}`;
    if (!room.doneBtns.includes(bid)) room.doneBtns.push(bid);
  }
  room.turn = room.turn===1?2:1;
  room.activePower = null;
  room.timerStart = room.timerSeconds = room.timerPhase = null;
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
    addEv(room,"game_over",{winner:w,scores:sc,hostName:room.hostName,guestName:room.guestName});
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { code, playerNum, answer, savedPhase } = req.body;
  if (!code || !playerNum || answer === undefined) return res.status(400).json({error:"بيانات ناقصة"});

  const room = await getRoom(code);
  if (!room) return res.status(404).json({error:"الروم مش موجود"});

  // لو السؤال خلص قبل ما الحكم يجي (مثلاً من timer_check) → تجاهل
  if (!room.currentQ || room.currentQ.phase !== "judging") {
    return res.json({ok:true, skipped:true});
  }

  const cq = room.currentQ;
  const pStr    = String(playerNum);
  const ownerStr = String(cq.owner);
  const other   = ownerStr==="1"?"2":"1";
  const phase   = savedPhase || "playing"; // الـ phase الأصلية قبل "judging"

  try {
    const correct = await judgeAnswer(cq.question, cq.answer, answer);
    const pts = correct ? cq.points : 0;

    // أعد تحميل الـ room تاني بعد ما Gemini خلص (ممكن يكون اتغيّر)
    const room2 = await getRoom(code);
    if (!room2?.currentQ || room2.currentQ.phase !== "judging") {
      return res.json({ok:true, skipped:true});
    }
    const ap = room2.activePower;

    // إجابة خاطئة في playing + doubleAns مفعّلة
    if (!correct && phase==="playing" && ap?.type==="doubleAns" && String(ap.team)===ownerStr) {
      room2.currentQ.phase = "double_ans";
      addEv(room2, `wrong_try_double_ans_${ownerStr}`, {question:cq.question});
      addEv(room2, `opponent_wrong_double_${other}`, {});
      await saveRoom(code, room2);
      return res.json({ok:true});
    }

    // إجابة خاطئة في playing → فرصة للخصم
    if (!correct && phase==="playing") {
      if (ap?.type==="red" && String(ap.team)!==ownerStr) {
        room2.scores[ownerStr] = (room2.scores[ownerStr]||0) - cq.points;
        addEv(room2, "red_penalty", {team:ownerStr, deduct:cq.points});
      }
      room2.currentQ.phase = "pass";
      room2.timerStart = Date.now(); room2.timerSeconds = 20; room2.timerPhase = "pass";
      addEv(room2, "wrong_try_pass",    {by:playerNum, givenAnswer:answer});
      addEv(room2, "time_up_pass",      {seconds:20});
      addEv(room2, `your_turn_${other}`, {});
      await saveRoom(code, room2);
      return res.json({ok:true});
    }

    // إظهار النتيجة
    addEv(room2, "answer_revealed", {
      correct, correctAnswer:cq.answer, givenAnswer:answer, by:playerNum, pts
    });

    if (correct) {
      const isOwner = pStr === ownerStr;
      const canY = isOwner && !room2.powersUsed[other].yellow && !room2.activePower;
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
    return res.json({ok:true});

  } catch(e) {
    console.error("Judge error:", e);
    // fallback: انهِ السؤال بدون فائز
    const roomFail = await getRoom(code);
    if (roomFail?.currentQ?.phase === "judging") {
      endQuestion(roomFail, null, 0);
      await saveRoom(code, roomFail);
    }
    return res.json({ok:true, fallback:true});
  }
}
