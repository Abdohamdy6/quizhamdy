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

    // أ- تطابق مباشر (حتى بعد التنظيف)
    if (cleanPlayer === cleanCorrect || cleanCorrect.includes(cleanPlayer) || cleanPlayer.includes(cleanCorrect)) {
      if (cleanPlayer.length >= 2) return true; 
    }

    // ب- تشابه إملائي (لو الفرق حرف واحد فقط) - يوفر الكثير من الطلبات
    if (distance(cleanCorrect, cleanPlayer) <= 1 && cleanCorrect.length > 3) {
      return true;
    }


    // --- 2. استخدام الموديل للحالات الجدلية (البرومت الخاص بك) ---
    // لن نصل هنا إلا إذا فشلت الفلاتر السريعة أعلاه
    
    const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite-preview" });    
    
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
4. اللغات والترجمة: تجاهل أي نصوص إنجليزية أو كلمات بين أقواس في الإجابة النموذجية، وركز على المعنى العربي الأساسي وايضا اذا كانت الكلمة مكتوبة بالعربية او ترجمتها بالانجليزية او اي لغة اخرى احسبها صحيحة طالما انها نفس المعنى.
5. التسامح الإملائي: تجاهل الأخطاء الإملائية البسيطة، والهمزات، والتاء المربوطة/الهاء، وتجاهل وجود أو غياب (ال) التعريف تماماً.

بناءً على فهمك للسؤال، هل إجابة اللاعب صحيحة؟
رد بكلمة واحدة فقط باللغة الإنجليزية: TRUE أو FALSE.
    `;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text().trim().toLowerCase();
    
    // التحقق من الرد
    return responseText.includes('true') || responseText.includes('correct');
    
  } catch (error) {
    console.error("Gemini API Error:", error);
    // في حالة الخطأ، نعتمد على الفحص البرمجي الذي تم في البداية
    return false; 
  }
}
