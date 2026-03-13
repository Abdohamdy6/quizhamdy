import { getDb } from '../../lib/mongodb.js';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "يرجى إدخال اسم المستخدم وكلمة المرور" });
  }

  try {
    const db = await getDb();
    const usersCol = db.collection('users');

    const existingUser = await usersCol.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ error: "اسم المستخدم موجود بالفعل" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const token = uuidv4();

    await usersCol.insertOne({
      username: username.trim(),
      password: hashedPassword,
      token: token
    });

    res.json({ token, username });
  } catch (error) {
    res.status(500).json({ error: "خطأ في السيرفر" });
  }
}