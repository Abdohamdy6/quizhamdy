import { getRoom, saveRoom } from "../../lib/redis.js";
import { pickQuestions } from "../../lib/questions.js";
import { MongoClient } from 'mongodb';

let cachedDb = null;
async function getDb() {
  if (cachedDb) return cachedDb;
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  cachedDb = client.db(); 
  return cachedDb;
}

function freshP() { return { hole:false, yellow:false, red:false, doubleAns:false }; }
function addEv(room,type,data={}) {
  room.events=[...(room.events||[]),{type,data,id:Date.now()+Math.random()}].slice(-60);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { code, playerNum, selectedFiles } = req.body;
  const room = await getRoom(code);
  
  if (!room) return res.status(404).json({ error: "الروم مش موجود" });
  if (playerNum !== 1) return res.status(403).json({ error: "المضيف بس يقدر يبدأ" });
  if (!selectedFiles || selectedFiles.length !== 6)
    return res.status(400).json({ error: "اختر 6 كاتيجوريز بالضبط" });

  // استخدام اليوزرات الحقيقية الثابتة في الروم
  const hostU  = room.hostUsername;
  const guestU = room.guestUsername;

  let playedQuestions = [];
  try {
    const db = await getDb();
    const users = await db.collection('users').find({ username: { $in: [hostU, guestU] } }).toArray();
    // تجميع الأسئلة اللي أي حد فيهم لعبها قبل كدا
    playedQuestions = users.reduce((acc, u) => acc.concat(u.playedQuestions || []), []);
    // إزالة التكرار لو كانوا لعبوا نفس السؤال
    playedQuestions = [...new Set(playedQuestions)];
  } catch(e) { console.error("DB Error:", e); }

  const gameData = [];
  for (const f of selectedFiles) {
    const r = pickQuestions(f, playedQuestions); 
    if (!r) return res.status(400).json({ error: `أسئلة غير كافية أو انتهت في: ${f}` });
    gameData.push(r);
  }
  
  const flat = gameData.flatMap((c,ci)=>c.questions.map((_,qi)=>({ci,qi})));
  const dbl  = flat[Math.floor(Math.random()*flat.length)];
  const catsClient = gameData.map(c=>({ category:c.category, questions:c.questions.map(q=>({points:q.points})) }));
  
  Object.assign(room, {
    gameData, catsClient, doubleInfo:{catIndex:dbl.ci,qIndex:dbl.qi},
    state:"playing", turn:1, scores:{"1":0,"2":0},
    powersUsed:{"1":freshP(),"2":freshP()}, activePower:null,
    currentQ:null, doneBtns:[], events:[],
    timerStart:null, timerSeconds:null, timerPhase:null,
  });
  
  addEv(room, "game_started", {});
  await saveRoom(code, room);
  res.json({ ok:true });
}
