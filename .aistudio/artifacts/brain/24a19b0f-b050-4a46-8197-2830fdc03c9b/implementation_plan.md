# خطة تطوير UMEDT إلى منصة تعليمية طبية تفاعلية (Offline-First)

## 1. نظرة عامة وأهداف التطوير
تهدف هذه الخطة إلى ترقية تطبيق **UMEDT** الحالي (`v2.2.3`) من قاموس ومستعرض مقالات إلى **منصة تعليمية طبية تفاعلية متكاملة** تعمل بدون إنترنت (**Offline-First**) على الهواتف الذكية (أندرويد) والويب، مع **الحفاظ الكامل بنسبة 100%** على جميع البيانات الحالية (`1,650` مصطلحاً، `94` جملة سريرية، `25` موضوعاً علمياً تشمل مقررات **Hematology** و **Medical Parasitology**) وعدم المساس بنظام التحديث السحابي والتوقيع الرقمي (`ECDSA-P256-SHA256` و `DB_SCHEMA_VERSION = 2`).

---

## 2. القواعد الصارمة للحفاظ على البيانات والتوافق (Backward Compatibility)
1. **عدم حذف أو استبدال أي سجل حالي:** تبقى مصفوفات `INITIAL_TERMS` و `INITIAL_TOPICS` وملفات `/data/master/topics.json` و `/data/master/terms.json` واختبارات التحقق (`scripts/verify-master-data.ts` و `scripts/verify-release-readiness.ts`) سليمة ومتوافقة بالكامل.
2. **التصنيف الهرمي التلقائي غير الهدّام (Auto-Classification Migration):**
   - تُصنَّف المواضيع الـ 25 الحالية تلقائياً ضمن بلوكات ومواد طبية قياسية قابلة للتعديل:
     - **Hematology & Blood Disorders Block** ← مادة **Clinical & Laboratory Hematology** (تضم المواضيع `topic-heme-01` إلى `topic-heme-10` والمواضيع المرتبطة).
     - **Infectious Diseases & Microbiology Block** ← مادة **Medical Parasitology** (تضم المواضيع `pt-parasito-01-foundations` إلى `pt-parasito-08-mcq-viva`).
     - **Clinical Medicine & Diagnostics Block** ← مواد **Cardiopulmonary Medicine** و **Medical AI & Bioinformatics**.
3. **التحويل التلقائي ثنائي الاتجاه للفقرات والوسائط (`Content Blocks`):**
   - أي موضوع قديم يحتوي على `sections[].paragraphs` و `images` و `links` و `attachments` يتم تحويله تلقائياً أثناء القراءة والتحرير إلى `Content Blocks` مرتبة، مع استمرار مزامنة الحقول الأصلية لضمان توافق الحزم السحابية (`OTA Packages`).

---

## 3. المعمارية والملفات المتأثرة

### أ. طبقة النماذج والأنواع (`src/types/lexicon.ts` + `src/types/learningPlatform.ts`)
- **`MedicalBlock` & `MedicalSubject`:** كيانات البلوكات والمواد مع عنوان إنجليزي أكاديمي أساسي (`titleEn`) وترجمة عربية دقيقة في حقل مستقل (`titleAr`)، ووصف، ولون/أيقونة، وإمكانية ربط موضوع بعدة مواضيع مترابطة (`relatedTopicIds`) أو إنشاء مادة مستقلة.
- **`TopicContentBlock`:** وحدة البناء الأساسية داخل كل `TopicSection` وتدعم الأنواع التسعة المطلوبة بترتيب حر:
  1. `heading` (Headings & Subheadings — `textEn`, `textAr`, `level`)
  2. `paragraph` (Paragraphs — نص علمي غني مع اكتشاف المصطلحات التلقائي)
  3. `table` (Tables — جداول مقارنة وتشخيصية منظمة بـ `headers` و `rows`)
  4. `image` (Images & Diagrams — صور وأشكال توضيحية في موضعها الدقيق داخل الشرح)
  5. `video_link` (Videos & External Links — روابط فيديو ومراجع خارجية)
  6. `audio` (Audio & Voice Recordings — ملفات صوتية أو تسجيل صوتي مباشر من الميكروفون أو رابط صوتي)
  7. `attachment` (Files & Attachments — ملفات PDF ومستندات مرفقة في سياق القسم)
  8. `question` (Interactive Questions — سؤال تفاعلي مدمج مباشرة داخل الشرح مع تصحيح فوري)
  9. `clinical_note` (Important Notes & Clinical Correlations — ملاحظات سريرية وتنبيهات مهمة)
