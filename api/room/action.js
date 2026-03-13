import { getRoom, saveRoom } from "../../lib/redis.js";
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
    await db.collection('gameHistory').insertOne({
      hostUsername:hostU, guestUsername:guestU,
      hostDisplayName:room.hostName, guestDisplayName:room.guestName,
      players:[hostU,guestU], scores:s, winner,
      winnerUsername: winner===1?hostU:winner===2?guestU:null,
      categories:(room.catsClient||[]).map(c=>c.category),
      playedAt:new Date(),
    });
  } catch(e) { console.error("saveGameResult:", e); }
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
  addEv(room,"question_ended",{
    winner,pts,correctAnswer:cq?.answer||"",
    doneBtns:room.doneBtns,scores:room.scores,turn:room.turn,
  });
  room.currentQ = null;
  const total = (room.gameData||[]).reduce((s,c)=>s+c.questions.length,0)||36;
  if (room.doneBtns.length >= total) {
    room.state="ended";
    const sc=room.scores;
    const w=sc["1"]>sc["2"]?1:sc["2"]>sc["1"]?2:0;
    addEv(room,"game_over",{winner:w,scores:sc,hostName:room.hostName,guestName:room.guestName});
    saveGameResult(room);
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { code, playerNum, action, payload={} } = req.body;
  if (!code||!playerNum||!action) return res.status(400).json({error:"بيانات ناقصة"});

  const room = await getRoom(code);
  if (!room) return res.status(404).json({error:"الروم مش موجود"});

  const pStr     = String(playerNum);
  const other    = pStr==="1"?"2":"1";
  const isMyTurn = room.turn===playerNum;

  if (action==="use_power_pre") {
    const {type}=payload;
    if (!isMyTurn)           return res.status(403).json({error:"مش دورك!"});
    if (room.powersUsed[pStr][type]) return res.status(400).json({error:"استخدمتها قبل!"});
    if (room.activePower)    return res.status(400).json({error:"هناك خاصية مفعّلة!"});
    room.powersUsed[pStr][type]=true;
    room.activePower={team:playerNum,type};
    addEv(room,"power_pre_used",{type,by:playerNum});
    await saveRoom(code,room);
    return res.json({ok:true});
  }

  if (action==="open_question") {
    const {catIndex,qIndex}=payload;
    if (!isMyTurn) return res.status(403).json({error:"مش دورك!"});
    const bid=`${catIndex}-${qIndex}`;
    if (room.doneBtns.includes(bid)) return res.status(400).json({error:"سؤال اتجاوب قبل كده"});
    const q=room.gameData[catIndex].questions[qIndex];
    const di=room.doubleInfo;
    const isDouble=di.catIndex===catIndex&&di.qIndex===qIndex;
    if (isDouble&&room.activePower?.type==="hole") {
      room.activePower=null; room.powersUsed[pStr].hole=false;
      addEv(room,"hole_refunded",{by:playerNum});
    }
    const pts=q.points*(isDouble?2:1);
    room.currentQ={catIndex,qIndex,question:q.q,answer:q.a,points:pts,basePts:q.points,isDouble,phase:"playing",owner:playerNum,pendingWinner:null,pendingPts:0};
    try {
      const db=await getDb();
      const hostU=room.hostUsername||room.hostName;
      const guestU=room.guestUsername||room.guestName;
      await db.collection('users').updateMany({username:{$in:[hostU,guestU]}},{$addToSet:{playedQuestions:q.q}});
    } catch(e){console.error("DB:",e);}
    room.timerStart=Date.now();room.timerSeconds=60;room.timerPhase="main";
    addEv(room,"question_opened",{catIndex,qIndex,question:q.q,points:pts,isDouble,owner:playerNum});
    if (isDouble) addEv(room,"double_revealed",{});
    addEv(room,`can_use_red_${other}`,{can:!room.powersUsed[other].red&&!room.activePower});
    addEv(room,"timer_started",{seconds:60,team:playerNum});
    await saveRoom(code,room);
    return res.json({ok:true});
  }

  if (action==="use_power_red") {
    if (isMyTurn)                           return res.status(403).json({error:"مش قادر تستخدمه على نفسك!"});
    if (room.powersUsed[pStr].red)          return res.status(400).json({error:"استخدمتها قبل!"});
    if (room.currentQ?.phase!=="playing")   return res.status(400).json({error:"وقتها فات!"});
    if (room.activePower)                   return res.status(400).json({error:"خاصية أخرى مفعّلة!"});
    room.powersUsed[pStr].red=true;
    room.activePower={team:playerNum,type:"red"};
    room.currentQ.points=Math.floor(room.currentQ.points/2);
    addEv(room,"red_card_played",{by:pStr,newPoints:room.currentQ.points});
    await saveRoom(code,room);
    return res.json({ok:true});
  }

  if (action==="submit_answer") {
    const {answer}=payload;
    const cq=room.currentQ;
    if (!cq) return res.status(400).json({error:"مفيش سؤال مفتوح"});
    const ownerStr=String(cq.owner);
    const phase=cq.phase;
    if (phase==="playing"    && pStr!==ownerStr) return res.status(403).json({error:"مش دورك!"});
    if (phase==="pass"       && pStr===ownerStr) return res.status(403).json({error:"مش دورك!"});
    if (phase==="double_ans" && pStr!==ownerStr) return res.status(403).json({error:"مش دورك!"});

    // حفظ الـ phase الأصلية قبل ما نغيّرها
    const originalPhase = phase;

    // وقف التايمر + ماركّ السؤال كـ judging
    room.timerStart=room.timerSeconds=room.timerPhase=null;
    room.currentQ.phase="judging";
    addEv(room,"answer_submitted",{by:playerNum});
    await saveRoom(code,room);

    // ✅ رد فوراً — الـ client هيناديك على /api/room/judge بعدين
    return res.json({ok:true, needsJudge:true, originalPhase});
  }

  if (action==="use_yellow_card") {
    if (isMyTurn)                                          return res.status(403).json({error:"مش قادر تستخدمه على نفسك!"});
    if (room.powersUsed[pStr].yellow)                     return res.status(400).json({error:"استخدمتها قبل!"});
    if (room.activePower)                                  return res.status(400).json({error:"خاصية أخرى مفعّلة!"});
    if (!room.currentQ||room.currentQ.phase!=="yellow_window") return res.json({ok:true});
    room.powersUsed[pStr].yellow=true;
    room.activePower={team:playerNum,type:"yellow"};
    room.timerStart=room.timerSeconds=room.timerPhase=null;
    addEv(room,"yellow_card_played",{by:pStr});
    endQuestion(room,null,0);
    await saveRoom(code,room);
    return res.json({ok:true});
  }

  if (action==="skip_yellow") {
    if (!room.currentQ||room.currentQ.phase!=="yellow_window") return res.json({ok:true});
    room.timerStart=room.timerSeconds=room.timerPhase=null;
    endQuestion(room,room.currentQ?.pendingWinner,room.currentQ?.pendingPts||0);
    await saveRoom(code,room);
    return res.json({ok:true});
  }

  if (action==="timer_check") {
    if (!room.timerPhase||!room.timerStart) return res.json({ok:true});
    if (!room.currentQ)                     return res.json({ok:true});
    if (room.currentQ.phase==="judging")    return res.json({ok:true}); // AI شغّال
    const elapsed=Math.floor((Date.now()-room.timerStart)/1000);
    if (elapsed<room.timerSeconds)          return res.json({ok:true});
    const phase=room.timerPhase;
    room.timerStart=room.timerSeconds=room.timerPhase=null;
    if (phase==="main") {
      const ownerStr=String(room.currentQ?.owner||room.turn);
      const otherStr=ownerStr==="1"?"2":"1";
      if (room.activePower?.type==="red"&&String(room.activePower.team)!==ownerStr) {
        room.scores[ownerStr]=(room.scores[ownerStr]||0)-room.currentQ.points;
        addEv(room,"red_penalty",{team:ownerStr,deduct:room.currentQ.points});
      }
      if (room.currentQ) room.currentQ.phase="pass";
      room.timerStart=Date.now();room.timerSeconds=20;room.timerPhase="pass";
      addEv(room,"time_up_pass",{seconds:20});
      addEv(room,`your_turn_${otherStr}`,{});
    } else if (phase==="pass") {
      endQuestion(room,null,0);
    } else if (phase==="yellow_wait") {
      endQuestion(room,room.currentQ?.pendingWinner,room.currentQ?.pendingPts||0);
    }
    await saveRoom(code,room);
    return res.json({ok:true});
  }

  return res.status(400).json({error:`action غير معروف: ${action}`});
}
