import { GoogleGenerativeAI } from '@google/generative-ai';

export default async function handler(req, res) {
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite-preview" });
    
    const result = await model.generateContent("رد بكلمة واحدة فقط: ok");
    const text = result.response.text().trim().toLowerCase();
    
    if (text.includes('ok')) {
      return res.status(200).json({ ok: true });
    } else {
      return res.status(500).json({ ok: false });
    }
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}
