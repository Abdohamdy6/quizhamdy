import { GoogleGenerativeAI } from '@google/generative-ai';

// ربط المفتاح من المتغيرات البيئية
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export async function judgeAnswer(question, correctAnswer, playerAnswer) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    // تم تعديل التلقين ليكون شديد الذكاء والمرونة
    const prompt = `
أنت حكم عبقري ومتساهل وذكي جداً في لعبة مسابقات معلومات عامة.
السؤال: "${question}"
الإجابة النموذجية: "${correctAnswer}"
إجابة اللاعب: "${playerAnswer}"

مهمتك هي تقييم إجابة اللاعب بمرونة وذكاء بشري. يجب أن تعتبر الإجابة "صحيحة" في الحالات التالية:
1. إذا كانت تحمل نفس المعنى أو مرادفاً للإجابة النموذجية.
2. إذا كتب اللاعب جزءاً كافياً وواضحاً من الاسم يدل على معرفته (مثلاً "ميسي" بدلاً من "ليونيل ميسي"، أو "أينشتاين" بدلاً من "ألبرت أينشتاين").
3. إذا كان بها أخطاء إملائية ولكن المعنى المقصود واضح وصحيح.
4. إذا كانت صياغة الجملة مختلفة ولكن المضمون الجوهري يطابق الإجابة النموذجية.

أجب بكلمة واحدة فقط: True إذا كانت صحيحة بأي شكل من الأشكال السابقة، أو False إذا كانت خاطئة تماماً أو بعيدة عن المعنى.
    `;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text().trim().toLowerCase();
    
    return responseText.includes('true');
    
  } catch (error) {
    console.error("Gemini API Error:", error);
    return false; 
  }
}
