import { getCategories } from "../lib/questions.js";
import { getPairUsed, getUserByToken } from "../lib/redis.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();
  try {
    const token = req.headers["x-auth-token"] || req.query.token;
    const { guestId } = req.query;
    let usedQMap = {};
    if (token && guestId) {
      const me = await getUserByToken(token);
      if (me) usedQMap = await getPairUsed(me.id, guestId);
    }
    res.json(getCategories(usedQMap));
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
