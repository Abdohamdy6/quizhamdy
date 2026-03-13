import { getUserByUsername, createSession } from "../../lib/redis.js";
import { hashPassword } from "../../lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: "اليوزرنيم والباسورد مطلوبين" });

  const user = await getUserByUsername(username);
  if (!user) return res.status(401).json({ error: "اليوزرنيم أو الباسورد غلط" });

  const hash = hashPassword(password, user.salt);
  if (hash !== user.passwordHash)
    return res.status(401).json({ error: "اليوزرنيم أو الباسورد غلط" });

  const token = await createSession(user.id);
  res.json({ ok: true, token, userId: user.id, displayName: user.displayName, username: user.username });
}
