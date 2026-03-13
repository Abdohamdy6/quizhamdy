import { getRoom, saveRoom } from "../../lib/redis.js";
import { getDb } from "../../lib/mongodb.js";

function addEv(room, type, data={}) {
  room.events = [...(room.events||[]), { type, data, id: Date.now()+Math.random() }].slice(-60);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  
  // شلنا الـ guestName من الـ body لأننا هنجيبه من الداتا بيز عشان نمنع التلاعب
  const { code } = req.body;
  const token = req.headers.authorization;

  if (!code) return res.status(400).json({ error: "بيانات ناقصة" });
  if (!token) return res.status(401).json({ error: "غير مصرح لك بالدخول" });

  try {
    const db = await getDb();
    const user = await db.collection("users").findOne({ token: token });
    if (!user) return res.status(401).json({ error: "التوكن غير صالح أو انتهت صلاحيته" });

    const room = await getRoom(code);
    if (!room) return res.status(404).json({ error: "الكود غير صحيح!" });
    if (room.guestUsername) return res.status(400).json({ error: "الروم ممتلئ!" });

    // ربط الروم بالأكونت الحقيقي للاعب التاني
    room.guestName = user.username;
    room.guestUsername = user.username; 
    room.state = "selecting";
    
    addEv(room, "guest_joined", { guestName: user.username });
    await saveRoom(code, room);
    
    res.json({ ok:true, hostName:room.hostName });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "حدث خطأ في السيرفر" });
  }
}
