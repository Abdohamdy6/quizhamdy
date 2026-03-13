import { GoogleGenerativeAI } from '@google/generative-ai';
import { distance } from 'fastest-levenshtein';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export async function judgeAnswer(question, correctAnswer, playerAnswer) {
  try {
    const normalize = (str) => {
      if (!str) return "";
      return str.trim().toLowerCase()
        .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
        .replace(/^ال/, '').replace(/\sال/g, ' ')
        .replace(/[^\w\s\u0600-\u06FF]/g, '');
    };
    const cleanCorrect = normalize(correctAnswer);
    const cleanPlayer  = normalize(playerAnswer);

    // تطابق مباشر أو تشابه إملائي — بدون AI
    if (cleanPlayer === cleanCorrect || cleanCorrect.includes(cleanPlayer) || cleanPlayer.includes(cleanCorrect)) {
      if (cleanPlayer.length >= 2) return true;
    }
    if (distance(cleanCorrect, cleanPlayer) <= 1 && cleanCorrect.length > 3) return true;

    // Gemini — موديل صحيح وسريع
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const prompt = `
أنت حكم في لعبة مسابقات. هل إجابة اللاعب صحيحة؟

السؤال: "${question}"
الإجابة الصحيحة: "${correctAnswer}"
إجابة اللاعب: "${playerAnswer}"

قواعد القبول:
- الاسم الأول أو اللقب المشهور كافٍ
- الأخطاء الإملائية البسيطة مقبولة
- المرادفات والمعنى نفسه مقبول

قواعد الرفض:
- اسم مختلف تماماً
- رقم أو تاريخ خاطئ
- إجابة ناقصة لو السؤال طلب أكثر من شيء
- عبارات تهرب (لا أعرف، نسيت...)

رد بكلمة واحدة فقط: TRUE أو FALSE
    `.trim();

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim().toUpperCase();
    return text.startsWith('TRUE');

  } catch (error) {
    console.error("Gemini Error:", error.message);
    return false;
  }
}
