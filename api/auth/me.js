import { getUserByToken } from "../../lib/redis.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();
  const token = req.headers["x-auth-token"] || req.query.token;
  const user = await getUserByToken(token);
  if (!user) return res.status(401).json({ error: "غير مسجل" });
  res.json({ userId: user.id, displayName: user.displayName, username: user.username });
}
