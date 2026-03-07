import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export async function judgeAnswer(question, correctAnswer, playerAnswer) {
  try {
    // ١. التنظيف والتحقق اليدوي المباشر (تخطي الـ AI للسرعة القصوى)
    let cleanCorrect = correctAnswer.trim().toLowerCase();
    let cleanPlayer = playerAnswer.trim().toLowerCase();
    
    // إزالة (ال) التعريف من الكلمتين لتسهيل التطابق المباشر
    const noAlCorrect = cleanCorrect.replace(/^ال/, '').replace(/\sال/g, ' ');
    const noAlPlayer = cleanPlayer.replace(/^ال/, '').replace(/\sال/g, ' ');

    // لو متطابقين تماماً (حتى بعد شيل الـ)
    if (cleanPlayer === cleanCorrect || noAlPlayer === noAlCorrect) {
      return true;
    }
    
    // لو واحدة جزء من التانية
    if (noAlCorrect.includes(noAlPlayer) || noAlPlayer.includes(noAlCorrect)) {
        if (noAlPlayer.length >= 3 || (noAlPlayer.length === 2 && noAlCorrect.includes(noAlPlayer))) {
            return true;
        }
    }

    // ٢. استخدام موديل Pro الأذكى مع التلقين الجديد المعتمد على "فهم السؤال" والمفرد والجمع
const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });    
    const prompt = `
أنت حكم بشري خبير، عبقري، ومتساهل جداً في لعبة مسابقات معلومات عامة للناطقين باللغة العربية.
مهمتك ليست فقط مقارنة الكلمات، بل **قراءة "السؤال" وفهمه جيداً**، ثم تقييم ما إذا كانت "إجابة اللاعب" تعتبر إجابة صحيحة علمياً ومنطقياً لهذا السؤال، مستعيناً بـ "الإجابة النموذجية" كمرجع.

السؤال: "${question}"
الإجابة النموذجية: "${correctAnswer}"
إجابة اللاعب: "${playerAnswer}"

قواعد التحكيم الصارمة (احسبها صحيحة "TRUE" في هذه الحالات):
1. صحة المعنى للجواب: إذا كانت إجابة اللاعب تجيب على السؤال المذكور أعلاه بشكل صحيح بناءً على معرفتك، حتى لو استخدم كلمات أو مرادفات مختلفة كلياً عن الإجابة النموذجية.
2. المفرد والجمع: الاختلاف بين المفرد والجمع والمثنى لا يهم أبداً (مثال: حصان، أحصنة، خيول، حصانان -> تعتبر كلها صحيحة لنفس المعنى).
3. الاختصارات والشهرة: ذكر جزء من الاسم أو اللقب المشهور يكفي جداً (مثل: "ميسي" لـ "ليونيل ميسي"، أو "كش" لـ "كش ملك").
4. اللغات والترجمة: تجاهل أي نصوص إنجليزية أو كلمات بين أقواس في الإجابة النموذجية، وركز على المعنى العربي الأساسي.
5. التسامح الإملائي: تجاهل الأخطاء الإملائية البسيطة، والهمزات، والتاء المربوطة/الهاء، وتجاهل وجود أو غياب (ال) التعريف تماماً.

بناءً على فهمك للسؤال، هل إجابة اللاعب صحيحة؟
رد بكلمة واحدة فقط باللغة الإنجليزية: TRUE أو FALSE.
    `;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text().trim().toLowerCase();
    
    return responseText.includes('true') || responseText.includes('صح');
    
  } catch (error) {
    console.error("Gemini API Error:", error);
    // لعدم تعطيل اللعب في حال انقطاع الاتصال بخوادم جوجل
    return false; 
  }
}
