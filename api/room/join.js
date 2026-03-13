import { getRoom, saveRoom, getUserByToken } from "../../lib/redis.js";

function addEv(room, type, data = {}) {
  room.events = [...(room.events || []), { type, data, id: Date.now() + Math.random() }].slice(-60);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const token = req.headers["x-auth-token"];
  const user = await getUserByToken(token);
  if (!user) return res.status(401).json({ error: "لازم تسجل دخول الأول" });

  const { code } = req.body;
  if (!code) return res.status(400).json({ error: "الكود مطلوب" });

  const room = await getRoom(code);
  if (!room) return res.status(404).json({ error: "الكود غير صحيح!" });
  if (room.guestId) return res.status(400).json({ error: "الروم ممتلئ!" });
  if (room.hostId === user.id) return res.status(400).json({ error: "مش قادر تنضم لروم عملته أنت!" });

  room.guestName = user.displayName;
  room.guestId   = user.id;
  room.state     = "selecting";
  addEv(room, "guest_joined", { guestName: user.displayName });
  await saveRoom(code, room);
  res.json({ ok: true, hostName: room.hostName, displayName: user.displayName });
}
