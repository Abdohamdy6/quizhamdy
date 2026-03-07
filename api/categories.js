import { getCategories } from "../lib/questions.js";
import { MongoClient } from 'mongodb';

let cachedDb = null;
async function getDb() {
  if (cachedDb) return cachedDb;
  // لو مفيش رابط للداتابيز، متعملش كراش
  if (!process.env.MONGODB_URI) return null; 
  
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
    
    // محاولة جلب الأسئلة اللي اتلعبت، ولو حصل خطأ نتجاهله عشان اللعبة تفتح
    if (username) {
      try {
        const db = await getDb();
        if (db) {
          const user = await db.collection('users').findOne({ username });
          if (user && user.playedQuestions) {
            playedQuestions = user.playedQuestions;
          }
        }
      } catch(dbErr) {
        console.error("MongoDB Fetch Error:", dbErr);
      }
    }
    
    // إرسال الكاتيجوريز (بعد استبعاد الملعوب منها)
    res.json(getCategories(playedQuestions)); 
  }
  catch(e) { 
    console.error("Categories API Error:", e);
    res.status(500).json({ error: e.message }); 
  }
}
