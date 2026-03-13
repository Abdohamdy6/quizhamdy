import { getCategories } from "../lib/questions.js";
import { getDb } from '../lib/mongodb.js';

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  try {
    const token = req.headers.authorization;
    let playedQuestions = [];

    // جلب الأسئلة الملعوبة عن طريق التوكن (أكثر أماناً من الـ username)
    if (token) {
      try {
        const db = await getDb();
        const user = await db.collection('users').findOne({ token });
        if (user?.playedQuestions?.length) {
          playedQuestions = user.playedQuestions;
        }
      } catch(dbErr) {
        console.error("MongoDB Fetch Error:", dbErr);
        // نتابع حتى لو الداتابيز فشلت
      }
    }

    res.json(getCategories(playedQuestions));
  } catch(e) {
    console.error("Categories API Error:", e);
    res.status(500).json({ error: e.message });
  }
}
