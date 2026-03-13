import { getUserByToken, getStats, getPairUsed, getUserById } from "../../lib/redis.js";
import { getCategories } from "../../lib/questions.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();
  const token = req.headers["x-auth-token"] || req.query.token;
  const me = await getUserByToken(token);
  if (!me) return res.status(401).json({ error: "غير مسجل" });

  const stats = await getStats(me.id);

  // For each opponent, attach remaining question counts
  const opponentsWithCats = {};
  for (const [oppId, oppData] of Object.entries(stats.opponents || {})) {
    const usedQMap = await getPairUsed(me.id, oppId);
    const cats = getCategories(usedQMap);
    // Flatten to summary: total remaining games across all categories
    let totalRemaining = 0, totalExhausted = 0, totalCats = 0;
    const catsSummary = [];
    for (const [group, catList] of Object.entries(cats)) {
      for (const cat of catList) {
        totalCats++;
        if (cat.possible_games === 0) totalExhausted++;
        else totalRemaining += cat.possible_games;
        catsSummary.push({ name: cat.name, file: cat.file, remaining: cat.possible_games, total: cat.total_games });
      }
    }
    opponentsWithCats[oppId] = {
      ...oppData,
      totalRemaining,
      totalExhausted,
      totalCats,
      categories: catsSummary,
    };
  }

  res.json({
    userId: me.id,
    username: me.username,
    displayName: me.displayName,
    createdAt: me.createdAt,
    ...stats,
    opponents: opponentsWithCats,
  });
}