- **`UnifiedQuizQuestion` & `QuizAttemptRecord`:** نموذج موحد للاختبارات يدعم الأنواع السبعة:
  - `single_choice` (Single Best Answer - MCQ)
  - `multiple_select` (Multiple Select)
  - `true_false` (True / False)
  - `matching` (Matching Pairs)
  - `fill_blank` (Fill in the Blank)
  - `short_answer` (Short Answer)
  - `image_based` (Image-based Clinical Question)
  - مع ربط كل سؤال بـ (`blockId`, `subjectId`, `topicId`, `linkedTermIds`, `explanationEn`, `explanationAr`).
- **توسيع `DictionaryTerm`:** إضافة حقول اختيارية لربط المصطلح بالمواضيع والمواد (`linkedTopicIds?: string[]`, `linkedSubjectIds?: string[]`, `linkedBlockIds?: string[]`, `studiedHistory?: Array<{ studiedAt: string; context: string }>`).

### ب. طبقة التخزين والخدمات (`src/services/`)
1. **`src/services/mediaStorageService.ts` (جديد):**
   - قاعدة بيانات محلية `IndexedDB` (`umedt_media_store_v1`) لحفظ التسجيلات الصوتية المسجلة مباشرة من الميكروفون (`MediaRecorder` بصيغة `audio/webm` أو `audio/mp4`) والملفات المرفقة (`PDF` والصور) مع فحص حد الحجم الآمن (`Max 15MB per file` ومؤشر استهلاك الذاكرة) ودعم الروابط الخارجية عند الاتصال بالإنترنت.
2. **`src/services/learningHierarchyService.ts` (جديد):**
   - إدارة هيكل `Block ← Subject ← Topic ← Section ← ContentBlock`، والترحيل التلقائي للمواضيع الـ 25 الحالية، وسجل **Recent Learning**، وربط المصطلحات بالمواضيع والمواد مع منع التكرار.
3. **`src/services/quizEngineService.ts` (جديد):**
   - استخراج الأسئلة الحالية تلقائياً من مواضيع المراجعة (`pt-parasito-08-mcq-viva` وأسئلة أمراض الدم) إلى بنك الأسئلة التفاعلي.
   - محلل ومدقق ذكي لإدخال الأسئلة بـ 3 طرق:
     1. الإدخال اليدوي سؤالاً بسؤال.
     2. لصق مجموعة أسئلة نصية دفعة واحدة وفق قالب واضح.
     3. استيراد ملف (`JSON` كصيغة أساسية، بالإضافة إلى `CSV` و `TXT`).
   - مدقق آلي قبل الحفظ (`QuizValidator`) يكشف نقص الخيارات أو غياب الإجابة الصحيحة أو أخطاء التنسيق، ويعرض **معاينة تفاعلية (Live Preview)** مع تحديد رقم السطر/السؤال وتصحيحه قبل الاعتماد.
4. **`src/services/exportDownloadService.ts` (جديد):**
   - نظام تنزيل وتصدير موثوق متوافق مع Android WebView / Capacitor والمتصفحات، يتحقق من نجاح تكوين الـ Blob وحجمه قبل إظهار رسالة النجاح، ويدعم **التنزيل المباشر للجهاز** + **مشاركة الملف الأصلية على أندرويد (Share File)** + **روابط GitHub المباشرة**، ويوفر التصدير المستقل لـ:
     - جميع المصطلحات (`JSON` / `CSV`)
     - مصطلحات مادة محددة أو بلوك محدد (`JSON` / `CSV`)
     - موضوع واحد كامل مع وسائطه وأسئلته (`JSON`)
     - مادة كاملة (`JSON`)
     - بلوك كامل (`JSON`)
     - الاختبارات ونتائجها (`JSON` / `CSV`)

