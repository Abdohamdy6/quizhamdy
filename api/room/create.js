import { getRoom, saveRoom } from "../../lib/redis.js";
import { getDb } from "../../lib/mongodb.js";

function freshP() { return { hole:false, yellow:false, red:false, doubleAns:false }; }

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { hostName } = req.body;
  const token = req.headers.authorization;

  if (!hostName) return res.status(400).json({ error: "اكتب اسمك" });
  if (!token) return res.status(401).json({ error: "غير مصرح لك بإنشاء روم" });

  try {
    const db = await getDb();
    const user = await db.collection("users").findOne({ token: token });
    if (!user) return res.status(401).json({ error: "التوكن غير صالح أو انتهت صلاحيته" });

    let code, tries=0;
    do { code = String(Math.floor(1000+Math.random()*9000)); tries++; }
    while (await getRoom(code) && tries<10);

    const room = {
      code, hostName, guestName:null,
      hostUsername: user.username, guestUsername: null, // ← ربط بالأكونت الحقيقي
      state:"lobby",
      turn:1, scores:{"1":0,"2":0},
      powersUsed:{"1":freshP(),"2":freshP()},
      activePower:null, gameData:null, catsClient:null,
      doubleInfo:null, currentQ:null, doneBtns:[], events:[],
      timerStart:null, timerSeconds:null, timerPhase:null,
    };
    await saveRoom(code, room);
    res.json({ code });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "حدث خطأ في السيرفر" });
  }
}
