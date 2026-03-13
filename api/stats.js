import { getDb } from '../lib/mongodb.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ error: "غير مصرح" });

  try {
    const db = await getDb();
    
    // تحقق من التوكن
    const me = await db.collection('users').findOne({ token });
    if (!me) return res.status(401).json({ error: "توكن غير صالح" });

    const myUsername = me.username;
    const { opponent } = req.query;

    if (opponent) {
      // إحصائيات مقارنة بين لاعبين
      const games = await db.collection('gameHistory').find({
        players: { $all: [myUsername, opponent] }
      }).sort({ playedAt: -1 }).toArray();

      let wins=0, losses=0, draws=0;
      let myTotalPoints=0, oppTotalPoints=0;
      let bestScore=0, worstScore=Infinity;

      games.forEach(g => {
        const amHost = g.hostUsername === myUsername;
        const myScore  = amHost ? (g.scores?.["1"]||0) : (g.scores?.["2"]||0);
        const oppScore = amHost ? (g.scores?.["2"]||0) : (g.scores?.["1"]||0);
        myTotalPoints  += myScore;
        oppTotalPoints += oppScore;
        if (myScore > bestScore) bestScore = myScore;
        if (myScore < worstScore) worstScore = myScore;
        if (g.winnerUsername === myUsername) wins++;
        else if (g.winnerUsername === opponent) losses++;
        else draws++;
      });

      return res.json({
        myUsername, opponent,
        gamesPlayed: games.length,
        wins, losses, draws,
        myTotalPoints, oppTotalPoints,
        myAvg: games.length ? Math.round(myTotalPoints/games.length) : 0,
        oppAvg: games.length ? Math.round(oppTotalPoints/games.length) : 0,
        bestScore: bestScore === 0 ? 0 : bestScore,
        worstScore: worstScore === Infinity ? 0 : worstScore,
        pointDiff: myTotalPoints - oppTotalPoints,
        recentGames: games.slice(0, 10).map(g => {
          const amHost = g.hostUsername === myUsername;
          const myScore  = amHost ? (g.scores?.["1"]||0) : (g.scores?.["2"]||0);
          const oppScore = amHost ? (g.scores?.["2"]||0) : (g.scores?.["1"]||0);
          const result = g.winnerUsername === myUsername ? 'win' : g.winnerUsername === opponent ? 'loss' : 'draw';
          return {
            date: g.playedAt,
            myScore, oppScore, result,
            categories: g.categories||[],
            myDisplayName: amHost ? g.hostDisplayName : g.guestDisplayName,
            oppDisplayName: amHost ? g.guestDisplayName : g.hostDisplayName,
          };
        }),
      });
    } else {
      // قائمة الخصوم السابقين
      const games = await db.collection('gameHistory').find({
        players: myUsername
      }).sort({ playedAt: -1 }).toArray();

      const opponentsMap = {};
      games.forEach(g => {
        const oppUsername = g.hostUsername === myUsername ? g.guestUsername : g.hostUsername;
        const oppDisplayName = g.hostUsername === myUsername ? g.guestDisplayName : g.hostDisplayName;
        if (!oppUsername) return;
        if (!opponentsMap[oppUsername]) {
          opponentsMap[oppUsername] = { username: oppUsername, displayName: oppDisplayName, games: 0, wins: 0 };
        }
        opponentsMap[oppUsername].games++;
        if (g.winnerUsername === myUsername) opponentsMap[oppUsername].wins++;
      });

      const opponents = Object.values(opponentsMap).sort((a,b) => b.games - a.games);
      
      // إجمالي إحصائيات اللاعب
      let totalWins=0, totalGames=games.length, totalPoints=0;
      games.forEach(g => {
        const amHost = g.hostUsername === myUsername;
        totalPoints += amHost ? (g.scores?.["1"]||0) : (g.scores?.["2"]||0);
        if (g.winnerUsername === myUsername) totalWins++;
      });

      return res.json({
        myUsername,
        totalGames,
        totalWins,
        totalLosses: totalGames - totalWins,
        totalPoints,
        avgPoints: totalGames ? Math.round(totalPoints/totalGames) : 0,
        opponents,
      });
    }
  } catch(e) {
    console.error("Stats error:", e);
    res.status(500).json({ error: e.message });
  }
}
