import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export async function judgeAnswer(question, correctAnswer, playerAnswer) {
  try {
    // ١. التنظيف والتحقق اليدوي المباشر (للإجابات المتطابقة والسرعة)
    const cleanCorrect = correctAnswer.trim().toLowerCase();
    const cleanPlayer = playerAnswer.trim().toLowerCase();
    
    if (cleanPlayer === cleanCorrect) {
      return true;
    }
    
    if (cleanCorrect.includes(cleanPlayer) || cleanPlayer.includes(cleanCorrect)) {
        if (cleanPlayer.length >= Math.min(cleanCorrect.length - 2, 3)) {
            return true;
        }
    }

    // ٢. استخدام موديل Pro الأذكى والأدق للحالات المعقدة
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
    
    const prompt = `
أنت حكم عبقري ومتساهل في لعبة مسابقات معلومات عامة.
السؤال: "${question}"
الإجابة النموذجية: "${correctAnswer}"
إجابة اللاعب: "${playerAnswer}"

قواعد التحكيم (احسبها صحيحة في هذه الحالات):
- الإجابة تحمل نفس المعنى أو الفكرة أو مرادف للإجابة النموذجية.
- كتابة جزء كافٍ من الاسم يدل على المعرفة (مثال: ميسي بدلاً من ليونيل ميسي).
- وجود أخطاء إملائية أو اختلاف في الصياغة (بالعامية أو الفصحى).

رد بكلمة واحدة فقط باللغة الإنجليزية: TRUE أو FALSE.
    `;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text().trim().toLowerCase();
    
    return responseText.includes('true') || responseText.includes('صح');
    
  } catch (error) {
    console.error("Gemini API Error:", error);
    return false; 
  }
}
