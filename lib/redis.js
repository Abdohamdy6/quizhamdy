import { Redis } from "@upstash/redis";

let _redis = null;
function r() {
  if (!_redis) _redis = new Redis({
    url:   process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
  return _redis;
}

// ── rooms ────────────────────────────────────────────────────────────────────
export async function getRoom(code) {
  const d = await r().get(`room:${code}`);
  if (!d) return null;
  return typeof d === "string" ? JSON.parse(d) : d;
}
export async function saveRoom(code, room) {
  await r().set(`room:${code}`, JSON.stringify(room), { ex: 7200 });
}

// ── users ────────────────────────────────────────────────────────────────────
// user:{id}     → { id, username, displayName, passwordHash, salt, createdAt }
// uname:{lower} → id   (username→id lookup)
// token:{token} → id   (session, 30 days)

export async function getUserById(id) {
  const d = await r().get(`user:${id}`);
  if (!d) return null;
  return typeof d === "string" ? JSON.parse(d) : d;
}
export async function getUserByUsername(username) {
  const id = await r().get(`uname:${username.toLowerCase()}`);
  if (!id) return null;
  return getUserById(id);
}
export async function saveUser(user) {
  await r().set(`user:${user.id}`, JSON.stringify(user));
  await r().set(`uname:${user.username.toLowerCase()}`, user.id);
}
export async function createSession(userId) {
  const { generateToken } = await import("./auth.js");
  const token = generateToken();
  await r().set(`token:${token}`, userId, { ex: 60 * 60 * 24 * 30 });
  return token;
}
export async function getUserByToken(token) {
  if (!token) return null;
  const id = await r().get(`token:${token}`);
  if (!id) return null;
  return getUserById(id);
}
export async function deleteSession(token) {
  await r().del(`token:${token}`);
}

// ── pair used-questions ───────────────────────────────────────────────────────
// key sorted by id so order doesn't matter
function pairKey(id1, id2) {
  return `usedq:${[id1, id2].sort().join(":")}`;
}
export async function getPairUsed(id1, id2) {
  const d = await r().get(pairKey(id1, id2));
  if (!d) return {};
  return typeof d === "string" ? JSON.parse(d) : d;
}
export async function savePairUsed(id1, id2, map) {
  await r().set(pairKey(id1, id2), JSON.stringify(map), { ex: 60 * 60 * 24 * 90 });
}

// ── stats ─────────────────────────────────────────────────────────────────────
// stats:{userId} → {
//   totalGames, wins, losses, draws,
//   opponents: { [opponentId]: { games, wins, losses, draws, displayName } },
//   recentGames: [{ opponentId, opponentName, result, myScore, oppScore, date }]  (last 20)
// }
export async function getStats(userId) {
  const d = await r().get(`stats:${userId}`);
  if (!d) return { totalGames:0, wins:0, losses:0, draws:0, opponents:{}, recentGames:[] };
  return typeof d === "string" ? JSON.parse(d) : d;
}
export async function saveStats(userId, stats) {
  await r().set(`stats:${userId}`, JSON.stringify(stats));
}

// Record the result of a finished game for both players
export async function recordGame(p1Id, p1Name, p1Score, p2Id, p2Name, p2Score) {
  async function update(myId, myName, myScore, oppId, oppName, oppScore) {
    const s = await getStats(myId);
    const result = myScore > oppScore ? "win" : myScore < oppScore ? "loss" : "draw";
    s.totalGames = (s.totalGames || 0) + 1;
    if (result === "win")  s.wins   = (s.wins   || 0) + 1;
    if (result === "loss") s.losses = (s.losses || 0) + 1;
    if (result === "draw") s.draws  = (s.draws  || 0) + 1;
    if (!s.opponents) s.opponents = {};
    const opp = s.opponents[oppId] || { games:0, wins:0, losses:0, draws:0, displayName:oppName };
    opp.games++;
    opp.displayName = oppName; // keep latest display name
    if (result === "win")  opp.wins++;
    if (result === "loss") opp.losses++;
    if (result === "draw") opp.draws++;
    s.opponents[oppId] = opp;
    if (!s.recentGames) s.recentGames = [];
    s.recentGames.unshift({ opponentId:oppId, opponentName:oppName, result, myScore, oppScore, date: new Date().toISOString() });
    s.recentGames = s.recentGames.slice(0, 20);
    await saveStats(myId, s);
  }
  await Promise.all([
    update(p1Id, p1Name, p1Score, p2Id, p2Name, p2Score),
    update(p2Id, p2Name, p2Score, p1Id, p1Name, p1Score),
  ]);
}

