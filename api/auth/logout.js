import { deleteSession } from "../../lib/redis.js";
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const token = req.headers["x-auth-token"];
  if (token) await deleteSession(token);
  res.json({ ok: true });
}
