import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export async function judgeAnswer(question, correctAnswer, playerAnswer) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    const prompt = `
أنت حكم عبقري ومتساهل وتحكم في مصلحة اللاعب اذا شعرت انه يعرف الاجابة في لعبة مسابقات معلومات عامة.
السؤال: "${question}"
الإجابة النموذجية: "${correctAnswer}"
إجابة اللاعب: "${playerAnswer}"

قواعد التحكيم (احسبها صحيحة في هذه الحالات):
- الإجابة تحمل نفس المعنى أو الفكرة أو مرادف للإجابة النموذجية.
- كتابة جزء كافٍ من الاسم يدل على المعرفة (مثال: ميسي بدلاً من ليونيل ميسي).
- وجود أخطاء إملائية أو اختلاف في الصياغة (بالعامية أو الفصحى).
- اللاعب كتب اجابة تدل على أنه يعلم الاجابة الصحيحة حتى لو كانت غير الاجابة النموذجية تماما

رد بكلمة واحدة فقط: True إذا كانت صحيحة، أو False إذا كانت خاطئة.
    `;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text().trim().toLowerCase();
    
    // التعديل هنا لضمان عدم حدوث خطأ لو الذكاء الاصطناعي رد بالعربي
    return responseText.includes('true') || responseText.includes('صح');
    
  } catch (error) {
    console.error("Gemini API Error:", error);
    return false; 
  }
}
