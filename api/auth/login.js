import { getDb } from '../../lib/mongodb.js';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "يرجى إدخال البيانات" });
  }

  try {
    const db = await getDb();
    const usersCol = db.collection('users');

    const user = await usersCol.findOne({ username: username.trim() });
    
    // التحقق من الباسورد
    if (user && await bcrypt.compare(password, user.password)) {
      const token = uuidv4(); // تجديد التوكن
      await usersCol.updateOne({ _id: user._id }, { $set: { token: token } });
      return res.json({ token, username });
    }

    res.status(400).json({ error: "بيانات الدخول غير صحيحة" });
  } catch (error) {
    res.status(500).json({ error: "خطأ في السيرفر" });
  }
}