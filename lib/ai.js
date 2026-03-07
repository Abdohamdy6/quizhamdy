import { GoogleGenerativeAI } from '@google/generative-ai';
import { distance } from 'fastest-levenshtein'; // مكتبة خفيفة جداً للتشابه الإملائي

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export async function judgeAnswer(question, correctAnswer, playerAnswer) {
    try {
        // 1. التنظيف الأولي (Normalization)
        const normalize = (str) => {
            return str.trim().toLowerCase()
                .replace(/[أإآ]/g, 'ا')
                .replace(/ة/g, 'ه')
                .replace(/ى/g, 'ي')
                .replace(/^ال/g, '') // إزالة ال التعريف في بداية الكلمة
                .replace(/\sال/g, ' ') // إزالة ال التعريف بعد المسافات
                .replace(/[^\w\s\u0600-\u06FF]/g, ''); // إزالة الرموز
        };

        const nCorrect = normalize(correctAnswer);
        const nPlayer = normalize(playerAnswer);

        // --- الفلتر 1: التطابق المباشر (مجاني 100%) ---
        if (nPlayer === nCorrect || nCorrect.includes(nPlayer) || nPlayer.includes(nCorrect)) {
            if (nPlayer.length >= 2) return true;
        }

        // --- الفلتر 2: التشابه الإملائي (Levenshtein) ---
        // إذا كان الخطأ في حرف أو حرفين فقط (حسب طول الكلمة)
        const dist = distance(nCorrect, nPlayer);
        const threshold = nCorrect.length > 5 ? 2 : 1; 
        if (dist <= threshold) return true;

        // --- الفلتر 3: الكلمات المفتاحية (Keywords) ---
        // لو الإجابة النموذجية طويلة، بنشوف لو اللاعب جاب الكلمة الأساسية
        const correctWords = nCorrect.split(' ').filter(w => w.length > 2);
        const playerWords = nPlayer.split(' ').filter(w => w.length > 2);
        const commonWords = correctWords.filter(w => playerWords.includes(w));
        
        if (commonWords.length > 0 && correctWords.length <= 2) {
            return true; // إذا كانت الإجابة قصيرة واللاعب جاب كلمة صح منها
        }

        // --- الفلتر النهائي: الاستعانة بـ Gemini (للحالات الجدلية فقط) ---
        // هنا فقط نصرف من الـ 50 طلب اليومية
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
    
    return responseText.includes('true') || responseText.includes('صح');
    
  } catch (error) {
    console.error("Gemini API Error:", error);
    // لعدم تعطيل اللعب في حال انقطاع الاتصال بخوادم جوجل
    return false; 
  }
}