### ج. طبقة الواجهات وتجربة المستخدم (`src/components/`)
- **`src/components/TopicsHub.tsx` (إعادة هيكلة شاملة متوافقة مع الهاتف أولاً):**
  - تنظيم الصفحة الرئيسية للمواضيع إلى 6 مسارات واضحة وسريعة الوصول:
    1. **Blocks** (البلوكات الطبية)
    2. **Subjects** (المواد الدراسية المستقلة أو التابعة لبلوك)
    3. **Topics** (المواضيع العلمية بعناوين إنجليزية أكاديمية أساسية وترجمة عربية دقيقة)
    4. **Recent Learning** (سجل آخر المواضيع والمواد المدروسة)
    5. **Saved Terms** (المصطلحات المحفوظة والمرتبطة بالمواضيع مع سجل دراستها)
    6. **Tests & Results** (بنك الاختبارات، مولّد الاختبارات المخصصة لعدة مواضيع، سجل النتائج، وإعادة الأسئلة الخاطئة)
  - **شريط مسار هرمي (`Breadcrumbs`):** للتنقل الفوري بين `Block / Subject / Topic / Section`.
  - **الصفحات الانبثاقية (`Bottom Sheets & Modals`):** لتصفح قوائم العناوين، اختيار البلوك/المادة، إضافة الكتل (`Content Blocks`), معاينة المصطلحات من أي مكان في التطبيق، وخيارات التنزيل والتصدير.
- **`src/components/TopicContentBlockEditor.tsx` & `src/components/VoiceRecorderBlock.tsx` (جديد):**
  - محرر وعارض الكتل التفاعلي مع أزرار إعادة الترتيب (أعلى/أسفل)، إضافة الجداول، رفع الصور والـ PDF في نفس موضع الشرح، ومسجل صوتي مباشر من الميكروفون مع عداد زمني وتشغيل فوري.
- **`src/components/QuizCenterModal.tsx` (جديد):**
  - واجهة الاختبارات الموحدة: تشغيل الاختبار (تحديد عدد الأسئلة، خلط عشوائي، مؤقت زمني اختياري، تصحيح فوري أو في نهاية الاختبار، عرض التفسير العلمي، مراجعة الأخطاء وإعادة المحاولة) + استوديو إضافة واستيراد الأسئلة مع المعاينة وكشف الأخطاء.

---

## 4. مراحل التنفيذ والاختبار التدريجي

1. **المرحلة 1 (النماذج، الترحيل الآمن، وهيكل البلوكات والمواد):**
   - إنشاء `src/types/learningPlatform.ts` وتحديث `src/types/lexicon.ts` دون كسر التوافق.
   - بناء `learningHierarchyService.ts` و `mediaStorageService.ts` وترحيل المواضيع الـ 25 الحالية تلقائياً إلى البلوكات والمواد مع الحفاظ على `DB_SCHEMA_VERSION = 2`.
2. **المرحلة 2 (محرر وعارض الكتل `Content Blocks` والوسائط المدمجة والتسجيل الصوتي):**
   - بناء عارض ومحرر `Content Blocks` التسعة في موضعها الدقيق داخل كل قسم، مع دعم الجداول، الصور الموضعية، الملاحظات السريرية، ملفات PDF، والتسجيل الصوتي الحي في `IndexedDB`.
3. **المرحلة 3 (محرك الاختبارات التفاعلي الموحد واستيراد الأسئلة الذكي):**
   - بناء `quizEngineService.ts` وواجهة `QuizCenterModal.tsx` مع استخراج أسئلة الطفيليات والدم الحالية تلقائياً، ودعم الأنواع السبعة، والإدخال اليدوي/النصي/JSON مع المعاينة وكشف الأخطاء وتصحيحها.
4. **المرحلة 4 (تطوير صفحة المواضيع، القاموس المتكامل، والصفحات الانبثاقية):**
   - تحديث `TopicsHub.tsx` و `LibraryView.tsx` لدعم المسارات الستة، الـ `Breadcrumbs`, البحث الشامل، الحفظ التلقائي للمصطلحات مع ربطها بالموضوع والمادة، وسجل المصطلحات المدروسة.
5. **المرحلة 5 (نظام التصدير والتنزيل المتوافق مع أندرويد والاختبار الشامل):**
   - بناء `exportDownloadService.ts` وواجهة التصدير المفصل (`JSON` / `CSV` + مشاركة أندرويد + روابط GitHub)، وتشغيل جميع فحوصات البناء والاختبار (`compile_applet`, `lint_applet`, `npm test`).
