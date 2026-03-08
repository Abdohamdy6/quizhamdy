import { GoogleGenerativeAI } from '@google/generative-ai';
import { distance } from 'fastest-levenshtein';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export async function judgeAnswer(question, correctAnswer, playerAnswer) {
  try {
    // --- 1. التنظيف والتحقق البرمجي المسبق (لتوفير الـ API) ---
    const normalize = (str) => {
      if (!str) return "";
      return str.trim().toLowerCase()
        .replace(/[أإآ]/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/ى/g, 'ي')
        .replace(/^ال/, '') 
        .replace(/\sال/g, ' ')
        .replace(/[^\w\s\u0600-\u06FF]/g, ''); // إزالة الرموز
    };

    const cleanCorrect = normalize(correctAnswer);
    const cleanPlayer = normalize(playerAnswer);

    // أ- تطابق مباشر
    if (cleanPlayer === cleanCorrect || cleanCorrect.includes(cleanPlayer) || cleanPlayer.includes(cleanCorrect)) {
      if (cleanPlayer.length >= 2) return true; 
    }

    // ب- تشابه إملائي
    if (distance(cleanCorrect, cleanPlayer) <= 1 && cleanCorrect.length > 3) {
      return true;
    }

    // --- 2. استخدام الموديل للحالات الجدلية ---
    const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite-preview" });    
    
    const prompt = `
أنت حكم بشري خبير، ذكي، وعادل في لعبة مسابقات معلومات عامة للناطقين باللغة العربية.
مهمتك قراءة "السؤال" جيداً، ثم تقييم ما إذا كانت "إجابة اللاعب" تعتبر صحيحة بناءً على "الإجابة النموذجية".

السؤال: "${question}"
الإجابة النموذجية: "${correctAnswer}"
إجابة اللاعب: "${playerAnswer}"

### قواعد القبول (احسبها TRUE في هذه الحالات):
1. المعنى والوصف: إذا كان السؤال يطلب وصفاً أو شرحاً أو حدثاً، واللاعب استخدم كلمات مختلفة أو مرادفات تؤدي لنفس المعنى تماماً.
2. الأسماء والألقاب: إذا كتب اللاعب الاسم الأول فقط، أو اللقب المشهور (مثل: "ميسي" بدلاً من "ليونيل ميسي").
3. التسامح الإملائي واللغوي: تجاهل الأخطاء الإملائية البسيطة، والترجمة للغات أخرى إذا كانت صحيحة المعنى، ولا تحاسبه على المفرد والجمع والمثنى.

### قواعد الرفض الصارمة (احسبها FALSE فوراً في هذه الحالات):
1. الإجابة الناقصة عددياً: إذا كان السؤال يطلب صراحةً شيئين أو شخصين أو أكثر (مثل: "اذكر اسمين..." أو "ما هما الدولتان...") واللاعب ذكر اسماً واحداً فقط.
2. الأسماء والتواريخ والأرقام: يجب أن تكون دقيقة. لا تقبل اسماً مختلفاً لمجرد وجود تشابه في بعض الحروف (مثال: "كومباني" لا تساوي "كارتر").
3. التهرب والحديث الجانبي: أي إجابة تحتوي على عبارات تهرب مثل (لا أعرف، نسيت، ربما، على ما أعتقد، مش متذكر) أو مجرد تكرار للسؤال تعتبر خاطئة حتى لو تضمنت كلمات من الإجابة.

بناءً على فهمك للسؤال والقواعد أعلاه، هل إجابة اللاعب صحيحة؟
رد بكلمة واحدة فقط باللغة الإنجليزية: TRUE أو FALSE.
    `;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text().trim().toLowerCase();
    
    // التحقق من الرد
    return responseText.includes('true') || responseText.includes('correct');
    
  } catch (error) {
    console.error("Gemini API Error:", error);
    return false; 
  }
}
