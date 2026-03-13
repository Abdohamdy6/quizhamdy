import { getRoom, saveRoom, getPairUsed, savePairUsed, getUserByToken } from "../../lib/redis.js";
import { pickQuestions } from "../../lib/questions.js";

function freshP() { return { hole:false, yellow:false, red:false, doubleAns:false }; }
function addEv(room, type, data={}) {
  room.events = [...(room.events||[]), {type, data, id:Date.now()+Math.random()}].slice(-60);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const token = req.headers["x-auth-token"];
  const user  = await getUserByToken(token);
  if (!user) return res.status(401).json({ error: "لازم تسجل دخول" });

  const { code, selectedFiles } = req.body;
  const room = await getRoom(code);
  if (!room) return res.status(404).json({ error: "الروم مش موجود" });
  if (room.hostId !== user.id) return res.status(403).json({ error: "المضيف بس يقدر يبدأ" });
  if (!selectedFiles || selectedFiles.length !== 6)
    return res.status(400).json({ error: "اختر 6 كاتيجوريز بالضبط" });

  // Load pair history by userId (not display name)
  const usedQMap    = await getPairUsed(room.hostId, room.guestId);
  const newUsedQMap = { ...usedQMap };
  const gameData    = [];

  for (const f of selectedFiles) {
    const r = pickQuestions(f, usedQMap);
    if (!r) return res.status(400).json({ error: `أسئلة غير كافية: ${f}` });
    gameData.push({ category: r.category, questions: r.questions });
    newUsedQMap[f] = [...(usedQMap[f] || []), ...r.newUsed];
  }

  await savePairUsed(room.hostId, room.guestId, newUsedQMap);

  const flat = gameData.flatMap((c,ci) => c.questions.map((_,qi) => ({ci,qi})));
  const dbl  = flat[Math.floor(Math.random() * flat.length)];
  const catsClient = gameData.map(c => ({
    category: c.category,
    questions: c.questions.map(q => ({ points: q.points })),
  }));

  Object.assign(room, {
    gameData, catsClient, doubleInfo: { catIndex:dbl.ci, qIndex:dbl.qi },
    state:"playing", turn:1, scores:{"1":0,"2":0},
    powersUsed:{"1":freshP(),"2":freshP()}, activePower:null,
    currentQ:null, doneBtns:[], events:[],
    timerStart:null, timerSeconds:null, timerPhase:null,
  });
  addEv(room, "game_started", {});
  await saveRoom(code, room);
  res.json({ ok:true });
}
