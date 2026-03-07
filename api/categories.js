import { getCategories } from "../../lib/questions.js";
import { MongoClient } from 'mongodb';

let cachedDb = null;
async function getDb() {
  if (cachedDb) return cachedDb;
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  cachedDb = client.db(); 
  return cachedDb;
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();
  try {
    const username = req.headers['x-username'];
    let playedQuestions = [];
    
    if (username) {
      const db = await getDb();
      const user = await db.collection('users').findOne({ username });
      if (user && user.playedQuestions) {
        playedQuestions = user.playedQuestions;
      }
    }
    
    // هنبعت الأسئلة الملعوبة لدالة الكاتيجوريز عشان تخصمها
    res.json(getCategories(playedQuestions)); 
  }
  catch(e) { res.status(500).json({ error: e.message }); }
}
