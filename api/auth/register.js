import { getUserByUsername, saveUser } from "../../lib/redis.js";
import { hashPassword, generateSalt, generateId } from "../../lib/auth.js";
import { createSession } from "../../lib/redis.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { username, displayName, password } = req.body;
  if (!username || !password || !displayName)
    return res.status(400).json({ error: "كل الحقول مطلوبة" });
  if (username.length < 3 || username.length > 20)
    return res.status(400).json({ error: "اليوزرنيم بين 3 و20 حرف" });
  if (!/^[a-zA-Z0-9_]+$/.test(username))
    return res.status(400).json({ error: "اليوزرنيم: حروف وأرقام وشرطة سفلية بس" });
  if (password.length < 6)
    return res.status(400).json({ error: "الباسورد 6 حروف على الأقل" });
  if (displayName.length < 2 || displayName.length > 30)
    return res.status(400).json({ error: "الاسم المعروض بين 2 و30 حرف" });

  const existing = await getUserByUsername(username);
  if (existing) return res.status(400).json({ error: "اليوزرنيم ده موجود بالفعل" });

  const salt = generateSalt();
  const user = {
    id: generateId(),
    username: username.toLowerCase(),
    displayName,
    passwordHash: hashPassword(password, salt),
    salt,
    createdAt: new Date().toISOString(),
  };
  await saveUser(user);
  const token = await createSession(user.id);
  res.json({ ok: true, token, userId: user.id, displayName: user.displayName, username: user.username });
}
