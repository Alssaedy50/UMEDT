import {
  TermExample,
  TermMorphology,
  SpacedRepetitionData,
  LexiconCategory,
  DictionaryTerm,
  SentenceSourceType,
  LinkedSentence,
  AmbiguousCandidate,
  AbbreviationCategory,
  ClinicalAbbreviation,
  MorphologicalAffix,
  ClinicalBenchmarkCase
} from '../types/lexicon';

export type {
  TermExample,
  TermMorphology,
  SpacedRepetitionData,
  LexiconCategory,
  DictionaryTerm,
  SentenceSourceType,
  LinkedSentence,
  AmbiguousCandidate,
  AbbreviationCategory,
  ClinicalAbbreviation,
  MorphologicalAffix,
  ClinicalBenchmarkCase
};

export const INITIAL_TERMS: DictionaryTerm[] = [
  // ==========================================================================
  // 1. CORE & PHASE 3 MEDICAL LEXICON (WHO UMD STANDARD)
  // ==========================================================================
  {
    id: 'm1',
    term: 'Myocardial Infarction',
    termNormalized: 'myocardial infarction',
    translation: 'احتشاء عضلة القلب',
    phonetic: '/ˌmaɪəˈkɑːrdiəl ɪnˈfɑːrkʃən/',
    pos: 'Noun · تشخيص سريري',
    category: 'Medical',
    specialty: 'Cardiology · أمراض القلب',
    umdCode: 'UMD-I21.9',
    keepEnglish: true,
    favorite: true,
    collections: ['طب الطوارئ والقلب', 'مراجعة أساسية'],
    ingestedAt: 'قاعدة المعجم الطبي الموحد (UMD)',
    definitionAr:
      'نخر إقفاري حاد في نسيج عضلة القلب ناتج عن انسداد الشريان التاجي وانقطاع التروية، مما يسبب حالة Ischemia مطوّلة وتلفاً خلوياً غير عكوس. يترافق سريرياً مع ألم صدري عاصر وعلامات Tachycardia أو Arrhythmia بطينية، ويتطلب إجراء Differential Diagnosis عاجل وتدخلاً قسطرياً.',
    definitionEn:
      'Acute ischemic necrosis of heart muscle tissue caused by prolonged coronary Ischemia, frequently accompanied by Tachycardia or life-threatening Arrhythmia.',
    clinicalNote:
      'وفق المعجم الطبي الموحد (WHO UMD): يُترجم المصطلح دائماً إلى "احتشاء عضلة القلب" مع إبقاء المصطلح الإنجليزي بين قوسين في تقارير الخروج السريرية.',
    morphology: {
      prefix: { affix: 'Myo-', meaningAr: 'عضلي', meaningEn: 'Muscle' },
      root: { affix: 'cardi', meaningAr: 'القلب', meaningEn: 'Heart' },
      suffix: { affix: '-al / Infarction', meaningAr: 'احتشاء / نخر وعائي', meaningEn: 'Tissue necrosis due to obstruction' },
      literalSynthesisAr: 'احتشاء النسيج العضلي القلبي'
    },
    examples: [
      {
        en: 'Prolonged coronary Ischemia rapidly progresses into an acute Myocardial Infarction if blood flow is not restored.',
        ar: 'يتطور نقص التروية التاجي المطول سريعاً إلى احتشاء عضلة القلب الحاد إذا لم تتم استعادة تدفق الدم.'
      },
      {
        en: 'Emergency physicians perform a rapid Differential Diagnosis to distinguish Myocardial Infarction from Pulmonary Embolism.',
        ar: 'يجري أطباء الطوارئ تشخيصاً تفريقياً سريعاً للتمييز بين احتشاء عضلة القلب والانصمام الرئوي.'
      }
    ],
    relations: {
      synonyms: ['Heart Attack', 'Acute Coronary Syndrome'],
      broader: ['Differential Diagnosis', 'Pathophysiology'],
      related: ['Ischemia', 'Angina Pectoris', 'Tachycardia', 'Arrhythmia', 'Atherosclerosis']
    }
  },
  {
    id: 'm2',
    term: 'Ischemia',
    termNormalized: 'ischemia',
    translation: 'نقص التروية الدموية (الإقفار)',
    phonetic: '/ɪˈskiːmiə/',
    pos: 'Noun · آلية مرضية',
    category: 'Medical',
    specialty: 'Pathology & Vascular · الأمراض الوعائية',
    umdCode: 'UMD-I99.8',
    keepEnglish: true,
    favorite: false,
    collections: ['طب الطوارئ والقلب'],
    ingestedAt: 'قاعدة المعجم الطبي الموحد (UMD)',
    definitionAr:
      'قصور في الإمداد الدموي الشرياني الواصل إلى نسيج أو عضو حيوي، مما يؤدي إلى عوز الأكسجين الخلوي وضعف نقل الغازات عبر Hemoglobin داخل Erythrocyte. تُعد دراسة Pathophysiology الخاصة بحالة Ischemia الأساس لمنع التحول إلى Myocardial Infarction أو Ischemic Stroke.',
    definitionEn:
      'Inadequate blood supply to an organ or tissue due to arterial obstruction, central to the Pathophysiology of Myocardial Infarction and Ischemic Stroke.',
    clinicalNote: 'يُعتمد مصطلح "الإقفار" أو "نقص التروية الدموية" في المعجم الطبي الموحد حسب السياق التشريحي.',
    morphology: {
      prefix: { affix: 'Isch-', meaningAr: 'احتباس / كبح', meaningEn: 'Restriction / suppression' },
      root: { affix: 'hem', meaningAr: 'الدم', meaningEn: 'Blood' },
      suffix: { affix: '-ia', meaningAr: 'حالة مرضية', meaningEn: 'Pathological condition' },
      literalSynthesisAr: 'حالة انحباس الدم عن النسيج'
    },
    examples: [
      {
        en: 'Silent cerebral Ischemia can occur without immediate neurological deficits.',
        ar: 'يمكن أن يحدث نقص التروية الدموية الدماغي الصامت دون عجز عصبي فوري.'
      },
      {
        en: 'Understanding the cellular Pathophysiology of Ischemia helps prevent irreversible Myocardial Infarction.',
        ar: 'يساعد فهم الفيزيولوجيا المرضية الخلوية لحالة نقص التروية الدموية في منع احتشاء عضلة القلب غير العكوس.'
      }
    ],
    relations: {
      synonyms: ['Hypoperfusion', 'Vascular Restriction'],
      broader: ['Pathophysiology'],
      related: ['Myocardial Infarction', 'Angina Pectoris', 'Ischemic Stroke', 'Tachycardia', 'Anemia']
    }
  },
  {
    id: 'm3',
    term: 'Tachycardia',
    termNormalized: 'tachycardia',
    translation: 'تسرّع القلب',
    phonetic: '/ˌtækɪˈkɑːrdiə/',
    pos: 'Noun · علامة سريرية',
    category: 'Medical',
    specialty: 'Cardiology · أمراض القلب',
    umdCode: 'UMD-R00.0',
    keepEnglish: true,
    favorite: false,
    collections: ['طب الطوارئ والقلب'],
    ingestedAt: 'قاعدة المعجم الطبي الموحد (UMD)',
    definitionAr:
      'تسارع نظم القلب ليتجاوز 100 نبضة في الدقيقة وقت الراحة. يُصنف ضمن طيف اضطرابات Arrhythmia، وقد ينشأ كاستجابة معاوضة في حالات Anemia الشديدة أو Hypovolemic Shock أو كعلامة منذرة بحدوث Ischemia أو Myocardial Infarction.',
    definitionEn:
      'A heart rate exceeding 100 beats per minute at rest, classified under Arrhythmia and frequently triggered by Ischemia, Hypovolemic Shock, or Anemia.',
    clinicalNote: 'تركيب قياسي من السابقة اليونانية Tachy- (سريع) والجذر cardi (قلب).',
    morphology: {
      prefix: { affix: 'Tachy-', meaningAr: 'تسارع / فرط السرعة', meaningEn: 'Fast / rapid' },
      root: { affix: 'cardi', meaningAr: 'القلب', meaningEn: 'Heart' },
      suffix: { affix: '-ia', meaningAr: 'حالة سريرية', meaningEn: 'Clinical state' },
      literalSynthesisAr: 'حالة تسارع نبض القلب'
    },
    examples: [
      {
        en: 'Ventricular Tachycardia is a life-threatening Arrhythmia that requires immediate intervention.',
        ar: 'يُعد تسرّع القلب البطيني اضطراب نظم مهدداً للحياة يتطلب تدخلاً فورياً.'
      },
      {
        en: 'Patients presenting with chest pain and Tachycardia must be evaluated for Myocardial Infarction and Pulmonary Embolism.',
        ar: 'يجب تقييم المرضى الذين يحضرون بألم صدري مع تسرّع القلب لاستبعاد احتشاء عضلة القلب والانصمام الرئوي.'
      }
    ],
    relations: {
      synonyms: ['Rapid Heart Rate', 'Tachyarrhythmia'],
      broader: ['Arrhythmia', 'Pathophysiology'],
      related: ['Myocardial Infarction', 'Atrial Fibrillation', 'Hypovolemic Shock', 'Anemia']
    }
  },
  {
    id: 'm4',
    term: 'Arrhythmia',
    termNormalized: 'arrhythmia',
    translation: 'اضطراب النظم القلبي',
    phonetic: '/əˈrɪðmiə/',
    pos: 'Noun · اضطراب فيزيولوجي',
    category: 'Medical',
    specialty: 'Electrophysiology · فسلجة القلب الكهربائية',
    umdCode: 'UMD-I49.9',
    keepEnglish: true,
    favorite: true,
    collections: ['طب الطوارئ والقلب'],
    ingestedAt: 'قاعدة المعجم الطبي الموحد (UMD)',
    definitionAr:
      'اختلال في توليد أو توصيل السيالة الكهربائية في عضلة القلب، مما يسبب نبضاً متسارعاً مثل Tachycardia أو غير منتظم مثل Atrial Fibrillation. ترتبط Pathophysiology هذا الاضطراب غالباً ببؤر Ischemia أو ندبات تالية لحالة Myocardial Infarction.',
    definitionEn:
      'Irregularity in the electrical conduction system of the heart, encompassing Tachycardia and Atrial Fibrillation, often triggered by Ischemia or Myocardial Infarction.',
    morphology: {
      prefix: { affix: 'A-', meaningAr: 'انعدام / غياب', meaningEn: 'Without / absence of' },
      root: { affix: 'rhythm', meaningAr: 'إيقاع / نظم', meaningEn: 'Rhythm' },
      suffix: { affix: '-ia', meaningAr: 'حالة مرضية', meaningEn: 'Condition' },
      literalSynthesisAr: 'حالة غياب انتظام النظم القلبي'
    },
    examples: [
      {
        en: 'Continuous ECG telemetry detects subtle Arrhythmia episodes following Myocardial Infarction.',
        ar: 'يكتشف رصد تخطيط القلب المستمر نوبات اضطراب النظم القلبي الدقيقة عقب احتشاء عضلة القلب.'
      },
      {
        en: 'Electrolyte imbalance and myocardial Ischemia frequently precipitate supraventricular Arrhythmia such as Atrial Fibrillation.',
        ar: 'يؤدي اختلال الشوارد ونقص تروية عضلة القلب غالباً إلى تحريض اضطراب النظم القلبي فوق البطيني مثل الرجفان الأذيني.'
      }
    ],
    relations: {
      synonyms: ['Cardiac Dysrhythmia', 'Irregular Heartbeat'],
      broader: ['Pathophysiology'],
      related: ['Tachycardia', 'Atrial Fibrillation', 'Myocardial Infarction', 'Ischemia']
    }
  },
  {
    id: 'm5',
    term: 'Hyperbilirubinemia',
    termNormalized: 'hyperbilirubinemia',
    translation: 'فرط بيليروبين الدم',
    phonetic: '/ˌhaɪpərbɪlɪˌruːbɪˈniːmiə/',
    pos: 'Noun · علامة مخبرية وسريرية',
    category: 'Medical',
    specialty: 'Hepatology · أمراض الكبد والجهاز الهضمي',
    umdCode: 'UMD-E80.6',
    keepEnglish: true,
    favorite: true,
    collections: ['الطب الباطني والكبد', 'مراجعة أساسية'],
    ingestedAt: 'قاعدة المعجم الطبي الموحد (UMD)',
    definitionAr:
      'ارتفاع تركيز صبغة البيليروبين في مصل الدم فوق الحد الفسيولوجي الطبيعي نتيجة انحلال Erythrocyte المتسارع أو انسداد القنوات الصفراوية كما في Cholecystolithiasis أو قصور الخلية الكبدية في Hepatic Cirrhosis.',
    definitionEn:
      'Excessive concentration of bilirubin in the blood, resulting from accelerated Erythrocyte hemolysis, Hepatic Cirrhosis, or biliary obstruction such as Cholecystolithiasis.',
    clinicalNote: 'مثال قياسي للمحلل الصرفي: Hyper- (فرط) + bilirubin (بيليروبين) + -emia (في الدم).',
    morphology: {
      prefix: { affix: 'Hyper-', meaningAr: 'فرط / ارتفاع فوق الطبيعي', meaningEn: 'Excessive / above normal' },
      root: { affix: 'bilirubin', meaningAr: 'البيليروبين (صبغة الصفراء)', meaningEn: 'Bilirubin pigment' },
      suffix: { affix: '-emia', meaningAr: 'في الدم (حالة دموية)', meaningEn: 'Blood condition' },
      literalSynthesisAr: 'فرط تركيز البيليروبين في الدم'
    },
    examples: [
      {
        en: 'Conjugated Hyperbilirubinemia often points to biliary tract obstruction or Cholecystolithiasis.',
        ar: 'يشير فرط بيليروبين الدم المقترن غالباً إلى انسداد المسالك الصفراوية أو تحصّي المرارة.'
      },
      {
        en: 'Accelerated Erythrocyte hemolysis releases excess Hemoglobin, leading to unconjugated Hyperbilirubinemia and Anemia.',
        ar: 'يؤدي انحلال كريات الدم الحمراء المتسارع إلى تحرير فائض الهيموغلوبين، مما يسبب فرط بيليروبين الدم غير المقترن وفقر الدم.'
      }
    ],
    relations: {
      synonyms: ['Jaundice Biochemical Marker', 'Elevated Serum Bilirubin'],
      broader: ['Pathophysiology'],
      related: ['Cholecystolithiasis', 'Hepatic Cirrhosis', 'Erythrocyte', 'Hemoglobin', 'Anemia']
    }
  },
  {
    id: 'm6',
    term: 'Cholecystolithiasis',
    termNormalized: 'cholecystolithiasis',
    translation: 'تحصّي المرارة (الحصيات المرارية)',
    phonetic: '/ˌkoʊlɪˌsɪstoʊlɪˈθaɪəsɪs/',
    pos: 'Noun · تشخيص جراحي هضمي',
    category: 'Medical',
    specialty: 'General Surgery · الجراحة العامة والهضمية',
    umdCode: 'UMD-K80.2',
    keepEnglish: true,
    favorite: false,
    collections: ['الطب الباطني والكبد'],
    ingestedAt: 'قاعدة المعجم الطبي الموحد (UMD)',
    definitionAr:
      'تشكّل حصيات صلبة داخل الحويصل الصفراوي (المرارة)، وقد تؤدي هجرة الحصية إلى القناة الجامعة لحدوث انسداد صفراوي ومضاعفات Hyperbilirubinemia أو تحريض Acute Pancreatitis.',
    definitionEn:
      'The presence or formation of gallstones inside the gallbladder, capable of causing biliary colic, obstructive Hyperbilirubinemia, and Acute Pancreatitis.',
    morphology: {
      prefix: { affix: 'Chole- + cysto-', meaningAr: 'الصفراء + الحويصل (المرارة)', meaningEn: 'Bile + bladder (Gallbladder)' },
      root: { affix: 'lith', meaningAr: 'حصاة', meaningEn: 'Stone / calculus' },
      suffix: { affix: '-iasis', meaningAr: 'حالة تولّد أو وجود مرضي', meaningEn: 'Abnormal presence / formation' },
      literalSynthesisAr: 'حالة تكوّن الحصيات في الحويصل الصفراوي (المرارة)'
    },
    examples: [
      {
        en: 'Ultrasound confirmed Cholecystolithiasis in the patient presenting with right upper quadrant pain and Hyperbilirubinemia.',
        ar: 'أكد التصوير بالأمواج فوق الصوتية وجود تحصّي المرارة لدى المريض الذي حضر بألم في المراق الأيمن وفرط بيليروبين الدم.'
      },
      {
        en: 'Impacted gallstones from Cholecystolithiasis frequently trigger biliary Acute Pancreatitis.',
        ar: 'تؤدي الحصيات المرارية المنحشرة الناجمة عن تحصّي المرارة غالباً إلى تحريض التهاب البنكرياس الحاد الصفراوي.'
      }
    ],
    relations: {
      synonyms: ['Gallstones', 'Cholelithiasis'],
      broader: ['Differential Diagnosis'],
      related: ['Hyperbilirubinemia', 'Acute Pancreatitis', 'Pathophysiology']
    }
  },
  {
    id: 'm7',
    term: 'Hemoglobin',
    termNormalized: 'hemoglobin',
    translation: 'الهيموغلوبين (خضاب الدم)',
    phonetic: '/ˈhiːməɡloʊbɪn/',
    pos: 'Noun · بروتين ناقل',
    category: 'Medical',
    specialty: 'Hematology · أمراض الدم',
    umdCode: 'UMD-D50.9',
    keepEnglish: true,
    favorite: true,
    collections: ['أمراض الدم والمختبر'],
    ingestedAt: 'قاعدة المعجم الطبي الموحد (UMD)',
    definitionAr:
      'بروتين معدني حامل للحديد يوجد داخل Erythrocyte، ويضطلع بوظيفة نقل الأكسجين من الحويصلات الرئوية إلى الأنسجة لمنع حدوث Ischemia. يؤدي انخفاض مستواه السريري إلى تشخيص حالة Anemia.',
    definitionEn:
      'Iron-containing oxygen-transport metalloprotein in the Erythrocyte of vertebrates; its deficiency defines Anemia.',
    morphology: {
      prefix: { affix: 'Hemo-', meaningAr: 'دموي / هيم', meaningEn: 'Blood / heme group' },
      root: { affix: 'glob', meaningAr: 'كروي (بروتين الغلوبين)', meaningEn: 'Globular protein' },
      suffix: { affix: '-in', meaningAr: 'مادة كيميائية / بروتين', meaningEn: 'Neutral substance / protein' },
      literalSynthesisAr: 'البروتين الكروي الدموي (خضاب الدم)'
    },
    examples: [
      {
        en: 'Hemoglobin carries oxygen inside each Erythrocyte to prevent tissue Ischemia.',
        ar: 'ينقل الهيموغلوبين الأكسجين داخل كل كرية دم حمراء لمنع نقص تروية الأنسجة.'
      },
      {
        en: 'A drop in serum Hemoglobin concentration below 7 g/dL indicates severe Anemia requiring transfusion.',
        ar: 'يدل انخفاض تركيز الهيموغلوبين في المصل دون 7 غ/دل على فقر الدم الشديد الذي يستدعي نقل الدم.'
      }
    ],
    relations: {
      synonyms: ['Haemoglobin', 'Hgb'],
      broader: ['Pathophysiology'],
      related: ['Erythrocyte', 'Anemia', 'Hyperbilirubinemia', 'Ischemia']
    }
  },
  {
    id: 'm8',
    term: 'Erythrocyte',
    termNormalized: 'erythrocyte',
    translation: 'كرية الدم الحمراء',
    phonetic: '/ɪˈrɪθrəsaɪt/',
    pos: 'Noun · خلية دموية',
    category: 'Medical',
    specialty: 'Hematology · أمراض الدم',
    umdCode: 'UMD-D64.9',
    keepEnglish: true,
    favorite: false,
    collections: ['أمراض الدم والمختبر'],
    ingestedAt: 'قاعدة المعجم الطبي الموحد (UMD)',
    definitionAr:
      'خلية دموية ناضجة عديمة النواة، قرصية الشكل ثنائية التقعر، غنية ببروتين Hemoglobin. يؤدي نقص عددها إلى Anemia، بينما يسبب تكسرها المفرط ارتفاع البيليروبين وحالة Hyperbilirubinemia.',
    definitionEn:
      'Mature biconcave blood cell rich in Hemoglobin; accelerated destruction leads to hemolytic Anemia and Hyperbilirubinemia.',
    morphology: {
      prefix: { affix: 'Erythro-', meaningAr: 'أحمر', meaningEn: 'Red' },
      root: { affix: 'cyt', meaningAr: 'خلية', meaningEn: 'Cell' },
      suffix: { affix: '-e', meaningAr: 'لاحقة اسمية', meaningEn: 'Noun suffix' },
      literalSynthesisAr: 'الخلية الحمراء (كرية الدم الحمراء)'
    },
    examples: [
      {
        en: 'The biconcave geometry of an Erythrocyte maximizes surface area for Hemoglobin gas exchange.',
        ar: 'تعمل الهندسة ثنائية التقعر لكرية الدم الحمراء على تعظيم مساحة السطح لتبادل الغازات عبر الهيموغلوبين.'
      },
      {
        en: 'Premature Erythrocyte destruction in hemolytic Anemia elevates serum bilirubin and causes Hyperbilirubinemia.',
        ar: 'يؤدي تحطم كرية الدم الحمراء المبكر في فقر الدم الانحلالي إلى رفع بيليروبين المصل وإحداث فرط بيليروبين الدم.'
      }
    ],
    relations: {
      synonyms: ['Red Blood Cell', 'RBC'],
      broader: ['Hemoglobin'],
      related: ['Anemia', 'Hyperbilirubinemia', 'Thrombocytopenia']
    }
  },
  {
    id: 'm9',
    term: 'Anemia',
    termNormalized: 'anemia',
    translation: 'فقر الدم',
    phonetic: '/əˈniːmiə/',
    pos: 'Noun · اضطراب دموي',
    category: 'Medical',
    specialty: 'Hematology · أمراض الدم',
    umdCode: 'UMD-D64.9',
    keepEnglish: true,
    favorite: true,
    collections: ['أمراض الدم والمختبر', 'مراجعة أساسية'],
    ingestedAt: 'قاعدة المعجم الطبي الموحد (UMD)',
    definitionAr:
      'انخفاض تركيز Hemoglobin أو عدد خلايا Erythrocyte دون الحدود المرجعية للعمر والجنس، مما يضعف نقل الأكسجين للأنسجة ويحث القلب على إحداث Tachycardia معاوضة، ويشيع أيضاً كمضاعفة في Chronic Kidney Disease.',
    definitionEn:
      'Decrease in total amount of Erythrocyte or Hemoglobin in the blood, reducing oxygen transport capacity and provoking compensatory Tachycardia.',
    morphology: {
      prefix: { affix: 'An-', meaningAr: 'نقص / انعدام', meaningEn: 'Without / lack of' },
      root: { affix: 'em (hem)', meaningAr: 'الدم', meaningEn: 'Blood' },
      suffix: { affix: '-ia', meaningAr: 'حالة مرضية', meaningEn: 'Condition' },
      literalSynthesisAr: 'حالة فقر أو نقص الدم'
    },
    examples: [
      {
        en: 'Severe iron-deficiency Anemia frequently causes exertional dyspnea and compensatory Tachycardia.',
        ar: 'يسبب فقر الدم الشديد بنقص الحديد غالباً زلة تنفسية جهدية وتسرّع قلب معاوض.'
      },
      {
        en: 'Patients with advanced Chronic Kidney Disease develop normocytic Anemia due to low Hemoglobin and Erythrocyte production.',
        ar: 'يُصاب مرضى مرض الكلى المزمن المتقدم بحالة فقر الدم سوي الكريات نتيجة انخفاض إنتاج الهيموغلوبين وكريات الدم الحمراء.'
      }
    ],
    relations: {
      synonyms: ['Haemoglobin Deficiency'],
      broader: ['Pathophysiology'],
      related: ['Hemoglobin', 'Erythrocyte', 'Thrombocytopenia', 'Chronic Kidney Disease', 'Tachycardia']
    }
  },
  {
    id: 'm10',
    term: 'Acute Decompensated Congestive Heart Failure',
    termNormalized: 'acute decompensated congestive heart failure',
    translation: 'فشل القلب الاحتقاني اللاتعاوضي الحاد',
    phonetic: '/əˈkjuːt diːˈkɒmpənseɪtɪd kənˈdʒɛstɪv hɑːrt ˈfeɪljər/',
    pos: 'Noun · حالة إسعافية قلبية',
    category: 'Medical',
    specialty: 'Cardiology · أمراض القلب',
    umdCode: 'UMD-I50.9',
    keepEnglish: true,
    favorite: true,
    collections: ['طب الطوارئ والقلب', 'مراجعة أساسية'],
    ingestedAt: 'قاعدة المعجم الطبي الموحد (UMD)',
    definitionAr:
      'تدهور مفاجئ أو تدريجي في علامات وأعراض قصور القلب الاحتقاني يستدعي التدخل الإسعافي العاجل لإزالة الاحتقان الوعائي ومعالجة Pulmonary Edema والوذمة المحيطية.',
    definitionEn:
      'Sudden or gradual worsening of congestive heart failure signs and symptoms requiring urgent therapy to relieve Pulmonary Edema.',
    clinicalNote: 'يُلتقط كعبارة كاملة متعددة الكلمات عبر خوارزمية Aho-Corasick بأولوية التطابق الأطول (Longest-Match-First).',
    examples: [
      {
        en: 'The patient was admitted to the ICU with Acute Decompensated Congestive Heart Failure and Pulmonary Edema.',
        ar: 'أُدخل المريض إلى وحدة العناية المركزة بسبب فشل القلب الاحتقاني اللاتعاوضي الحاد والوذمة الرئوية.'
      },
      {
        en: 'Intravenous loop diuretics rapidly relieve vascular congestion in Acute Decompensated Congestive Heart Failure triggered by Atrial Fibrillation.',
        ar: 'تعمل مدرات العروة الوريدية سريعاً على تخفيف الاحتقان الوعائي في فشل القلب الاحتقاني اللاتعاوضي الحاد المحرّض بالرجفان الأذيني.'
      }
    ],
    relations: {
      synonyms: ['ADHF', 'Acute Decompensated Heart Failure'],
      broader: ['Pathophysiology'],
      related: ['Pulmonary Edema', 'Myocardial Infarction', 'Atrial Fibrillation', 'Mitral Stenosis']
    }
  },
  {
    id: 'm11',
    term: 'Angina Pectoris',
    termNormalized: 'angina pectoris',
    translation: 'الذبحة الصدرية (خناق الصدر)',
    phonetic: '/ænˈdʒaɪnə ˈpɛktərɪs/',
    pos: 'Noun · متلازمة سريرية',
    category: 'Medical',
    specialty: 'Cardiology · أمراض القلب',
    umdCode: 'UMD-I20.9',
    keepEnglish: true,
    favorite: false,
    collections: ['طب الطوارئ والقلب'],
    ingestedAt: 'قاعدة المعجم الطبي الموحد (UMD)',
    definitionAr:
      'ألم أو انزعاج صدري عاصر ينجم عن نقص عابر في تروية عضلة القلب (Ischemia) نتيجة Atherosclerosis في الشرايين التاجية دون حدوث نخر خلوي كما في Myocardial Infarction.',
    definitionEn:
      'Paroxysmal thoracic pain caused by transient myocardial Ischemia secondary to coronary Atherosclerosis without cellular necrosis.',
    clinicalNote: 'يُعتمد مصطلح الذبحة الصدرية أو خناق الصدر في المعجم الطبي الموحد.',
    examples: [
      {
        en: 'Sublingual nitroglycerin relieves stable Angina Pectoris within minutes.',
        ar: 'يخفف النتروغليسرين تحت اللسان من نوبة الذبحة الصدرية المستقرة خلال دقائق.'
      },
      {
        en: 'Coronary Atherosclerosis causes exertional Ischemia presenting clinically as Angina Pectoris before progressing to Myocardial Infarction.',
        ar: 'يسبب تصلّب الشرايين العصيدي التاجي نقص تروية جهدي يتظاهر سريرياً بالذبحة الصدرية قبل أن يتطور إلى احتشاء عضلة القلب.'
      }
    ],
    relations: {
      synonyms: ['Stable Angina', 'Unstable Angina'],
      broader: ['Ischemia'],
      related: ['Myocardial Infarction', 'Atherosclerosis', 'Tachycardia']
    }
  },
  {
    id: 'm12',
    term: 'Atrial Fibrillation',
    termNormalized: 'atrial fibrillation',
    translation: 'الرجفان الأذيني',
    phonetic: '/ˈeɪtriəl ˌfɪbrɪˈleɪʃən/',
    pos: 'Noun · اضطراب نظم قلبي',
    category: 'Medical',
    specialty: 'Cardiology · أمراض القلب',
    umdCode: 'UMD-I48.91',
    keepEnglish: true,
    favorite: true,
    collections: ['طب الطوارئ والقلب'],
    ingestedAt: 'قاعدة المعجم الطبي الموحد (UMD)',
    definitionAr:
      'اضطراب نظم قلبي فوق بطيني ضمن طيف Arrhythmia يتميز بتفعيل كهربائي أذيني فوضوي وسريع يؤدي إلى فقدان الانقباض الأذيني الفعال، وغالباً ما ينجم عن Mitral Stenosis ويرفع خطر حدوث Ischemic Stroke.',
    definitionEn:
      'Supraventricular tachyarrhythmia characterized by uncoordinated atrial electrical activation, predisposing to thromboembolic Ischemic Stroke.',
    clinicalNote: 'أشيع اضطراب نظم قلبي فوق بطيني مستمر، ويرفع خطر السكتة الدماغية الخثارية.',
    examples: [
      {
        en: 'Anticoagulation is indicated in Atrial Fibrillation to prevent thromboembolic Ischemic Stroke.',
        ar: 'يستطب العلاج المضاد للتخثر في الرجفان الأذيني للوقاية من السكتة الدماغية الإقفارية الخثارية.'
      },
      {
        en: 'Left atrial dilation secondary to rheumatic Mitral Stenosis frequently triggers chronic Atrial Fibrillation and rapid Tachycardia.',
        ar: 'يؤدي توسع الأذين الأيسر الثانوي لتضيّق الصمام التاجي الرثوي غالباً إلى تحريض الرجفان الأذيني المزمن وتسرّع القلب السريع.'
      }
    ],
    relations: {
      synonyms: ['AFib', 'Auricular Fibrillation'],
      broader: ['Arrhythmia'],
      related: ['Tachycardia', 'Mitral Stenosis', 'Ischemic Stroke']
    }
  },
  {
    id: 'm13',
    term: 'Mitral Stenosis',
    termNormalized: 'mitral stenosis',
    translation: 'تضيّق الصمام التاجي (الميترالي)',
    phonetic: '/ˈmaɪtrəl stəˈnoʊsɪs/',
    pos: 'Noun · آفة صمامية قلبية',
    category: 'Medical',
    specialty: 'Cardiology · أمراض القلب',
    umdCode: 'UMD-I05.0',
    keepEnglish: true,
    favorite: false,
    collections: ['طب الطوارئ والقلب'],
    ingestedAt: 'قاعدة المعجم الطبي الموحد (UMD)',
    definitionAr:
      'تضيّق في فوهة الصمام التاجي يعيق جريان الدم من الأذين الأيسر إلى البطين الأيسر أثناء طور الانبساط، وغالباً ما ينجم عن الحمى الرثوية ويؤهب لحدوث Atrial Fibrillation وPulmonary Edema.',
    definitionEn:
      'Obstruction of blood flow across the mitral valve from left atrium to left ventricle during diastole, often leading to Atrial Fibrillation.',
    clinicalNote: 'المرشح القلبي الأول لفك التباس الاختصار MS عند وجود كلمات دلالية مثل diastolic murmur أو rheumatic.',
    morphology: {
      root: { affix: 'Mitral', meaningAr: 'الصمام التاجي', meaningEn: 'Mitral valve' },
      suffix: { affix: '-stenosis', meaningAr: 'تضيّق', meaningEn: 'Narrowing' },
      literalSynthesisAr: 'تضيّق الصمام التاجي'
    },
    examples: [
      {
        en: 'Auscultation at the cardiac apex revealed a rumbling diastolic murmur classic for Mitral Stenosis.',
        ar: 'أظهر الإصغاء عند قمة القلب نفخة انبساطية مدمدمة نموذجية لتضيّق الصمام التاجي.'
      },
      {
        en: 'Severe Mitral Stenosis elevates left atrial pressure, predisposing the patient to Atrial Fibrillation and Pulmonary Edema.',
        ar: 'يرفع تضيّق الصمام التاجي الشديد ضغط الأذين الأيسر، مما يؤهب المريض للرجفان الأذيني والوذمة الرئوية.'
      }
    ],
    relations: {
      synonyms: ['Mitral Valve Stenosis'],
      broader: ['Pathophysiology'],
      related: ['Atrial Fibrillation', 'Pulmonary Edema', 'Acute Decompensated Congestive Heart Failure']
    }
  },
  {
    id: 'm14',
    term: 'Cardiac Tamponade',
    termNormalized: 'cardiac tamponade',
    translation: 'الاندحاس القلبي (الدكّ القلبي)',
    phonetic: '/ˈkɑːrdiæk ˌtæmpəˈneɪd/',
    pos: 'Noun · طوارئ قلبية صدرية',
    category: 'Medical',
    specialty: 'Cardiology & Emergency · طب الطوارئ والقلب',
    umdCode: 'UMD-I31.4',
    keepEnglish: true,
    favorite: false,
    collections: ['طب الطوارئ والقلب'],
    ingestedAt: 'قاعدة المعجم الطبي الموحد (UMD)',
    definitionAr:
      'انضغاط حجرات القلب نتيجة تراكم سريع أو غزير للسوائل أو الدم داخل جوف التامور، مما يعيق امتلاء البطينين ويخفض النتاج القلبي محدثاً Tachycardia معاوضة وصدمة انسدادية تشبه سريرياً Hypovolemic Shock.',
    definitionEn:
      'Life-threatening compression of the heart due to fluid accumulation within the pericardial sac.',
    clinicalNote: 'حالة إسعافية مهددة للحياة تتطلب بزل التامور الفوري (Pericardiocentesis).',
    examples: [
      {
        en: 'Beck triad of hypotension, jugular venous distension, and muffled heart sounds indicates Cardiac Tamponade.',
        ar: 'يشير ثلاثي بيك المكون من هبوط الضغط وتمدد أوردة العنق وخفوت أصوات القلب إلى الاندحاس القلبي.'
      },
      {
        en: 'Emergency bedside echocardiography differentiates obstructive Cardiac Tamponade from Pulmonary Embolism and Hypovolemic Shock.',
        ar: 'يميز تخطيط صدى القلب السريري الإسعافي بين الاندحاس القلبي الانسدادي وكل من الانصمام الرئوي وصدمة نقص حجم الدم.'
      }
    ],
    relations: {
      synonyms: ['Pericardial Tamponade'],
      broader: ['Differential Diagnosis'],
      related: ['Hypovolemic Shock', 'Tachycardia']
    }
  },
  {
    id: 'm15',
    term: 'Hepatic Cirrhosis',
    termNormalized: 'hepatic cirrhosis',
    translation: 'تشمّع الكبد (تليّف الكبد الكامل)',
    phonetic: '/hɪˈpætɪk sɪˈroʊsɪs/',
    pos: 'Noun · مرض كبدي مزمن',
    category: 'Medical',
    specialty: 'Hepatology · أمراض الكبد',
    umdCode: 'UMD-K74.6',
    keepEnglish: true,
    favorite: false,
    collections: ['الطب الباطني والكبد'],
    ingestedAt: 'قاعدة المعجم الطبي الموحد (UMD)',
    definitionAr:
      'مرحلة متقدمة وغير عكوسة من التندب الكبدي تتميز باستبدال النسيج الكبدي الطبيعي بعقيدات تجددية محاطة بحزم ليفية كثيفة، مما يؤدي إلى فرط ضغط وريد الباب وHyperbilirubinemia وThrombocytopenia.',
    definitionEn:
      'Diffuse irreversible hepatic fibrosis with nodular regeneration and distortion of liver architecture.',
    clinicalNote: 'يُعتمد مصطلح تشمّع الكبد في المعجم الطبي الموحد مقابل Cirrhosis، بينما يُخصص التليّف لـ Fibrosis.',
    examples: [
      {
        en: 'Decompensated Hepatic Cirrhosis presents with ascites, variceal hemorrhage, and hepatic encephalopathy.',
        ar: 'يتظاهر تشمّع الكبد اللاتعاوضي بالحبن ونزف الدوالي والاعتلال الدماغي الكبدي.'
      },
      {
        en: 'Portal hypertension in Hepatic Cirrhosis causes hypersplenism, Thrombocytopenia, and progressive Hyperbilirubinemia.',
        ar: 'يسبب فرط ضغط وريد الباب في تشمّع الكبد فرط نشاط الطحال وقلة الصفيحات الدموية وفرط بيليروبين الدم المترقي.'
      }
    ],
    relations: {
      synonyms: ['Liver Cirrhosis'],
      broader: ['Pathophysiology'],
      related: ['Hyperbilirubinemia', 'Thrombocytopenia', 'Pharmacokinetics']
    }
  },
  {
    id: 'm16',
    term: 'Diabetic Ketoacidosis',
    termNormalized: 'diabetic ketoacidosis',
    translation: 'الحماض الكيتوني السكري',
    phonetic: '/ˌdaɪəˈbɛtɪk ˌkiːtoʊˌæsɪˈdoʊsɪs/',
    pos: 'Noun · طوارئ الغدد الصم والاستقلاب',
    category: 'Medical',
    specialty: 'Endocrinology & Emergency · الغدد الصم والطوارئ',
    umdCode: 'UMD-E10.10',
    keepEnglish: true,
    favorite: true,
    collections: ['الطب الباطني والكبد', 'مراجعة أساسية'],
    ingestedAt: 'قاعدة المعجم الطبي الموحد (UMD)',
    definitionAr:
      'مضاعفة استقلابية حادة ومهددة للحياة لداء السكري تنجم عن عوز الأنسولين الشديد وارتفاع الهرمونات المضادة، وتتميز بفرط سكر الدم والحماض الاستقلابي والتجفاف الذي قد يقود إلى Hypovolemic Shock.',
    definitionEn:
      'Life-threatening acute metabolic complication of diabetes characterized by hyperglycemia, ketonemia, and metabolic acidosis.',
    clinicalNote: 'حالة طوارئ استقلابية تتطلب تعويض السوائل الوريدية والأنسولين ومراقبة البوتاسيوم.',
    examples: [
      {
        en: 'Initial management of Diabetic Ketoacidosis prioritizes aggressive isotonic intravenous fluid resuscitation.',
        ar: 'تعطي المعالجة الأولية للحماض الكيتوني السكري الأولوية للإنعاش المكثف بالسوائل الوريدية متساوية التوتر.'
      },
      {
        en: 'Severe osmotic diuresis in untreated Diabetic Ketoacidosis can precipitate Hypovolemic Shock and acute renal injury.',
        ar: 'يمكن أن يؤدي الإدرار التناضحي الشديد في الحماض الكيتوني السكري غير المعالج إلى تحريض صدمة نقص حجم الدم وأذية كلوية حادة.'
      }
    ],
    relations: {
      synonyms: ['DKA'],
      broader: ['Pathophysiology'],
      related: ['Chronic Kidney Disease', 'Pulmonary Edema', 'Hypovolemic Shock']
    }
  },
  {
    id: 'm17',
    term: 'Chronic Kidney Disease',
    termNormalized: 'chronic kidney disease',
    translation: 'مرض الكلى المزمن (القصور الكلوي المزمن)',
    phonetic: '/ˈkrɒnɪk ˈkɪdni dɪˈziːz/',
    pos: 'Noun · تشخيص كلوي باطني',
    category: 'Medical',
    specialty: 'Nephrology · أمراض الكلى',
    umdCode: 'UMD-N18.9',
    keepEnglish: true,
    favorite: false,
    collections: ['الطب الباطني والكبد'],
    ingestedAt: 'قاعدة المعجم الطبي الموحد (UMD)',
    definitionAr:
      'تدهور تدريجي ومستمر في بنية أو وظيفة الكليتين يمتد لأكثر من ثلاثة أشهر، ويترافق مع Anemia بنقص الإريثروبويتين وتغيرات جوهرية في Pharmacokinetics الأدوية المنحلة بالماء.',
    definitionEn:
      'Progressive loss in renal structure or function persisting for more than 3 months, frequently causing Anemia and altered Pharmacokinetics.',
    clinicalNote: 'يصنف إلى 5 مراحل تبعاً لمعدل الرشح الكبيبي المقدر (eGFR).',
    examples: [
      {
        en: 'Anemia in Chronic Kidney Disease is primarily driven by reduced renal erythropoietin synthesis.',
        ar: 'ينجم فقر الدم في مرض الكلى المزمن بصورة رئيسية عن نقص تصنيع الإريثروبويتين الكلوي.'
      },
      {
        en: 'Reduced glomerular filtration in Chronic Kidney Disease alters drug Pharmacokinetics and increases the risk of Pulmonary Edema.',
        ar: 'يغيّر انخفاض الرشح الكبيبي في مرض الكلى المزمن من الحرائك الدوائية للأدوية ويرفع خطر الوذمة الرئوية.'
      }
    ],
    relations: {
      synonyms: ['CKD', 'Chronic Renal Failure'],
      broader: ['Pathophysiology'],
      related: ['Anemia', 'Diabetic Ketoacidosis', 'Pharmacokinetics']
    }
  },
  {
    id: 'm18',
    term: 'Acute Pancreatitis',
    termNormalized: 'acute pancreatitis',
    translation: 'التهاب البنكرياس الحاد (التهاب المعثكلة الحاد)',
    phonetic: '/əˈkjuːt ˌpæŋkriəˈtaɪtɪs/',
    pos: 'Noun · طوارئ هضمية وجراحية',
    category: 'Medical',
    specialty: 'Gastroenterology · أمراض الجهاز الهضمي',
    umdCode: 'UMD-K85.9',
    keepEnglish: true,
    favorite: false,
    collections: ['الطب الباطني والكبد'],
    ingestedAt: 'قاعدة المعجم الطبي الموحد (UMD)',
    definitionAr:
      'التهاب حاد غير إنتاني في نسيج البنكرياس ناتج عن التفعيل المبكر للإنزيمات الهاضمة داخل الخلايا العنبية وما يتبعه من هضم ذاتي للغدة، وأشيع أسبابه الحصيات المرارية (Cholecystolithiasis).',
    definitionEn:
      'Sudden inflammation of the pancreas triggered by premature intra-acinar activation of digestive zymogens, frequently secondary to Cholecystolithiasis.',
    clinicalNote: 'أشيع أسبابه الحصيات المرارية المهاجرة (Cholecystolithiasis) وترتفع فيه خمائر الأميلاز والليباز.',
    morphology: {
      root: { affix: 'pancreat', meaningAr: 'البنكرياس (المعثكلة)', meaningEn: 'Pancreas' },
      suffix: { affix: '-itis', meaningAr: 'التهاب', meaningEn: 'Inflammation' },
      literalSynthesisAr: 'التهاب البنكرياس الحاد'
    },
    examples: [
      {
        en: 'Severe epigastric pain radiating to the back with elevated serum lipase confirms Acute Pancreatitis.',
        ar: 'يؤكد الألم الشرسوفي الشديد المنتشر إلى الظهر مع ارتفاع ليباز المصل تشخيص التهاب البنكرياس الحاد.'
      },
      {
        en: 'Biliary Acute Pancreatitis is commonly precipitated by Cholecystolithiasis and third-space fluid loss leading to Hypovolemic Shock.',
        ar: 'يُحرّض التهاب البنكرياس الحاد الصفراوي غالباً بتحصّي المرارة وفقدان السوائل إلى الحيز الثالث مما يؤدي إلى صدمة نقص حجم الدم.'
      }
    ],
    relations: {
      synonyms: ['Acute Pancreatic Inflammation'],
      broader: ['Differential Diagnosis'],
      related: ['Cholecystolithiasis', 'Hyperbilirubinemia', 'Hypovolemic Shock']
    }
  },
  {
    id: 'm19',
    term: 'Multiple Sclerosis',
    termNormalized: 'multiple sclerosis',
    translation: 'التصلب اللويحي المتعدد',
    phonetic: '/ˈmʌltɪpəl sklɪˈroʊsɪs/',
    pos: 'Noun · مرض عصبي مناعي ذاتي',
    category: 'Medical',
    specialty: 'Neurology · طب الأعصاب',
    umdCode: 'UMD-G35',
    keepEnglish: true,
    favorite: true,
    collections: ['طب وجراحة الأعصاب', 'مراجعة أساسية'],
    ingestedAt: 'قاعدة المعجم الطبي الموحد (UMD)',
    definitionAr:
      'مرض مناعي ذاتي مزمن يصيب الجهاز العصبي المركزي (الدماغ والنخاع الشوكي) ويتميز بزوال الميالين الالتهابي البؤري وتشكّل لويحات متصلبة تؤدي إلى نوبات عصبية متكررة.',
    definitionEn:
      'Chronic autoimmune demyelinating disease of the central nervous system.',
    clinicalNote: 'المرشح العصبي الأول لفك التباس الاختصار MS عند وجود كلمات دلالية مثل demyelinating أو optic neuritis أو plaques.',
    morphology: {
      root: { affix: 'Multiple', meaningAr: 'متعدد', meaningEn: 'Multiple' },
      suffix: { affix: '-sclerosis', meaningAr: 'تصلّب', meaningEn: 'Hardening' },
      literalSynthesisAr: 'التصلب المتعدد'
    },
    examples: [
      {
        en: 'Periventricular white matter plaques on brain MRI are characteristic of relapsing-remitting Multiple Sclerosis.',
        ar: 'تُعد لويحات المادة البيضاء حول البطينات في رنين الدماغ المغناطيسي سمة مميزة للتصلب اللويحي المتعدد الناكس الهاجع.'
      },
      {
        en: 'Acute optic neuritis and focal demyelination help distinguish Multiple Sclerosis from acute Ischemic Stroke.',
        ar: 'يساعد التهاب العصب البصري الحاد وزوال الميالين البؤري في تمييز التصلب اللويحي المتعدد عن السكتة الدماغية الإقفارية الحادة.'
      }
    ],
    relations: {
      synonyms: ['Disseminated Sclerosis', 'MS'],
      broader: ['Pathophysiology'],
      related: ['Ischemic Stroke', 'Status Epilepticus', 'Subarachnoid Hemorrhage']
    }
  },
  {
    id: 'm20',
    term: 'Ischemic Stroke',
    termNormalized: 'ischemic stroke',
    translation: 'السكتة الدماغية الإقفارية',
    phonetic: '/ɪˈskiːmɪk stroʊk/',
    pos: 'Noun · طوارئ وعائية دماغية',
    category: 'Medical',
    specialty: 'Neurology · طب الأعصاب',
    umdCode: 'UMD-I63.9',
    keepEnglish: true,
    favorite: true,
    collections: ['طب وجراحة الأعصاب', 'مراجعة أساسية'],
    ingestedAt: 'قاعدة المعجم الطبي الموحد (UMD)',
    definitionAr:
      'عجز عصبي بؤري مفاجئ ينجم عن انسداد وعائي شرياني دماغي خثاري أو صمّي (غالباً بسبب Atrial Fibrillation أو Atherosclerosis سباتية) يؤدي إلى Ischemia حادة واحتشاء نسيج الدماغ.',
    definitionEn:
      'Sudden neurological deficit resulting from focal cerebral arterial occlusion and tissue infarction.',
    clinicalNote: 'تستدعي التقييم العاجل لإعطاء حالّات الخثرة الوريدية (Alteplase) أو استئصال الخثرة الميكانيكي بعد نفي النزف.',
    examples: [
      {
        en: 'Non-contrast head CT is performed immediately to exclude hemorrhage prior to thrombolysis in Ischemic Stroke.',
        ar: 'يُجرى التصوير المقطعي للرأس بدون حقن فوراً لاستبعاد النزف قبل إعطاء حالّات الخثرة في السكتة الدماغية الإقفارية.'
      },
      {
        en: 'Cardioembolic Ischemic Stroke is a major complication of untreated Atrial Fibrillation and carotid Atherosclerosis.',
        ar: 'تُعد السكتة الدماغية الإقفارية الصمّية القلبية مضاعفة رئيسية للرجفان الأذيني غير المعالج وتصلّب الشرايين العصيدي السباتي.'
      }
    ],
    relations: {
      synonyms: ['Cerebral Infarction', 'CVA'],
      broader: ['Ischemia'],
      related: ['Atrial Fibrillation', 'Atherosclerosis', 'Subarachnoid Hemorrhage', 'Status Epilepticus']
    }
  },
  {
    id: 'm21',
    term: 'Subarachnoid Hemorrhage',
    termNormalized: 'subarachnoid hemorrhage',
    translation: 'النزف تحت العنكبوتية',
    phonetic: '/ˌsʌbəˈræknoɪd ˈhɛmərɪdʒ/',
    pos: 'Noun · طوارئ جراحة عصبية',
    category: 'Medical',
    specialty: 'Neurology & Neurosurgery · طب وجراحة الأعصاب',
    umdCode: 'UMD-I60.9',
    keepEnglish: true,
    favorite: false,
    collections: ['طب وجراحة الأعصاب'],
    ingestedAt: 'قاعدة المعجم الطبي الموحد (UMD)',
    definitionAr:
      'نزف حاد يتجمع في الحيز تحت العنكبوتية المحيط بالدماغ، ويمثل حالة طوارئ عصبية جراحية حرجة تتطلب التفريق الفوري عن Ischemic Stroke.',
    definitionEn:
      'Extravasation of blood into the subarachnoid space between the arachnoid and pia mater.',
    clinicalNote: 'يتظاهر سريرياً بصداع قصف الرعد (Thunderclap headache) وينجم غالباً عن تمزق أم دم شريانية دماغية.',
    morphology: {
      prefix: { affix: 'Sub-', meaningAr: 'تحت', meaningEn: 'Under' },
      root: { affix: 'arachnoid', meaningAr: 'الأم العنكبوتية', meaningEn: 'Arachnoid mater' },
      suffix: { affix: '-hemorrhage', meaningAr: 'نزف', meaningEn: 'Bleeding' },
      literalSynthesisAr: 'النزف في الحيز تحت العنكبوتية'
    },
    examples: [
      {
        en: 'A sudden thunderclap headache with nuchal rigidity strongly suggests Subarachnoid Hemorrhage.',
        ar: 'يوحي صداع قصف الرعد المفاجئ المترافق مع صلابة النقرة بشدة بحدوث النزف تحت العنكبوتية.'
      },
      {
        en: 'Delayed cerebral vasospasm following Subarachnoid Hemorrhage can induce secondary cerebral Ischemia and Ischemic Stroke.',
        ar: 'يمكن أن يؤدي التشنج الوعائي الدماغي المتأخر عقب النزف تحت العنكبوتية إلى إحداث نقص تروية دماغي ثانوي وسكتة دماغية إقفارية.'
      }
    ],
    relations: {
      synonyms: ['SAH'],
      broader: ['Differential Diagnosis'],
      related: ['Ischemic Stroke', 'Status Epilepticus']
    }
  },
  {
    id: 'm22',
    term: 'Status Epilepticus',
    termNormalized: 'status epilepticus',
    translation: 'الحالة الصرعية المستمرة',
    phonetic: '/ˈsteɪtəs ˌɛpɪˈlɛptɪkəs/',
    pos: 'Noun · طوارئ عصبية حرجة',
    category: 'Medical',
    specialty: 'Neurology & Emergency · الأعصاب والطوارئ',
    umdCode: 'UMD-G40.901',
    keepEnglish: true,
    favorite: false,
    collections: ['طب وجراحة الأعصاب'],
    ingestedAt: 'قاعدة المعجم الطبي الموحد (UMD)',
    definitionAr:
      'نوبة صرعية مستمرة تمتد لأكثر من خمس دقائق، أو نوبات متلاحقة دون استعادة الوعي الكامل بينها، وقد تنجم عن عقابيل Ischemic Stroke أو Subarachnoid Hemorrhage.',
    definitionEn:
      'Continuous seizure activity lasting more than 5 minutes or recurrent seizures without recovery of consciousness.',
    clinicalNote: 'تتطلب إعطاء البنزوديازيبينات الوريدية الفورية لحماية الدماغ من الأذية الإقفارية والسمية الاستشارية.',
    examples: [
      {
        en: 'Intravenous lorazepam is the first-line pharmacotherapy for convulsive Status Epilepticus.',
        ar: 'يُعد اللورازيبام الوريدي خط العلاج الدوائي الأول في الحالة الصرعية المستمرة الاختلاجية.'
      },
      {
        en: 'Refractory Status Epilepticus may occur as an acute neurological complication of Ischemic Stroke or Subarachnoid Hemorrhage.',
        ar: 'قد تحدث الحالة الصرعية المستمرة المعندة كمضاعفة عصبية حادة للسكتة الدماغية الإقفارية أو النزف تحت العنكبوتية.'
      }
    ],
    relations: {
      synonyms: ['Prolonged Seizure State'],
      broader: ['Pathophysiology'],
      related: ['Ischemic Stroke', 'Subarachnoid Hemorrhage', 'Multiple Sclerosis']
    }
  },
  {
    id: 'm23',
    term: 'Pulmonary Embolism',
    termNormalized: 'pulmonary embolism',
    translation: 'الانصمام الرئوي (جلطة الشريان الرئوي)',
    phonetic: '/ˈpʊlməˌnɛri ˈɛmbəˌlɪzəm/',
    pos: 'Noun · طوارئ صدرية ووعائية',
    category: 'Medical',
    specialty: 'Pulmonology & Emergency · الصدرية والطوارئ',
    umdCode: 'UMD-I26.99',
    keepEnglish: true,
    favorite: true,
    collections: ['طب الطوارئ والقلب', 'مراجعة أساسية'],
    ingestedAt: 'قاعدة المعجم الطبي الموحد (UMD)',
    definitionAr:
      'انسداد مفاجئ في الشريان الرئوي أو أحد فروعه بخثرة دموية مهاجرة تنشأ غالباً من الأوردة العميقة في الطرفين السفليين، ويسبب زلة تنفسية حادة وTachycardia ويتطلب التشخيص التفريقي العاجل عن Myocardial Infarction.',
    definitionEn:
      'Obstruction of the pulmonary arterial tree by a thrombus originating from the deep venous system.',
    clinicalNote: 'المرشح الرئوي الأول لفك التباس الاختصار PE عند وجود كلمات مثل DVT أو CTPA أو hypoxia.',
    examples: [
      {
        en: 'CT pulmonary angiography confirmed a saddle Pulmonary Embolism secondary to lower extremity DVT.',
        ar: 'أكد تصوير الأوعية الرئوية المقطعي وجود انصمام رئوي سرجي ثانوي لخثار الأوردة العميقة في الطرف السفلي.'
      },
      {
        en: 'Massive Pulmonary Embolism presents with sudden hypoxia, sinus Tachycardia, and right ventricular strain mimicking Myocardial Infarction.',
        ar: 'يتظاهر الانصمام الرئوي الجسيم بنقص أكسجة مفاجئ وتسرّع قلب جيبي وإجهاد بطيني أيمن يحاكي احتشاء عضلة القلب.'
      }
    ],
    relations: {
      synonyms: ['PE', 'Pulmonary Thromboembolism'],
      broader: ['Differential Diagnosis'],
      related: ['Myocardial Infarction', 'Pulmonary Edema', 'Tachycardia']
    }
  },
  {
    id: 'm24',
    term: 'Pulmonary Edema',
    termNormalized: 'pulmonary edema',
    translation: 'الوذمة الرئوية',
    phonetic: '/ˈpʊlməˌnɛri ɪˈdiːmə/',
    pos: 'Noun · حالة حرجة تنفسية قلبية',
    category: 'Medical',
    specialty: 'Pulmonology & Cardiology · الصدرية والقلب',
    umdCode: 'UMD-J81.0',
    keepEnglish: true,
    favorite: false,
    collections: ['طب الطوارئ والقلب'],
    ingestedAt: 'قاعدة المعجم الطبي الموحد (UMD)',
    definitionAr:
      'تراكم غير طبيعي للسوائل في النسيج الخلالي للرئة وداخل الأسناخ الهوائية، غالباً كمضاعفة لحالة Acute Decompensated Congestive Heart Failure أو Mitral Stenosis، مما يعيق التبادل الغازي ويسبب زلة تنفسية حادة.',
    definitionEn:
      'Extravascular accumulation of fluid within the pulmonary interstitium and alveoli.',
    clinicalNote: 'تُصنف إلى وذمة رئوية قلبية المنشأ (Cardiogenic) وغير قلبية المنشأ (Non-cardiogenic).',
    examples: [
      {
        en: 'Crackles on lung auscultation and bilateral alveolar infiltrates indicate acute Pulmonary Edema.',
        ar: 'تدل الخراخر عند إصغاء الرئتين والارتشاحات السنخية ثنائية الجانب على الوذمة الرئوية الحادة.'
      },
      {
        en: 'Cardiogenic Pulmonary Edema is a hallmark presentation of Acute Decompensated Congestive Heart Failure and severe Mitral Stenosis.',
        ar: 'تُعد الوذمة الرئوية قلبية المنشأ تظاهرة سريرية مميزة لفشل القلب الاحتقاني اللاتعاوضي الحاد وتضيّق الصمام التاجي الشديد.'
      }
    ],
    relations: {
      synonyms: ['Lung Congestion'],
      broader: ['Pathophysiology'],
      related: ['Acute Decompensated Congestive Heart Failure', 'Mitral Stenosis', 'Pulmonary Embolism']
    }
  },
  {
    id: 'm25',
    term: 'Anaphylactic Shock',
    termNormalized: 'anaphylactic shock',
    translation: 'الصدمة التأقية (صدمة الحساسية المفرطة)',
    phonetic: '/ˌænəfɪˈlæktɪk ʃɒk/',
    pos: 'Noun · طوارئ مناعية حرجة',
    category: 'Medical',
    specialty: 'Emergency Medicine & Immunology · طب الطوارئ والمناعة',
    umdCode: 'UMD-T78.2',
    keepEnglish: true,
    favorite: true,
    collections: ['طب الطوارئ والقلب'],
    ingestedAt: 'قاعدة المعجم الطبي الموحد (UMD)',
    definitionAr:
      'تفاعل فرط حساسية جهازي حاد ومهدد للحياة يترافق مع توسع وعائي شديد، هبوط ضغط شرياني، وتشنج قصبي ووذمة حنجرية، ويتميز في الفرز الإسعافي عن Hypovolemic Shock.',
    definitionEn:
      'Severe, life-threatening systemic hypersensitivity reaction characterized by airway compromise and distributive hypotension.',
    clinicalNote: 'العلاج المنقذ للحياة هو حقن الإبينفرين (الأدرينالين) عضلياً فوراً (IM Epinephrine).',
    examples: [
      {
        en: 'Intramuscular epinephrine into the anterolateral thigh is the immediate treatment for Anaphylactic Shock.',
        ar: 'يُعد حقن الإبينفرين عضلياً في الوجه الأمامي الوحشي للفخذ العلاج الفوري للصدمة التأقية.'
      },
      {
        en: 'Systemic vasodilation in Anaphylactic Shock causes severe hypotension and reflex Tachycardia similar to Hypovolemic Shock.',
        ar: 'يسبب التوسع الوعائي الجهازي في الصدمة التأقية هبوط ضغط شديد وتسرّع قلب انعكاسي يشبه صدمة نقص حجم الدم.'
      }
    ],
    relations: {
      synonyms: ['Anaphylaxis'],
      broader: ['Differential Diagnosis'],
      related: ['Hypovolemic Shock', 'Pulmonary Edema', 'Tachycardia']
    }
  },
  {
    id: 'm26',
    term: 'Hypovolemic Shock',
    termNormalized: 'hypovolemic shock',
    translation: 'صدمة نقص حجم الدم',
    phonetic: '/ˌhaɪpoʊvoʊˈliːmɪk ʃɒk/',
    pos: 'Noun · طوارئ الجراحة والإصابات',
    category: 'Medical',
    specialty: 'Emergency & Trauma Surgery · الطوارئ وجراحة الإصابات',
    umdCode: 'UMD-R57.1',
    keepEnglish: true,
    favorite: false,
    collections: ['طب الطوارئ والقلب'],
    ingestedAt: 'قاعدة المعجم الطبي الموحد (UMD)',
    definitionAr:
      'حالة قصور دوراني حاد تنجم عن فقدان شديد في حجم الدم داخل الأوعية أو السوائل خارج الخلوية، مما يؤدي إلى انخفاض العود الوريدي وحدوث Ischemia في الأعضاء الحيوية مع Tachycardia معاوضة.',
    definitionEn:
      'Circulatory failure due to critical loss of intravascular blood or fluid volume resulting in tissue hypoperfusion.',
    clinicalNote: 'تنجم عن النزف الحاد أو فقدان السوائل الغزير وتتظاهر بتسرع القلب وهبوط الضغط ونقص تروية الأعضاء.',
    morphology: {
      prefix: { affix: 'Hypo-', meaningAr: 'نقص', meaningEn: 'Low' },
      root: { affix: 'vol', meaningAr: 'حجم', meaningEn: 'Volume' },
      suffix: { affix: '-emic', meaningAr: 'دموي', meaningEn: 'In blood' },
      literalSynthesisAr: 'صدمة نقص الحجم الدموي'
    },
    examples: [
      {
        en: 'Massive gastrointestinal hemorrhage rapidly leads to Hypovolemic Shock and compensatory Tachycardia.',
        ar: 'يؤدي النزف الهضمي الغزير سريعاً إلى صدمة نقص حجم الدم وتسرّع القلب المعاوض.'
      },
      {
        en: 'Uncorrected Hypovolemic Shock results in systemic organ Ischemia, acute Anemia, and metabolic acidosis.',
        ar: 'تؤدي صدمة نقص حجم الدم غير المصححة إلى نقص تروية الأعضاء الجهازي وفقر الدم الحاد والحماض الاستقلابي.'
      }
    ],
    relations: {
      synonyms: ['Hemorrhagic Shock'],
      broader: ['Pathophysiology'],
      related: ['Ischemia', 'Tachycardia', 'Anaphylactic Shock', 'Cardiac Tamponade']
    }
  },
  {
    id: 'm27',
    term: 'Thrombocytopenia',
    termNormalized: 'thrombocytopenia',
    translation: 'قلة الصفيحات الدموية',
    phonetic: '/ˌθrɒmboʊˌsaɪtoʊˈpiːniə/',
    pos: 'Noun · اضطراب دموي ومخبري',
    category: 'Medical',
    specialty: 'Hematology · أمراض الدم',
    umdCode: 'UMD-D69.6',
    keepEnglish: true,
    favorite: true,
    collections: ['أمراض الدم والمختبر', 'مراجعة أساسية'],
    ingestedAt: 'قاعدة المعجم الطبي الموحد (UMD)',
    definitionAr:
      'انخفاض عدد الصفيحات الدموية في الدم المحيطي دون 150,000 صفيحة لكل ميكرولتر، مما يرفع خطر النزف الجلدي والمخاطي، وغالباً ما يترافق مع Hepatic Cirrhosis أو حالات Anemia.',
    definitionEn:
      'Abnormally low platelet count in peripheral blood below 150,000/µL.',
    clinicalNote: 'مركب صرفي قياسي: Thrombocyto- (الصفيحات الدموية) + -penia (قلة / عوز).',
    morphology: {
      prefix: { affix: 'Thrombo-', meaningAr: 'خثري / صفيحي', meaningEn: 'Clot / platelet' },
      root: { affix: 'cyto', meaningAr: 'خلية', meaningEn: 'Cell' },
      suffix: { affix: '-penia', meaningAr: 'قلة / عوز', meaningEn: 'Deficiency' },
      literalSynthesisAr: 'قلة الخلايا الصفيحية الدموية'
    },
    examples: [
      {
        en: 'Heparin-induced Thrombocytopenia requires immediate discontinuation of all heparin products.',
        ar: 'تتطلب قلة الصفيحات الدموية المحرّضة بالهيبارين الإيقاف الفوري لجميع مستحضرات الهيبارين.'
      },
      {
        en: 'Splenic sequestration in advanced Hepatic Cirrhosis frequently causes concurrent Thrombocytopenia and Anemia.',
        ar: 'يسبب الاحتجاز الطحالي في تشمّع الكبد المتقدم غالباً حدوث قلة الصفيحات الدموية وفقر الدم بصورة متزامنة.'
      }
    ],
    relations: {
      synonyms: ['Low Platelet Count'],
      broader: ['Pathophysiology'],
      related: ['Anemia', 'Hemoglobin', 'Erythrocyte', 'Hepatic Cirrhosis']
    }
  },
  {
    id: 'm28',
    term: 'Pharmacokinetics',
    termNormalized: 'pharmacokinetics',
    translation: 'الحرائك الدوائية (حركية الدواء في الجسم)',
    phonetic: '/ˌfɑːrməkoʊkɪˈnɛtɪks/',
    pos: 'Noun · علم الأدوية السريري',
    category: 'Medical',
    specialty: 'Pharmacology · علم الأدوية السريري',
    umdCode: 'UMD-Y40-Y59',
    keepEnglish: true,
    favorite: false,
    collections: ['الطب الباطني والكبد'],
    ingestedAt: 'قاعدة المعجم الطبي الموحد (UMD)',
    definitionAr:
      'فرع علم الأدوية الذي يدرس مسار الدواء داخل الجسم الحي من حيث الامتصاص والتوزع والاستقلاب الكبدي (الذي يتأثر في Hepatic Cirrhosis) والإطراح الكلوي (الذي يتأثر في Chronic Kidney Disease).',
    definitionEn:
      'Quantitative study of drug absorption, distribution, metabolism, and excretion (ADME) over time.',
    clinicalNote: 'تُلخص مراحلها الأربع اختصاراً بـ ADME (الامتصاص، التوزع، الاستقلاب، الإطراح).',
    morphology: {
      prefix: { affix: 'Pharmaco-', meaningAr: 'دوائي', meaningEn: 'Drug' },
      root: { affix: 'kinet', meaningAr: 'حركية', meaningEn: 'Movement' },
      suffix: { affix: '-ics', meaningAr: 'علم', meaningEn: 'Science' },
      literalSynthesisAr: 'علم حركية الدواء'
    },
    examples: [
      {
        en: 'Renal impairment in Chronic Kidney Disease alters the Pharmacokinetics of water-soluble antibiotics, necessitating dose adjustment.',
        ar: 'يغيّر القصور الكلوي في مرض الكلى المزمن من الحرائك الدوائية للمضادات الحيوية المنحلة بالماء، مما يستلزم تعديل الجرعة.'
      },
      {
        en: 'Impaired hepatic metabolism in Hepatic Cirrhosis significantly prolongs drug half-life and alters clinical Pharmacokinetics.',
        ar: 'يؤدي ضعف الاستقلاب الكبدي في تشمّع الكبد إلى إطالة عمر النصف الدوائي وتغيير الحرائك الدوائية السريرية بشكل جوهري.'
      }
    ],
    relations: {
      synonyms: ['ADME Profile', 'Drug Kinetics'],
      broader: ['Pathophysiology'],
      related: ['Chronic Kidney Disease', 'Hepatic Cirrhosis']
    }
  },
  {
    id: 'm29',
    term: 'Atherosclerosis',
    termNormalized: 'atherosclerosis',
    translation: 'تصلّب الشرايين العصيدي (التصلب العصيدي)',
    phonetic: '/ˌæθəroʊskləˈroʊsɪs/',
    pos: 'Noun · آلية مرضية وعائية',
    category: 'Medical',
    specialty: 'Pathology & Vascular · علم الأمراض والأوعية',
    umdCode: 'UMD-I70.9',
    keepEnglish: true,
    favorite: false,
    collections: ['طب الطوارئ والقلب'],
    ingestedAt: 'قاعدة المعجم الطبي الموحد (UMD)',
    definitionAr:
      'مرض التهابي مزمن يصيب جدران الشرايين الكبيرة والمتوسطة ويتميز بتراكم الشحوم والخلايا الالتهابية والألياف لتشكيل لويحات عصيدية تسبب Ischemia وتؤدي إلى Angina Pectoris وMyocardial Infarction وIschemic Stroke.',
    definitionEn:
      'Chronic arterial disease characterized by intimal fibrofatty plaque formation narrowing the vascular lumen.',
    clinicalNote: 'السبب المرضي الأساسي لداء الشرايين التاجية واحتشاء عضلة القلب والسكتة الدماغية.',
    morphology: {
      prefix: { affix: 'Athero-', meaningAr: 'عصيدة شحمية', meaningEn: 'Gruel / plaque' },
      root: { affix: 'scler', meaningAr: 'تصلّب', meaningEn: 'Hardening' },
      suffix: { affix: '-osis', meaningAr: 'حالة مرضية', meaningEn: 'Pathological condition' },
      literalSynthesisAr: 'تصلّب الشرايين باللويحات العصيدية'
    },
    examples: [
      {
        en: 'Rupture of an unstable coronary plaque in Atherosclerosis triggers acute thrombosis and Myocardial Infarction.',
        ar: 'يؤدي تمزق اللويحة التاجية غير المستقرة في تصلّب الشرايين العصيدي إلى خثار حاد واحتشاء عضلة القلب.'
      },
      {
        en: 'Progressive carotid Atherosclerosis narrows the arterial lumen, causing cerebral Ischemia and Ischemic Stroke.',
        ar: 'يؤدي تصلّب الشرايين العصيدي السباتي المترقي إلى تضيق لمعة الشريان، مما يسبب نقص التروية الدموية الدماغي والسكتة الدماغية الإقفارية.'
      }
    ],
    relations: {
      synonyms: ['Arteriosclerotic Vascular Disease'],
      broader: ['Pathophysiology'],
      related: ['Myocardial Infarction', 'Angina Pectoris', 'Ischemic Stroke', 'Ischemia']
    }
  },

  // ==========================================================================
  // 2. ARTIFICIAL INTELLIGENCE & NLP LEXICON
  // ==========================================================================
  {
    id: 't1',
    term: 'Neural Network',
    termNormalized: 'neural network',
    translation: 'شبكة عصبية اصطناعية',
    phonetic: '/ˈnjʊərəl ˈnɛtwɜːrk/',
    pos: 'Noun · معمارية حوسبية',
    category: 'AI',
    specialty: 'Deep Learning & Medical NLP',
    keepEnglish: true,
    favorite: true,
    collections: ['معمارية الذكاء الاصطناعي', 'مراجعة أساسية'],
    ingestedAt: 'القاموس الأساسي',
    definitionAr:
      'نموذج حوسبي مستوحى من بنية الدماغ البشري، يتكون من طبقات مترابطة تعالج البيانات وتستخرج الأنماط المعقدة. تعتمد كلياً على تقنية Backpropagation لضبط الأوزان مع خوارزمية Gradient Descent، وتُعد الأساس لبناء نماذج Transformer الحديثة.',
    definitionEn:
      'A computational model inspired by the biological brain, relying on Backpropagation and Gradient Descent to power modern Transformer architectures.',
    examples: [
      {
        en: 'Training a deep Neural Network requires massive parallel compute and careful Backpropagation tuning.',
        ar: 'يتطلب تدريب شبكة عصبية اصطناعية عميقة قدرة حوسبة متوازية هائلة وضبطاً دقيقاً لخوارزمية الانتشار العكسي.'
      },
      {
        en: 'Clinical researchers applied a Neural Network to detect Myocardial Infarction patterns in ECG signals.',
        ar: 'طبّق الباحثون السريريون شبكة عصبية اصطناعية لاكتشاف أنماط احتشاء عضلة القلب في إشارات تخطيط القلب.'
      }
    ],
    relations: {
      synonyms: ['Artificial Neural Net', 'Connectionist System'],
      broader: ['Deep Learning'],
      related: ['Backpropagation', 'Transformer', 'Gradient Descent', 'Retrieval-Augmented Generation']
    }
  },
  {
    id: 't2',
    term: 'Backpropagation',
    termNormalized: 'backpropagation',
    translation: 'الانتشار العكسي للخطأ',
    phonetic: '/ˌbækprɒpəˈɡeɪʃən/',
    pos: 'Noun · خوارزمية رياضية',
    category: 'AI',
    specialty: 'Optimization & Neural Training',
    keepEnglish: true,
    favorite: false,
    collections: ['معمارية الذكاء الاصطناعي'],
    ingestedAt: 'القاموس الأساسي',
    definitionAr:
      'خوارزمية رياضية جوهرية لتدريب أي Neural Network، تقوم بحساب تدرج دالة الخسارة بالنسبة للأوزان الداخلية من الطبقات النهائية رجوعاً إلى البداية، وتعمل بالتكامل مع Gradient Descent لتقليل نسبة الخطأ تدريجياً.',
    definitionEn:
      'The core algorithm for training a Neural Network by calculating loss gradients layer-by-layer backward using Gradient Descent.',
    examples: [
      {
        en: 'Without efficient Backpropagation, updating millions of weights in a Transformer would be computationally infeasible.',
        ar: 'بدون خوارزمية الانتشار العكسي للخطأ الفعالة، سيكون تحديث ملايين الأوزان في نموذج المحول مستحيلاً حسابياً.'
      },
      {
        en: 'During each training epoch, Backpropagation computes layer gradients that guide Gradient Descent across the Neural Network.',
        ar: 'خلال كل دورة تدريبية، يحسب الانتشار العكسي للخطأ تدرجات الطبقات التي توجه الانحدار التدريجي عبر الشبكة العصبية الاصطناعية.'
      }
    ],
    relations: {
      synonyms: ['Backward Propagation of Errors'],
      broader: ['Neural Network'],
      related: ['Gradient Descent', 'Transformer']
    }
  },
  {
    id: 't3',
    term: 'Transformer',
    termNormalized: 'transformer',
    translation: 'نموذج المحوّل الانتباهي',
    phonetic: '/trænsˈfɔːrmər/',
    pos: 'Noun · بنية معمارية للذكاء الاصطناعي',
    category: 'AI',
    specialty: 'Natural Language Processing (NMT)',
    keepEnglish: true,
    favorite: true,
    collections: ['معمارية الذكاء الاصطناعي', 'النماذج اللغوية الكبيرة'],
    ingestedAt: 'القاموس الأساسي',
    definitionAr:
      'بنية معمارية ثورية تعتمد على آلية الانتباه الذاتي لمعالجة السلاسل النصية بالتوازي. تفوقت هذه البنية على كل Neural Network تقليدية في الترجمة العصبية ومهّدت الطريق لدمج النماذج مع أنظمة Retrieval-Augmented Generation.',
    definitionEn:
      'A deep learning architecture based on self-attention mechanisms, powering neural machine translation and Retrieval-Augmented Generation.',
    examples: [
      {
        en: 'Combining a quantized Transformer with Retrieval-Augmented Generation and glossary constraints eliminates clinical translation errors.',
        ar: 'إن دمج نموذج المحوّل الانتباهي المكمّم مع التوليد المعزز بالاسترجاع والقيود المعجمية يقضي على أخطاء الترجمة السريرية.'
      },
      {
        en: 'The self-attention mechanism in a Transformer Neural Network triggered a Paradigm Shift in clinical natural language processing.',
        ar: 'أحدثت آلية الانتباه الذاتي في الشبكة العصبية الاصطناعية لنموذج المحوّل الانتباهي تحولاً جذرياً في النموذج المعرفي لمعالجة اللغات الطبيعية السريرية.'
      }
    ],
    relations: {
      synonyms: ['Self-Attention Architecture'],
      broader: ['Neural Network'],
      related: ['Retrieval-Augmented Generation', 'Backpropagation', 'Gradient Descent']
    }
  },
  {
    id: 't4',
    term: 'Gradient Descent',
    termNormalized: 'gradient descent',
    translation: 'الانحدار التدريجي',
    phonetic: '/ˈɡreɪdiənt dɪˈsɛnt/',
    pos: 'Noun · خوارزمية تحسين',
    category: 'AI',
    specialty: 'Mathematical Optimization',
    keepEnglish: true,
    favorite: false,
    collections: ['معمارية الذكاء الاصطناعي'],
    ingestedAt: 'القاموس الأساسي',
    definitionAr:
      'خوارزمية تحسين تكرارية تُستخدم للعثور على القيم المثلى للمعاملات عبر التحرك في الاتجاه المعاكس لميل الدالة. تُنفذ هذه الخطوة مباشرة بعد حساب المشتقات بواسطة Backpropagation داخل كل Neural Network.',
    definitionEn:
      'An iterative first-order optimization algorithm used alongside Backpropagation to minimize loss functions in a Neural Network.',
    examples: [
      {
        en: 'Stochastic Gradient Descent updates Neural Network parameters iteratively using mini-batches.',
        ar: 'يقوم الانحدار التدريجي العشوائي بتحديث معاملات الشبكة العصبية تكرارياً باستخدام دفعات مصغرة.'
      },
      {
        en: 'Adaptive learning rates accelerate Gradient Descent convergence when training a large Transformer via Backpropagation.',
        ar: 'تعمل معدلات التعلم التكيفية على تسريع تقارب الانحدار التدريجي عند تدريب نموذج المحوّل الانتباهي الكبير عبر الانتشار العكسي للخطأ.'
      }
    ],
    relations: {
      synonyms: ['Steepest Descent'],
      broader: ['Neural Network'],
      related: ['Backpropagation', 'Transformer']
    }
  },
  {
    id: 't5',
    term: 'Retrieval-Augmented Generation',
    termNormalized: 'retrieval-augmented generation',
    translation: 'التوليد المعزّز بالاسترجاع المعرفي (RAG)',
    phonetic: '/rɪˈtriːvəl ɔːɡˈmɛntɪd ˌdʒɛnəˈreɪʃən/',
    pos: 'Noun · معمارية هجينة',
    category: 'AI',
    specialty: 'Knowledge-Grounded AI',
    keepEnglish: true,
    favorite: true,
    collections: ['النماذج اللغوية الكبيرة', 'مراجعة أساسية'],
    ingestedAt: 'القاموس الأساسي',
    definitionAr:
      'إطار عمل هجين يربط نماذج Transformer بمحرك بحث نصي أو قاعدة بيانات محلية مثل SQLite FTS5 لاسترجاع الوثائق الموثوقة قبل صياغة الإجابة. يعزز موثوقية Epistemology الأنظمة الذكية ويمنع الهلوسة.',
    definitionEn:
      'A hybrid framework connecting a Transformer model to an external index (such as SQLite FTS5) to ground responses in verified knowledge and strengthen system Epistemology.',
    examples: [
      {
        en: 'Our offline architecture pairs SQLite FTS5 with Retrieval-Augmented Generation for deterministic medical lookup.',
        ar: 'تجمع المعمارية المحلية لدينا بين محرك SQLite FTS5 وتقنية التوليد المعزّز بالاسترجاع المعرفي للبحث الطبي الحتمي.'
      },
      {
        en: 'Grounding a Transformer with Retrieval-Augmented Generation strengthens clinical Epistemology when reviewing Differential Diagnosis cases.',
        ar: 'يعزز ربط نموذج المحوّل الانتباهي بالتوليد المعزّز بالاسترجاع المعرفي نظرية المعرفة السريرية عند مراجعة حالات التشخيص التفريقي.'
      }
    ],
    relations: {
      synonyms: ['RAG Architecture', 'Grounded LLM Pipeline'],
      broader: ['Transformer'],
      related: ['Neural Network', 'Epistemology', 'Idempotency']
    }
  },

  // ==========================================================================
  // 3. SYSTEMS & SOFTWARE ENGINEERING LEXICON
  // ==========================================================================
  {
    id: 'p1',
    term: 'Idempotency',
    termNormalized: 'idempotency',
    translation: 'خاصية التكرار الآمن (ثبات النتيجة بتكرار التنفيذ)',
    phonetic: '/ˌaɪdɛmˈpoʊtənsi/',
    pos: 'Noun · مبدأ هندسي برمجي',
    category: 'Programming',
    specialty: 'Distributed Systems & Database Pipelines',
    keepEnglish: true,
    favorite: true,
    collections: ['هندسة الأنظمة والـ APIs', 'مراجعة أساسية'],
    ingestedAt: 'القاموس الأساسي',
    definitionAr:
      'مبدأ أساسي في تصميم قواعد البيانات والأنظمة الموزعة يضمن أن تنفيذ العملية نفسها عدة مرات ينتج عنه نفس الأثر تماماً كما لو نُفذت مرة واحدة. يحمي هذا المبدأ فهارس SQLite أثناء عمليات Concurrency ويمنع تضارب الدفعات.',
    definitionEn:
      'A foundational property in database pipelines ensuring that repeating an operation multiple times yields the exact same state without unintended side effects during high Concurrency.',
    examples: [
      {
        en: 'Our Termux ingestion pipeline uses SQLite UPSERT statements to guarantee Idempotency during batch syncs.',
        ar: 'يستخدم خط أنابيب الاستيعاب في Termux عبارات التحديث والإدراج في SQLite لضمان خاصية التكرار الآمن أثناء مزامنة الدفعات.'
      },
      {
        en: 'Enforcing Idempotency across pure functions allows safe Memoization even under heavy multi-threaded Concurrency.',
        ar: 'يتيح فرض خاصية التكرار الآمن عبر الدوال النقية تطبيق الاستذكار الحوسبي بأمان حتى في ظل التزامن التنفيذي الكثيف متعدد الخيوط.'
      }
    ],
    relations: {
      synonyms: ['Safe Retry Property', 'State Invariance'],
      broader: ['Concurrency'],
      related: ['Memoization', 'Garbage Collection']
    }
  },
  {
    id: 'p2',
    term: 'Memoization',
    termNormalized: 'memoization',
    translation: 'الاستذكار الحوسبي (التخزين المؤقت لنتائج الدوال)',
    phonetic: '/ˌmɛmoʊɪˈzeɪʃən/',
    pos: 'Noun · تقنية تحسين الأداء',
    category: 'Programming',
    specialty: 'Algorithmic Optimization & Memory',
    keepEnglish: true,
    favorite: false,
    collections: ['هندسة الأنظمة والـ APIs'],
    ingestedAt: 'القاموس الأساسي',
    definitionAr:
      'تقنية تحسين برمجية تقوم بحفظ نتائج استدعاءات الدوال المكلفة حسابياً في الذاكرة لإرجاع النتيجة فوراً عند تكرار نفس المدخلات. تعتمد فعالية Memoization على نقاء الدالة وارتباطها بمفهوم Idempotency، مع موازنة استهلاك الذاكرة عبر Garbage Collection.',
    definitionEn:
      'An optimization technique that caches expensive function calls based on input arguments, relying on Idempotency and balanced against Garbage Collection overhead.',
    examples: [
      {
        en: 'Bounded Memoization caches accelerate repeated morphological lookups while keeping Garbage Collection efficient.',
        ar: 'تعمل ذاكرات الاستذكار الحوسبي المحدودة على تسريع عمليات البحث الصرفي المتكررة مع الحفاظ على كفاءة تحرير الذاكرة التلقائي.'
      },
      {
        en: 'Deterministic morphological decomposition leverages Idempotency and Memoization to avoid redundant regex scans during high Concurrency.',
        ar: 'يستفيد التفكيك الصرفي الحتمي من خاصية التكرار الآمن والاستذكار الحوسبي لتجنب عمليات المسح المتكررة أثناء التزامن التنفيذي العالي.'
      }
    ],
    relations: {
      synonyms: ['Function Result Caching', 'Tabulation'],
      broader: ['Concurrency'],
      related: ['Idempotency', 'Garbage Collection']
    }
  },
  {
    id: 'p3',
    term: 'Concurrency',
    termNormalized: 'concurrency',
    translation: 'التزامن التنفيذي (تعدد المهام المتداخلة)',
    phonetic: '/kənˈkʌrənsi/',
    pos: 'Noun · معمارية الأنظمة',
    category: 'Programming',
    specialty: 'Systems Architecture',
    keepEnglish: true,
    favorite: false,
    collections: ['هندسة الأنظمة والـ APIs'],
    ingestedAt: 'القاموس الأساسي',
    definitionAr:
      'قدرة النظام البرمجي على إدارة وتنفيذ عدة مهام في فترات زمنية متداخلة دون تعارض. يتطلب التعامل مع Concurrency عالية تطبيق معايير Idempotency الصارمة وضبط إعدادات Garbage Collection لضمان عدم تجميد واجهة المستخدم.',
    definitionEn:
      'The composition of independently executing computations in overlapping time periods, requiring strict Idempotency and careful Garbage Collection tuning.',
    examples: [
      {
        en: 'SQLite WAL mode enables high read Concurrency while a background Termux script writes new dictionary batches.',
        ar: 'يتيح وضع WAL في SQLite مستوى عالياً من التزامن التنفيذي للقراءة بينما يقوم سكربت Termux في الخلفية بكتابة دفعات القاموس الجديدة.'
      },
      {
        en: 'Combining non-blocking Concurrency with transactional Idempotency prevents database lock contention and reduces Garbage Collection pauses.',
        ar: 'إن الجمع بين التزامن التنفيذي غير الحاجب وخاصية التكرار الآمن للمعاملات يمنع تنازع أقفال قاعدة البيانات ويقلل توقفات تحرير الذاكرة التلقائي.'
      }
    ],
    relations: {
      synonyms: ['Multitasking Execution', 'Parallel Interleaving'],
      broader: ['Idempotency'],
      related: ['Memoization', 'Garbage Collection']
    }
  },
  {
    id: 'p4',
    term: 'Garbage Collection',
    termNormalized: 'garbage collection',
    translation: 'تحرير الذاكرة التلقائي (جمع القمامة البرمجية)',
    phonetic: '/ˈɡɑːrbɪdʒ kəˈlɛkʃən/',
    pos: 'Noun · إدارة موارد النظام',
    category: 'Programming',
    specialty: 'Runtime Memory Management',
    keepEnglish: true,
    favorite: false,
    collections: ['هندسة الأنظمة والـ APIs'],
    ingestedAt: 'القاموس الأساسي',
    definitionAr:
      'آلية إدارة ذاكرة آلية في بيئات التشغيل الحديثة تقوم برصد الكائنات التي لم يعد البرنامج بحاجة إليها وتحرير مساحتها. تتأثر كفاءة Garbage Collection بحجم بيانات Memoization المخزنة ومستوى Concurrency النشط.',
    definitionEn:
      'Automatic memory management that reclaims unused heap allocations, interacting closely with Memoization caches and multi-threaded Concurrency.',
    examples: [
      {
        en: 'Closing database cursors and releasing unused buffers promptly allows Garbage Collection to maintain smooth application performance.',
        ar: 'يتيح إغلاق مؤشرات قاعدة البيانات وتحرير المخازن المؤقتة غير المستخدمة فوراً لآلية تحرير الذاكرة التلقائي الحفاظ على سلاسة أداء التطبيق.'
      },
      {
        en: 'Unbounded Memoization tables under heavy Concurrency can increase heap pressure and trigger frequent Garbage Collection cycles.',
        ar: 'يمكن أن تؤدي جداول الاستذكار الحوسبي غير المحدودة تحت التزامن التنفيذي الكثيف إلى زيادة ضغط الذاكرة وتحفيز دورات تحرير الذاكرة التلقائي المتكررة.'
      }
    ],
    relations: {
      synonyms: ['Automatic Memory Reclamation', 'Heap Compaction'],
      broader: ['Concurrency'],
      related: ['Memoization', 'Idempotency']
    }
  },

  // ==========================================================================
  // 4. GENERAL EPISTEMOLOGY & METHODOLOGY LEXICON
  // ==========================================================================
  {
    id: 'g1',
    term: 'Paradigm Shift',
    termNormalized: 'paradigm shift',
    translation: 'تحوّل جذري في النموذج المعرفي',
    phonetic: '/ˈpærədaɪm ʃɪft/',
    pos: 'Noun · مفهوم معرفي وفلسفي',
    category: 'General',
    specialty: 'Philosophy of Science',
    keepEnglish: true,
    favorite: true,
    collections: ['المفاهيم الفكرية والمنهجية'],
    ingestedAt: 'القاموس الأساسي',
    definitionAr:
      'تغيير جوهري وشامل في الفرضيات الأساسية والمنهجيات السائدة داخل حقل علمي أو تقني، كما صاغه الفيلسوف توماس كون في إطار Epistemology العلوم. على سبيل المثال، أحدث ظهور معمارية Transformer حالة Paradigm Shift كاملة في الترجمة العصبية.',
    definitionEn:
      'A fundamental transformation in the underlying assumptions and practices of a scientific discipline, rooted in Epistemology and exemplified by the Transformer revolution.',
    examples: [
      {
        en: 'The transition from unconstrained neural translation to Glossary-Constrained Transformer pipelines represents a clinical Paradigm Shift.',
        ar: 'يمثل الانتقال من الترجمة العصبية غير المقيدة إلى خطوط أنابيب المحوّل المقيدة بالمعجم تحولاً جذرياً في النموذج المعرفي السريري.'
      },
      {
        en: 'In scientific Epistemology, a Paradigm Shift occurs when accumulated anomalies replace an older Heuristic model.',
        ar: 'في نظرية المعرفة العلمية، يحدث التحوّل الجذري في النموذج المعرفي عندما تحل الشواذ المتراكمة محل نموذج القاعدة الاستدلالية الأقدم.'
      }
    ],
    relations: {
      synonyms: ['Fundamental Transformation', 'Conceptual Revolution'],
      broader: ['Epistemology'],
      related: ['Heuristic', 'Transformer']
    }
  },
  {
    id: 'g2',
    term: 'Epistemology',
    termNormalized: 'epistemology',
    translation: 'نظرية المعرفة (الإبستمولوجيا)',
    phonetic: '/ɪˌpɪstɪˈmɒlədʒi/',
    pos: 'Noun · منهجية علمية',
    category: 'General',
    specialty: 'Knowledge Engineering',
    keepEnglish: true,
    favorite: false,
    collections: ['المفاهيم الفكرية والمنهجية'],
    ingestedAt: 'القاموس الأساسي',
    definitionAr:
      'المبحث الفلسفي الذي يدرس طبيعة المعرفة البشرية ومصادرها وحدودها ومعايير التحقق من صحتها. تتقاطع Epistemology حديثاً مع بناء الرسوم البيانية المعرفية وأنظمة Retrieval-Augmented Generation وتفسر كيف تقود قواعد Heuristic إلى حدوث Paradigm Shift.',
    definitionEn:
      'The philosophical study of the nature, origin, and limits of human knowledge, informing knowledge graphs, Heuristic reasoning, and every scientific Paradigm Shift.',
    examples: [
      {
        en: 'Medical Differential Diagnosis applies clinical Epistemology and Heuristic rules to rule out rare pathologies.',
        ar: 'يطبق التشخيص التفريقي الطبي نظرية المعرفة السريرية والقواعد الاستدلالية لاستبعاد الأمراض النادرة.'
      },
      {
        en: 'Combining Retrieval-Augmented Generation with verified lexicons establishes a rigorous Epistemology that drives a Paradigm Shift in medical AI.',
        ar: 'يرسي دمج التوليد المعزّز بالاسترجاع المعرفي مع المعاجم الموثقة نظرية معرفة صارمة تقود تحولاً جذرياً في النموذج المعرفي للذكاء الاصطناعي الطبي.'
      }
    ],
    relations: {
      synonyms: ['Theory of Knowledge', 'Cognitive Philosophy'],
      broader: ['Paradigm Shift'],
      related: ['Heuristic', 'Retrieval-Augmented Generation']
    }
  },
  {
    id: 'g3',
    term: 'Heuristic',
    termNormalized: 'heuristic',
    translation: 'قاعدة استدلالية عملية',
    phonetic: '/hjʊˈrɪstɪk/',
    pos: 'Noun / Adjective · منهجية حل المشكلات',
    category: 'General',
    specialty: 'Decision Theory & Triage',
    keepEnglish: true,
    favorite: false,
    collections: ['المفاهيم الفكرية والمنهجية'],
    ingestedAt: 'القاموس الأساسي',
    definitionAr:
      'منهجية عملية أو قاعدة إرشادية سريعة تُستخدم لاتخاذ القرارات أو حل المشكلات المعقدة عندما يكون الحل الرياضي الشامل بطيئاً. تُستخدم قواعد Heuristic بكثافة في خوارزميات البحث والـ Epistemology التطبيقية، وكذلك في تسريع الفرز السريري.',
    definitionEn:
      'A practical mental shortcut or algorithmic rule-of-thumb used for rapid problem-solving in Epistemology, search algorithms, and clinical triage.',
    examples: [
      {
        en: 'Experienced clinicians rely on a rapid Heuristic during emergency triage before completing a full Differential Diagnosis.',
        ar: 'يعتمد الأطباء ذوو الخبرة على قاعدة استدلالية عملية سريعة أثناء فرز الطوارئ قبل استكمال التشخيص التفريقي الكامل.'
      },
      {
        en: 'Morphological affix decomposition acts as a deterministic Heuristic rooted in linguistic Epistemology for out-of-vocabulary medical terms.',
        ar: 'يعمل تفكيك اللواحق الصرفية كقاعدة استدلالية عملية حتمية متجذرة في نظرية المعرفة اللغوية للمصطلحات الطبية خارج المعجم.'
      }
    ],
    relations: {
      synonyms: ['Rule of Thumb', 'Mental Shortcut'],
      broader: ['Epistemology'],
      related: ['Paradigm Shift']
    }
  },
  {
    id: 'add034',
    term: 'Iron Deficiency Anemia',
    termNormalized: 'iron deficiency anemia',
    translation: 'فقر الدم بعوز الحديد',
    phonetic: '/ˈaɪərn dɪˈfɪʃənsi əˈniːmiə/',
    pos: 'Noun · متلازمة دموية',
    category: 'Medical',
    specialty: 'Hematology · أمراض الدم',
    umdCode: 'UMD-11034',
    keepEnglish: true,
    favorite: false,
    collections: ['أمراض الدم والمختبر'],
    ingestedAt: 'القاموس الأساسي',
    definitionAr:
      'أشيع أنواع فقر الدم صغير الكريات ناقص الصباغ (Microcytic Hypochromic Anemia)، ينتج عن نقص مخزون الحديد اللازم لتصنيع الهيم والهيموغلوبين بسبب نقص الوارد الغذائي، أو زيادة الاحتياج أثناء النمو والحمل والرضاعة، أو فقدان الدم المزمن.',
    definitionEn:
      'The most common cause of microcytic hypochromic anemia resulting from depleted iron stores impaired heme and hemoglobin synthesis.',
    examples: [
      {
        en: 'Iron deficiency anemia is characterized by decreased serum ferritin, increased TIBC, and microcytic hypochromic RBCs.',
        ar: 'يتميز فقر الدم بعوز الحديد بانخفاض فيريتين المصل وارتفاع السعة الكلية لارتباط الحديد وكريات دم حمراء صغيرة الحجم ناقصة الصباغ.'
      }
    ],
    relations: {
      synonyms: ['IDA', 'Sideropenic Anemia'],
      broader: ['Anemia'],
      related: ['Ferritin', 'Transferrin', 'Thalassemia', 'Anemia of Chronic Disease', 'Hemoglobin']
    }
  },
  {
    id: 'add035',
    term: 'Ferritin',
    termNormalized: 'ferritin',
    translation: 'الفيريتين',
    phonetic: '/ˈfɛrɪtɪn/',
    pos: 'Noun · بروتين مخبري',
    category: 'Medical',
    specialty: 'Hematology · أمراض الدم',
    umdCode: 'UMD-11035',
    keepEnglish: true,
    favorite: false,
    collections: ['أمراض الدم والمختبر'],
    ingestedAt: 'القاموس الأساسي',
    definitionAr:
      'البروتين الأساسي المخزّن للحديد داخل الخلايا، ويُعد مستوى الفيريتين في المصل المؤشر المخبري الأكثر دقة وحساسية لتقييم مخزون الحديد في الجسم وتشخيص فقر الدم بعوز الحديد.',
    definitionEn:
      'The primary intracellular iron-storage protein; serum ferritin is the most sensitive laboratory marker of total body iron stores.',
    examples: [
      {
        en: 'Decreased serum ferritin is the earliest laboratory sign of Iron Deficiency Anemia.',
        ar: 'يُعد انخفاض فيريتين المصل العلامة المخبرية الأبكر لفقر الدم بعوز الحديد.'
      }
    ],
    relations: {
      synonyms: ['Serum Ferritin'],
      broader: ['Hematology'],
      related: ['Iron Deficiency Anemia', 'Transferrin', 'Total Iron-Binding Capacity', 'Hemoglobin']
    }
  },
  {
    id: 'add036',
    term: 'Transferrin',
    termNormalized: 'transferrin',
    translation: 'الترانسفيرين',
    phonetic: '/trænsˈfɛrɪn/',
    pos: 'Noun · بروتين ناقل',
    category: 'Medical',
    specialty: 'Hematology · أمراض الدم',
    umdCode: 'UMD-11036',
    keepEnglish: true,
    favorite: false,
    collections: ['أمراض الدم والمختبر'],
    ingestedAt: 'القاموس الأساسي',
    definitionAr:
      'البروتين السكري الرئيسي المسؤول عن نقل الحديد في بلازما الدم من مواقع الامتصاص والتخزين إلى طلائع الكريات الحمراء في نقي العظم.',
    definitionEn:
      'The principal plasma glycoprotein synthesized by the liver that transports iron through the blood to bone marrow erythroblasts.',
    examples: [
      {
        en: 'In Iron Deficiency Anemia, serum transferrin (TIBC) is increased while transferrin saturation is decreased.',
        ar: 'في فقر الدم بعوز الحديد، يرتفع ترانسفيرين المصل (السعة الكلية لارتباط الحديد) بينما ينخفض إشباع الترانسفيرين.'
      }
    ],
    relations: {
      synonyms: ['Siderophilin', 'Serum Transferrin'],
      broader: ['Hematology'],
      related: ['Ferritin', 'Total Iron-Binding Capacity', 'Iron Deficiency Anemia']
    }
  },
  {
    id: 'add039',
    term: 'Anemia of Chronic Disease',
    termNormalized: 'anemia of chronic disease',
    translation: 'فقر الدم المصاحب للأمراض المزمنة',
    phonetic: '/əˈniːmiə əv ˈkrɒnɪk dɪˈziːz/',
    pos: 'Noun · متلازمة دموية',
    category: 'Medical',
    specialty: 'Hematology · أمراض الدم',
    umdCode: 'UMD-11039',
    keepEnglish: true,
    favorite: false,
    collections: ['أمراض الدم والمختبر'],
    ingestedAt: 'القاموس الأساسي',
    definitionAr:
      'فقر دم سويّ الكريات أو صغير الكريات ينشأ في سياق الالتهابات المزمنة أو الأمراض المناعية أو الأورام نتيجة زيادة الهيبسيدين واحتجاز الحديد داخل البلاعم.',
    definitionEn:
      'Normocytic or microcytic anemia associated with chronic inflammation, autoimmune disorders, or malignancy due to hepcidin-mediated iron sequestration.',
    examples: [
      {
        en: 'Anemia of Chronic Disease (AOCD) is one of the four major types of microcytic anemia.',
        ar: 'يُعد فقر الدم المصاحب للأمراض المزمنة أحد الأنواع الأربعة الرئيسية لفقر الدم صغير الكريات.'
      }
    ],
    relations: {
      synonyms: ['AOCD', 'ACD', 'Anemia of Inflammation'],
      broader: ['Anemia'],
      related: ['Iron Deficiency Anemia', 'Ferritin', 'Transferrin', 'Thalassemia']
    }
  },
  {
    id: 'add045',
    term: 'Thalassemia',
    termNormalized: 'thalassemia',
    translation: 'الثلاسيميا (فقر دم حوض البحر الأبيض المتوسط)',
    phonetic: '/ˌθæləˈsiːmiə/',
    pos: 'Noun · اعتلال خضاب وراثي',
    category: 'Medical',
    specialty: 'Hematology · أمراض الدم',
    umdCode: 'UMD-11045',
    keepEnglish: true,
    favorite: false,
    collections: ['أمراض الدم والمختبر'],
    ingestedAt: 'القاموس الأساسي',
    definitionAr:
      'مجموعة من اضطرابات الدم الانحلالية الوراثية تنتج عن عيب كمي في تصنيع سلاسل الغلوبين (ألفا أو بيتا) المكونة للهيموغلوبين، مما يؤدي إلى فقر دم صغير الكريات.',
    definitionEn:
      'An inherited autosomal recessive congenital hemolytic anemia characterized by decreased or absent synthesis of alpha or beta globin chains of hemoglobin.',
    examples: [
      {
        en: 'Thalassemia is a congenital hemolytic anemia that presents with microcytic hypochromic RBCs and target cells.',
        ar: 'الثلاسيميا هي فقر دم انحلالي خلقي يتظاهر بكريات دم حمراء صغيرة الحجم ناقصة الصباغ وخلايا هدفية.'
      }
    ],
    relations: {
      synonyms: ['Mediterranean Anemia'],
      broader: ['Anemia'],
      related: ['Hemoglobin', 'Erythrocyte', 'Iron Deficiency Anemia', 'Anemia of Chronic Disease']
    }
  }
];

export const EXTRA_LINKABLE_ALIASES: Record<string, string> = {
  'Deep Learning': 't1',
  'Differential Diagnosis': 'm1',
  'Pathophysiology': 'm2',
  'RBC': 'm8',
  'RBCs': 'm8',
  'Hgb': 'm7',
  'Hb': 'm7',
  'Gallstones': 'm6',
  'ADHF': 'm10',
  'AFib': 'm12',
  'DKA': 'm16',
  'CKD': 'm17',
  'CVA': 'm20',
  'SAH': 'm21',
  'PE': 'm23',
  'Anaphylaxis': 'm25',
  'IDA': 'add034',
  'AOCD': 'add039'
};

// ============================================================================
// EXHAUSTIVE CLINICAL ABBREVIATIONS (PHASE 2 MERGED)
// Ambiguous Context-Triggered Abbreviations + High-Frequency Ward/Rx Shorthand
// ============================================================================
export const CLINICAL_ABBREVIATIONS: ClinicalAbbreviation[] = [
  // 1. Ambiguous Abbreviations (Context-Resolved)
  {
    id: 'ab1',
    abbr: 'MS',
    isAmbiguous: true,
    defaultExpansionEn: 'Multiple Sclerosis',
    defaultTranslationAr: 'التصلب اللويحي المتعدد',
    category: 'Neurology & Labs',
    priority: 100,
    candidates: [
      {
        expansionEn: 'Multiple Sclerosis',
        translationAr: 'التصلب اللويحي المتعدد',
        specialty: 'Neurology · طب الأعصاب',
        triggers: [
          { token: 'demyelinating', weight: 10 },
          { token: 'optic', weight: 8 },
          { token: 'neuritis', weight: 9 },
          { token: 'plaques', weight: 9 },
          { token: 'mri', weight: 7 },
          { token: 'relapsing', weight: 9 },
          { token: 'remitting', weight: 9 },
          { token: 'neurological', weight: 7 },
          { token: 'paresthesia', weight: 8 },
          { token: 'ataxia', weight: 7 },
          { token: 'weakness', weight: 5 }
        ]
      },
      {
        expansionEn: 'Mitral Stenosis',
        translationAr: 'تضيّق الصمام التاجي (الميترالي)',
        specialty: 'Cardiology · أمراض القلب',
        triggers: [
          { token: 'diastolic', weight: 10 },
          { token: 'murmur', weight: 10 },
          { token: 'rheumatic', weight: 9 },
          { token: 'atrial', weight: 8 },
          { token: 'echocardiogram', weight: 8 },
          { token: 'valve', weight: 9 },
          { token: 'apex', weight: 8 },
          { token: 'opening', weight: 7 },
          { token: 'snap', weight: 8 },
          { token: 'cardiac', weight: 6 }
        ]
      },
      {
        expansionEn: 'Morphine Sulfate',
        translationAr: 'سلفات المورفين',
        specialty: 'Pharmacology · الأدوية والتخدير',
        triggers: [
          { token: 'iv', weight: 9 },
          { token: 'mg', weight: 10 },
          { token: 'pain', weight: 8 },
          { token: 'prn', weight: 9 },
          { token: 'analgesia', weight: 9 },
          { token: 'administered', weight: 8 },
          { token: 'bolus', weight: 8 },
          { token: 'subcutaneous', weight: 7 },
          { token: 'dose', weight: 7 }
        ]
      }
    ]
  },
  {
    id: 'ab2',
    abbr: 'PT',
    isAmbiguous: true,
    defaultExpansionEn: 'Patient',
    defaultTranslationAr: 'المريض',
    category: 'Ward & Hx',
    priority: 95,
    candidates: [
      {
        expansionEn: 'Patient',
        translationAr: 'المريض',
        specialty: 'General Clinical · سريري عام',
        triggers: [
          { token: 'admitted', weight: 9 },
          { token: 'presents', weight: 9 },
          { token: 'c/o', weight: 10 },
          { token: 'hx', weight: 8 },
          { token: 'history', weight: 7 },
          { token: 'male', weight: 8 },
          { token: 'female', weight: 8 },
          { token: 'yo', weight: 9 },
          { token: 'denies', weight: 8 },
          { token: 'reports', weight: 7 }
        ]
      },
      {
        expansionEn: 'Prothrombin Time',
        translationAr: 'زمن البروثرومبين (فحص التخثر)',
        specialty: 'Hematology & Labs · المختبر وأمراض الدم',
        triggers: [
          { token: 'inr', weight: 10 },
          { token: 'warfarin', weight: 10 },
          { token: 'aptt', weight: 9 },
          { token: 'ptt', weight: 9 },
          { token: 'seconds', weight: 8 },
          { token: 'coagulation', weight: 9 },
          { token: 'bleeding', weight: 7 },
          { token: 'elevated', weight: 6 },
          { token: 'heparin', weight: 7 }
        ]
      },
      {
        expansionEn: 'Physical Therapy',
        translationAr: 'العلاج الطبيعي والتأهيل الحركي',
        specialty: 'Rehabilitation · التأهيل الطبي',
        triggers: [
          { token: 'mobility', weight: 9 },
          { token: 'rehab', weight: 10 },
          { token: 'rehabilitation', weight: 10 },
          { token: 'gait', weight: 9 },
          { token: 'exercises', weight: 8 },
          { token: 'ambulation', weight: 9 },
          { token: 'discharge', weight: 6 },
          { token: 'walker', weight: 8 },
          { token: 'strength', weight: 6 }
        ]
      }
    ]
  },
  {
    id: 'ab3',
    abbr: 'PE',
    isAmbiguous: true,
    defaultExpansionEn: 'Pulmonary Embolism',
    defaultTranslationAr: 'الانصمام الرئوي (جلطة الشريان الرئوي)',
    category: 'Cardiopulmonary',
    priority: 95,
    candidates: [
      {
        expansionEn: 'Pulmonary Embolism',
        translationAr: 'الانصمام الرئوي (جلطة الشريان الرئوي)',
        specialty: 'Pulmonology & Emergency · الصدرية والطوارئ',
        triggers: [
          { token: 'dvt', weight: 10 },
          { token: 'ctpa', weight: 10 },
          { token: 'd-dimer', weight: 9 },
          { token: 'anticoagulation', weight: 9 },
          { token: 'heparin', weight: 8 },
          { token: 'tachypnea', weight: 8 },
          { token: 'hypoxia', weight: 8 },
          { token: 'pleuritic', weight: 9 },
          { token: 'chest', weight: 6 }
        ]
      },
      {
        expansionEn: 'Physical Examination',
        translationAr: 'الفحص السريري (البدني)',
        specialty: 'General Ward · الفحص السريري',
        triggers: [
          { token: 'vitals', weight: 9 },
          { token: 'afebrile', weight: 9 },
          { token: 'auscultation', weight: 8 },
          { token: 'palpation', weight: 9 },
          { token: 'abdomen', weight: 7 },
          { token: 'nad', weight: 9 },
          { token: 'wnl', weight: 8 },
          { token: 'unremarkable', weight: 9 }
        ]
      }
    ]
  },
  {
    id: 'ab4',
    abbr: 'MI',
    isAmbiguous: true,
    defaultExpansionEn: 'Myocardial Infarction',
    defaultTranslationAr: 'احتشاء عضلة القلب',
    category: 'Cardiopulmonary',
    priority: 96,
    candidates: [
      {
        expansionEn: 'Myocardial Infarction',
        translationAr: 'احتشاء عضلة القلب',
        specialty: 'Cardiology · أمراض القلب',
        triggers: [
          { token: 'stemi', weight: 10 },
          { token: 'nstemi', weight: 10 },
          { token: 'troponin', weight: 10 },
          { token: 'ecg', weight: 8 },
          { token: 'ischemia', weight: 9 },
          { token: 'coronary', weight: 9 },
          { token: 'angina', weight: 8 },
          { token: 'catheterization', weight: 8 }
        ]
      },
      {
        expansionEn: 'Mitral Insufficiency (Regurgitation)',
        translationAr: 'قصور (ارتجاع) الصمام التاجي',
        specialty: 'Cardiology · أمراض الصمامات',
        triggers: [
          { token: 'systolic', weight: 9 },
          { token: 'murmur', weight: 9 },
          { token: 'holosystolic', weight: 10 },
          { token: 'regurgitation', weight: 10 },
          { token: 'valve', weight: 8 },
          { token: 'prolapse', weight: 9 }
        ]
      }
    ]
  },
  {
    id: 'ab5',
    abbr: 'CA',
    isAmbiguous: true,
    defaultExpansionEn: 'Carcinoma (Malignancy)',
    defaultTranslationAr: 'سرطان (ورم خبيث)',
    category: 'Neurology & Labs',
    priority: 90,
    candidates: [
      {
        expansionEn: 'Carcinoma (Malignancy)',
        translationAr: 'سرطان (ورم خبيث)',
        specialty: 'Oncology · علم الأورام',
        triggers: [
          { token: 'metastatic', weight: 10 },
          { token: 'biopsy', weight: 9 },
          { token: 'oncology', weight: 9 },
          { token: 'chemotherapy', weight: 9 },
          { token: 'staging', weight: 8 },
          { token: 'tumor', weight: 9 },
          { token: 'resection', weight: 8 }
        ]
      },
      {
        expansionEn: 'Calcium (Serum Calcium)',
        translationAr: 'الكالسيوم في الدم',
        specialty: 'Biochemistry & Labs · الكيمياء الحيوية والمختبر',
        triggers: [
          { token: 'mg/dl', weight: 10 },
          { token: 'mmol/l', weight: 10 },
          { token: 'albumin', weight: 8 },
          { token: 'pth', weight: 9 },
          { token: 'electrolytes', weight: 9 },
          { token: 'vitamin', weight: 6 },
          { token: 'ionized', weight: 9 }
        ]
      }
    ]
  },
  {
    id: 'ab6',
    abbr: 'RA',
    isAmbiguous: true,
    defaultExpansionEn: 'Rheumatoid Arthritis',
    defaultTranslationAr: 'التهاب المفاصل الروماتويدي',
    category: 'Ward & Hx',
    priority: 90,
    candidates: [
      {
        expansionEn: 'Rheumatoid Arthritis',
        translationAr: 'التهاب المفاصل الروماتويدي',
        specialty: 'Rheumatology · أمراض المفاصل والروماتيزم',
        triggers: [
          { token: 'synovitis', weight: 10 },
          { token: 'joints', weight: 9 },
          { token: 'methotrexate', weight: 10 },
          { token: 'autoimmune', weight: 8 },
          { token: 'morning', weight: 7 },
          { token: 'stiffness', weight: 8 },
          { token: 'anti-ccp', weight: 10 }
        ]
      },
      {
        expansionEn: 'Right Atrium',
        translationAr: 'الأذين الأيمن للقلب',
        specialty: 'Cardiology · أمراض القلب',
        triggers: [
          { token: 'rv', weight: 9 },
          { token: 'tricuspid', weight: 10 },
          { token: 'vena', weight: 9 },
          { token: 'cava', weight: 9 },
          { token: 'pressure', weight: 7 },
          { token: 'catheter', weight: 8 },
          { token: 'echocardiogram', weight: 8 }
        ]
      },
      {
        expansionEn: 'Room Air',
        translationAr: 'هواء الغرفة الاعتيادي (بدون أكسجين إضافي)',
        specialty: 'Pulmonology & Ward · الصدرية والأجنحة',
        triggers: [
          { token: 'spo2', weight: 10 },
          { token: 'saturation', weight: 10 },
          { token: '98%', weight: 8 },
          { token: '99%', weight: 8 },
          { token: 'breathing', weight: 8 },
          { token: 'oxygen', weight: 7 }
        ]
      }
    ]
  },

  // 2. Unambiguous Cardiopulmonary, Neurology, Lab, Ward & Rx Abbreviations
  { id: 'ab7', abbr: 'CHF', isAmbiguous: false, defaultExpansionEn: 'Congestive Heart Failure', defaultTranslationAr: 'فشل القلب الاحتقاني', category: 'Cardiopulmonary', priority: 90, candidates: [] },
  { id: 'ab8', abbr: 'SOB', isAmbiguous: false, defaultExpansionEn: 'Shortness of Breath (Dyspnea)', defaultTranslationAr: 'ضيق التنفس (الزلة التنفسية)', category: 'Cardiopulmonary', priority: 90, candidates: [] },
  { id: 'ab9', abbr: 'DOE', isAmbiguous: false, defaultExpansionEn: 'Dyspnea on Exertion', defaultTranslationAr: 'الزلة التنفسية الجهدية', category: 'Cardiopulmonary', priority: 89, candidates: [] },
  { id: 'ab10', abbr: 'PND', isAmbiguous: false, defaultExpansionEn: 'Paroxysmal Nocturnal Dyspnea', defaultTranslationAr: 'الزلة التنفسية الليلية الانتيابية', category: 'Cardiopulmonary', priority: 88, candidates: [] },
  { id: 'ab11', abbr: 'COPD', isAmbiguous: false, defaultExpansionEn: 'Chronic Obstructive Pulmonary Disease', defaultTranslationAr: 'الداء الرئوي السادّ المزمن', category: 'Cardiopulmonary', priority: 90, candidates: [] },
  { id: 'ab12', abbr: 'ARDS', isAmbiguous: false, defaultExpansionEn: 'Acute Respiratory Distress Syndrome', defaultTranslationAr: 'متلازمة الضائقة التنفسية الحادة', category: 'Cardiopulmonary', priority: 90, candidates: [] },
  { id: 'ab13', abbr: 'HTN', isAmbiguous: false, defaultExpansionEn: 'Hypertension', defaultTranslationAr: 'فرط ضغط الدم الشرياني', category: 'Cardiopulmonary', priority: 90, candidates: [] },
  { id: 'ab14', abbr: 'DM', isAmbiguous: false, defaultExpansionEn: 'Diabetes Mellitus', defaultTranslationAr: 'داء السكري', category: 'Ward & Hx', priority: 90, candidates: [] },
  { id: 'ab15', abbr: 'DKA', isAmbiguous: false, defaultExpansionEn: 'Diabetic Ketoacidosis', defaultTranslationAr: 'الحماض الكيتوني السكري', category: 'Ward & Hx', priority: 90, candidates: [] },
  { id: 'ab16', abbr: 'CKD', isAmbiguous: false, defaultExpansionEn: 'Chronic Kidney Disease', defaultTranslationAr: 'مرض الكلى المزمن (القصور الكلوي المزمن)', category: 'Ward & Hx', priority: 90, candidates: [] },
  { id: 'ab17', abbr: 'AKI', isAmbiguous: false, defaultExpansionEn: 'Acute Kidney Injury', defaultTranslationAr: 'أذية الكلية الحادة (القصور الكلوي الحاد)', category: 'Ward & Hx', priority: 90, candidates: [] },
  { id: 'ab18', abbr: 'ESRD', isAmbiguous: false, defaultExpansionEn: 'End-Stage Renal Disease', defaultTranslationAr: 'الداء الكلوي بالمراحل النهائية', category: 'Ward & Hx', priority: 89, candidates: [] },
  { id: 'ab19', abbr: 'CVA', isAmbiguous: false, defaultExpansionEn: 'Cerebrovascular Accident (Stroke)', defaultTranslationAr: 'الحادث الوعائي الدماغي (السكتة الدماغية)', category: 'Neurology & Labs', priority: 90, candidates: [] },
  { id: 'ab20', abbr: 'TIA', isAmbiguous: false, defaultExpansionEn: 'Transient Ischemic Attack', defaultTranslationAr: 'نوبة نقص التروية الدماغية العابرة', category: 'Neurology & Labs', priority: 90, candidates: [] },
  { id: 'ab21', abbr: 'CAD', isAmbiguous: false, defaultExpansionEn: 'Coronary Artery Disease', defaultTranslationAr: 'داء الشرايين التاجية (الإكليلية)', category: 'Cardiopulmonary', priority: 90, candidates: [] },
  { id: 'ab22', abbr: 'ACS', isAmbiguous: false, defaultExpansionEn: 'Acute Coronary Syndrome', defaultTranslationAr: 'المتلازمة الإكليلية (التاجية) الحادة', category: 'Cardiopulmonary', priority: 90, candidates: [] },
  { id: 'ab23', abbr: 'STEMI', isAmbiguous: false, defaultExpansionEn: 'ST-Elevation Myocardial Infarction', defaultTranslationAr: 'احتشاء عضلة القلب المترافق بارتفاع القطعة ST', category: 'Cardiopulmonary', priority: 92, candidates: [] },
  { id: 'ab24', abbr: 'NSTEMI', isAmbiguous: false, defaultExpansionEn: 'Non-ST-Elevation Myocardial Infarction', defaultTranslationAr: 'احتشاء عضلة القلب غير المترافق بارتفاع القطعة ST', category: 'Cardiopulmonary', priority: 92, candidates: [] },
  { id: 'ab25', abbr: 'AFib', isAmbiguous: false, defaultExpansionEn: 'Atrial Fibrillation', defaultTranslationAr: 'الرجفان الأذيني', category: 'Cardiopulmonary', priority: 90, candidates: [] },
  { id: 'ab26', abbr: 'DVT', isAmbiguous: false, defaultExpansionEn: 'Deep Vein Thrombosis', defaultTranslationAr: 'خثار الأوردة العميقة', category: 'Cardiopulmonary', priority: 90, candidates: [] },
  { id: 'ab27', abbr: 'GERD', isAmbiguous: false, defaultExpansionEn: 'Gastroesophageal Reflux Disease', defaultTranslationAr: 'داء الارتجاع المعدي المريئي', category: 'Ward & Hx', priority: 88, candidates: [] },
  { id: 'ab28', abbr: 'IBD', isAmbiguous: false, defaultExpansionEn: 'Inflammatory Bowel Disease', defaultTranslationAr: 'الداء المعوي الالتهابي', category: 'Ward & Hx', priority: 88, candidates: [] },
  { id: 'ab29', abbr: 'UTI', isAmbiguous: false, defaultExpansionEn: 'Urinary Tract Infection', defaultTranslationAr: 'عدوى (إنتان) المسالك البولية', category: 'Ward & Hx', priority: 90, candidates: [] },
  { id: 'ab30', abbr: 'BPH', isAmbiguous: false, defaultExpansionEn: 'Benign Prostatic Hyperplasia', defaultTranslationAr: 'فرط التنسّج الحميد في البروستات', category: 'Ward & Hx', priority: 88, candidates: [] },
  { id: 'ab31', abbr: 'CBC', isAmbiguous: false, defaultExpansionEn: 'Complete Blood Count', defaultTranslationAr: 'تعداد الدم الكامل (صورة الدم الشاملة)', category: 'Neurology & Labs', priority: 90, candidates: [] },
  { id: 'ab32', abbr: 'ABG', isAmbiguous: false, defaultExpansionEn: 'Arterial Blood Gas', defaultTranslationAr: 'غازات الدم الشرياني', category: 'Neurology & Labs', priority: 90, candidates: [] },
  { id: 'ab33', abbr: 'LFT', isAmbiguous: false, defaultExpansionEn: 'Liver Function Tests', defaultTranslationAr: 'اختبارات وظائف الكبد', category: 'Neurology & Labs', priority: 88, candidates: [] },
  { id: 'ab34', abbr: 'RFT', isAmbiguous: false, defaultExpansionEn: 'Renal Function Tests', defaultTranslationAr: 'اختبارات وظائف الكلية', category: 'Neurology & Labs', priority: 88, candidates: [] },
  { id: 'ab35', abbr: 'CSF', isAmbiguous: false, defaultExpansionEn: 'Cerebrospinal Fluid', defaultTranslationAr: 'السائل الدماغي الشوكي', category: 'Neurology & Labs', priority: 89, candidates: [] },
  { id: 'ab36', abbr: 'ECG', isAmbiguous: false, defaultExpansionEn: 'Electrocardiogram', defaultTranslationAr: 'تخطيط كهربية القلب', category: 'Cardiopulmonary', priority: 90, candidates: [] },
  { id: 'ab37', abbr: 'EEG', isAmbiguous: false, defaultExpansionEn: 'Electroencephalogram', defaultTranslationAr: 'تخطيط كهربية الدماغ', category: 'Neurology & Labs', priority: 89, candidates: [] },
  { id: 'ab38', abbr: 'MRI', isAmbiguous: false, defaultExpansionEn: 'Magnetic Resonance Imaging', defaultTranslationAr: 'التصوير بالرنين المغناطيسي', category: 'Neurology & Labs', priority: 90, candidates: [] },
  { id: 'ab39', abbr: 'CT', isAmbiguous: false, defaultExpansionEn: 'Computed Tomography', defaultTranslationAr: 'التصوير المقطعي المحوسب (الطبقي المحوري)', category: 'Neurology & Labs', priority: 90, candidates: [] },
  { id: 'ab40', abbr: 'ICU', isAmbiguous: false, defaultExpansionEn: 'Intensive Care Unit', defaultTranslationAr: 'وحدة العناية المركزة', category: 'Ward & Hx', priority: 90, candidates: [] },
  { id: 'ab41', abbr: 'NICU', isAmbiguous: false, defaultExpansionEn: 'Neonatal Intensive Care Unit', defaultTranslationAr: 'وحدة العناية المركزة لحديثي الولادة', category: 'Ward & Hx', priority: 89, candidates: [] },
  { id: 'ab42', abbr: 'c/o', isAmbiguous: false, defaultExpansionEn: 'Complains of', defaultTranslationAr: 'يشكو من', category: 'Ward & Hx', priority: 95, candidates: [] },
  { id: 'ab43', abbr: 'Hx', isAmbiguous: false, defaultExpansionEn: 'Medical History', defaultTranslationAr: 'السوابق المرضية (التاريخ الطبي)', category: 'Ward & Hx', priority: 92, candidates: [] },
  { id: 'ab44', abbr: 'PMH', isAmbiguous: false, defaultExpansionEn: 'Past Medical History', defaultTranslationAr: 'التاريخ المرضي السابق', category: 'Ward & Hx', priority: 92, candidates: [] },
  { id: 'ab45', abbr: 'PSH', isAmbiguous: false, defaultExpansionEn: 'Past Surgical History', defaultTranslationAr: 'السوابق الجراحية', category: 'Ward & Hx', priority: 90, candidates: [] },
  { id: 'ab46', abbr: 'FH', isAmbiguous: false, defaultExpansionEn: 'Family History', defaultTranslationAr: 'التاريخ العائلي المرضي', category: 'Ward & Hx', priority: 88, candidates: [] },
  { id: 'ab47', abbr: 'HPI', isAmbiguous: false, defaultExpansionEn: 'History of Present Illness', defaultTranslationAr: 'قصة المرض الحالي', category: 'Ward & Hx', priority: 91, candidates: [] },
  { id: 'ab48', abbr: 'Dx', isAmbiguous: false, defaultExpansionEn: 'Diagnosis', defaultTranslationAr: 'التشخيص السريري', category: 'Ward & Hx', priority: 92, candidates: [] },
  { id: 'ab49', abbr: 'DDx', isAmbiguous: false, defaultExpansionEn: 'Differential Diagnosis', defaultTranslationAr: 'التشخيص التفريقي', category: 'Ward & Hx', priority: 92, candidates: [] },
  { id: 'ab50', abbr: 'Tx', isAmbiguous: false, defaultExpansionEn: 'Treatment / Therapy', defaultTranslationAr: 'الخطة العلاجية', category: 'Ward & Hx', priority: 90, candidates: [] },
  { id: 'ab51', abbr: 'Rx', isAmbiguous: false, defaultExpansionEn: 'Prescription / Medication', defaultTranslationAr: 'الوصفة الدوائية', category: 'Prescription (Rx)', priority: 90, candidates: [] },
  { id: 'ab52', abbr: 'Sx', isAmbiguous: false, defaultExpansionEn: 'Symptoms', defaultTranslationAr: 'الأعراض السريرية', category: 'Ward & Hx', priority: 89, candidates: [] },
  { id: 'ab53', abbr: 'Px', isAmbiguous: false, defaultExpansionEn: 'Prognosis', defaultTranslationAr: 'المآل السريري (الإنذار)', category: 'Ward & Hx', priority: 88, candidates: [] },
  { id: 'ab54', abbr: 'WNL', isAmbiguous: false, defaultExpansionEn: 'Within Normal Limits', defaultTranslationAr: 'ضمن الحدود الطبيعية', category: 'Ward & Hx', priority: 90, candidates: [] },
  { id: 'ab55', abbr: 'NAD', isAmbiguous: false, defaultExpansionEn: 'No Acute Distress', defaultTranslationAr: 'لا توجد ضائقة حادة ظاهرة', category: 'Ward & Hx', priority: 90, candidates: [] },
  { id: 'ab56', abbr: 'y/o', isAmbiguous: false, defaultExpansionEn: 'Years Old', defaultTranslationAr: 'من العمر (سنة)', category: 'Ward & Hx', priority: 90, candidates: [] },
  { id: 'ab57', abbr: 'yo', isAmbiguous: false, defaultExpansionEn: 'Years Old', defaultTranslationAr: 'من العمر (سنة)', category: 'Ward & Hx', priority: 90, candidates: [] },
  { id: 'ab58', abbr: 'PO', isAmbiguous: false, defaultExpansionEn: 'Per Os (By Mouth)', defaultTranslationAr: 'عن طريق الفم (فموياً)', category: 'Prescription (Rx)', priority: 90, candidates: [] },
  { id: 'ab59', abbr: 'IV', isAmbiguous: false, defaultExpansionEn: 'Intravenous', defaultTranslationAr: 'وريدياً (داخل الوريد)', category: 'Prescription (Rx)', priority: 90, candidates: [] },
  { id: 'ab60', abbr: 'IM', isAmbiguous: false, defaultExpansionEn: 'Intramuscular', defaultTranslationAr: 'عضلياً (داخل العضل)', category: 'Prescription (Rx)', priority: 90, candidates: [] },
  { id: 'ab61', abbr: 'SC', isAmbiguous: false, defaultExpansionEn: 'Subcutaneous', defaultTranslationAr: 'تحت الجلد', category: 'Prescription (Rx)', priority: 89, candidates: [] },
  { id: 'ab62', abbr: 'SL', isAmbiguous: false, defaultExpansionEn: 'Sublingual', defaultTranslationAr: 'تحت اللسان', category: 'Prescription (Rx)', priority: 89, candidates: [] },
  { id: 'ab63', abbr: 'NPO', isAmbiguous: false, defaultExpansionEn: 'Nil Per Os (Nothing by Mouth)', defaultTranslationAr: 'صائم تماماً عن الفم', category: 'Prescription (Rx)', priority: 92, candidates: [] },
  { id: 'ab64', abbr: 'PRN', isAmbiguous: false, defaultExpansionEn: 'Pro Re Nata (As Needed)', defaultTranslationAr: 'عند اللزوم', category: 'Prescription (Rx)', priority: 91, candidates: [] },
  { id: 'ab65', abbr: 'STAT', isAmbiguous: false, defaultExpansionEn: 'Statim (Immediately)', defaultTranslationAr: 'فوراً وبصورة عاجلة', category: 'Prescription (Rx)', priority: 92, candidates: [] },
  { id: 'ab66', abbr: 'QD', isAmbiguous: false, defaultExpansionEn: 'Quaque Die (Once Daily)', defaultTranslationAr: 'مرة واحدة يومياً', category: 'Prescription (Rx)', priority: 88, candidates: [] },
  { id: 'ab67', abbr: 'OD', isAmbiguous: false, defaultExpansionEn: 'Omne in Die (Once Daily)', defaultTranslationAr: 'مرة واحدة يومياً', category: 'Prescription (Rx)', priority: 88, candidates: [] },
  { id: 'ab68', abbr: 'BID', isAmbiguous: false, defaultExpansionEn: 'Bis In Die (Twice Daily)', defaultTranslationAr: 'مرتين يومياً (كل 12 ساعة)', category: 'Prescription (Rx)', priority: 90, candidates: [] },
  { id: 'ab69', abbr: 'TID', isAmbiguous: false, defaultExpansionEn: 'Ter In Die (Three Times Daily)', defaultTranslationAr: 'ثلاث مرات يومياً (كل 8 ساعات)', category: 'Prescription (Rx)', priority: 90, candidates: [] },
  { id: 'ab70', abbr: 'QID', isAmbiguous: false, defaultExpansionEn: 'Quater In Die (Four Times Daily)', defaultTranslationAr: 'أربع مرات يومياً (كل 6 ساعات)', category: 'Prescription (Rx)', priority: 90, candidates: [] },
  { id: 'ab71', abbr: 'QHS', isAmbiguous: false, defaultExpansionEn: 'Quaque Hora Somni (At Bedtime)', defaultTranslationAr: 'عند النوم ليلاً', category: 'Prescription (Rx)', priority: 88, candidates: [] },
  { id: 'ab72', abbr: 'AC', isAmbiguous: false, defaultExpansionEn: 'Ante Cibum (Before Meals)', defaultTranslationAr: 'قبل الطعام', category: 'Prescription (Rx)', priority: 87, candidates: [] },
  { id: 'ab73', abbr: 'PC', isAmbiguous: false, defaultExpansionEn: 'Post Cibum (After Meals)', defaultTranslationAr: 'بعد الطعام', category: 'Prescription (Rx)', priority: 87, candidates: [] },
  { id: 'ab74', abbr: 'RBCs', isAmbiguous: false, defaultExpansionEn: 'Red Blood Cells (Erythrocytes)', defaultTranslationAr: 'كريات الدم الحمراء', category: 'Neurology & Labs', priority: 94, candidates: [] },
  { id: 'ab75', abbr: 'RBC', isAmbiguous: false, defaultExpansionEn: 'Red Blood Cell (Erythrocyte)', defaultTranslationAr: 'كرية الدم الحمراء', category: 'Neurology & Labs', priority: 93, candidates: [] },
  { id: 'ab76', abbr: 'WBCs', isAmbiguous: false, defaultExpansionEn: 'White Blood Cells (Leukocytes)', defaultTranslationAr: 'كريات الدم البيضاء', category: 'Neurology & Labs', priority: 93, candidates: [] },
  { id: 'ab77', abbr: 'WBC', isAmbiguous: false, defaultExpansionEn: 'White Blood Cell (Leukocyte)', defaultTranslationAr: 'كرية الدم البيضاء', category: 'Neurology & Labs', priority: 92, candidates: [] },
  { id: 'ab78', abbr: 'TIBC', isAmbiguous: false, defaultExpansionEn: 'Total Iron-Binding Capacity', defaultTranslationAr: 'السعة الكلية لارتباط الحديد (TIBC)', category: 'Neurology & Labs', priority: 95, candidates: [] },
  { id: 'ab79', abbr: 'AOCD', isAmbiguous: false, defaultExpansionEn: 'Anemia of Chronic Disease', defaultTranslationAr: 'فقر الدم المصاحب للأمراض المزمنة', category: 'Neurology & Labs', priority: 95, candidates: [] },
  { id: 'ab80', abbr: 'IDA', isAmbiguous: false, defaultExpansionEn: 'Iron Deficiency Anemia', defaultTranslationAr: 'فقر الدم بعوز الحديد', category: 'Neurology & Labs', priority: 94, candidates: [] },
  { id: 'ab81', abbr: 'MCV', isAmbiguous: false, defaultExpansionEn: 'Mean Corpuscular Volume', defaultTranslationAr: 'متوسط حجم الكرية الحمراء (MCV)', category: 'Neurology & Labs', priority: 92, candidates: [] },
  { id: 'ab82', abbr: 'MCH', isAmbiguous: false, defaultExpansionEn: 'Mean Corpuscular Hemoglobin', defaultTranslationAr: 'متوسط هيموغلوبين الكرية (MCH)', category: 'Neurology & Labs', priority: 92, candidates: [] },
  { id: 'ab83', abbr: 'MCHC', isAmbiguous: false, defaultExpansionEn: 'Mean Corpuscular Hemoglobin Concentration', defaultTranslationAr: 'تركيز هيموغلوبين الكرية الوسطي (MCHC)', category: 'Neurology & Labs', priority: 92, candidates: [] },
  { id: 'ab84', abbr: 'RDW', isAmbiguous: false, defaultExpansionEn: 'Red Cell Distribution Width', defaultTranslationAr: 'عرض توزع كريات الدم الحمراء (RDW)', category: 'Neurology & Labs', priority: 91, candidates: [] },
  { id: 'ab85', abbr: 'Hb', isAmbiguous: false, defaultExpansionEn: 'Hemoglobin', defaultTranslationAr: 'الهيموغلوبين (خضاب الدم)', category: 'Neurology & Labs', priority: 91, candidates: [] },
  { id: 'ab86', abbr: 'Hgb', isAmbiguous: false, defaultExpansionEn: 'Hemoglobin', defaultTranslationAr: 'الهيموغلوبين (خضاب الدم)', category: 'Neurology & Labs', priority: 91, candidates: [] },
  { id: 'ab87', abbr: 'Hct', isAmbiguous: false, defaultExpansionEn: 'Hematocrit', defaultTranslationAr: 'الهيماتوكريت (مكداس الدم)', category: 'Neurology & Labs', priority: 91, candidates: [] },
  { id: 'ab88', abbr: 'PLT', isAmbiguous: false, defaultExpansionEn: 'Platelets (Thrombocytes)', defaultTranslationAr: 'الصفيحات الدموية', category: 'Neurology & Labs', priority: 91, candidates: [] },
  { id: 'ab89', abbr: 'LDH', isAmbiguous: false, defaultExpansionEn: 'Lactate Dehydrogenase', defaultTranslationAr: 'نازعة هيدروجين اللاكتات (LDH)', category: 'Neurology & Labs', priority: 90, candidates: [] },
  { id: 'ab90', abbr: 'ESR', isAmbiguous: false, defaultExpansionEn: 'Erythrocyte Sedimentation Rate', defaultTranslationAr: 'سرعة تثفل الكريات الحمراء (ESR)', category: 'Neurology & Labs', priority: 90, candidates: [] },
  { id: 'ab91', abbr: 'CRP', isAmbiguous: false, defaultExpansionEn: 'C-Reactive Protein', defaultTranslationAr: 'البروتين التفاعلي C', category: 'Neurology & Labs', priority: 90, candidates: [] },
  { id: 'ab92', abbr: 'INR', isAmbiguous: false, defaultExpansionEn: 'International Normalized Ratio', defaultTranslationAr: 'النسبة المعيارية الدولية للتخثر (INR)', category: 'Neurology & Labs', priority: 90, candidates: [] },
  { id: 'ab93', abbr: 'aPTT', isAmbiguous: false, defaultExpansionEn: 'Activated Partial Thromboplastin Time', defaultTranslationAr: 'زمن الثرومبوبلاستين الجزئي المفعل (aPTT)', category: 'Neurology & Labs', priority: 90, candidates: [] },
  { id: 'ab94', abbr: 'DIC', isAmbiguous: false, defaultExpansionEn: 'Disseminated Intravascular Coagulation', defaultTranslationAr: 'التخثر المنتشر داخل الأوعية (DIC)', category: 'Neurology & Labs', priority: 91, candidates: [] },
  { id: 'ab95', abbr: 'G6PD', isAmbiguous: false, defaultExpansionEn: 'Glucose-6-Phosphate Dehydrogenase', defaultTranslationAr: 'إنزيم سداسي فوسفات الغلوكوز النازع للهيدروجين (G6PD)', category: 'Neurology & Labs', priority: 91, candidates: [] }
];

// ============================================================================
// EXHAUSTIVE MORPHOLOGICAL AFFIXES ENCYCLOPEDIA (114 RULES FROM PHASE 2 SQL)
// ============================================================================
export const MORPHOLOGICAL_AFFIXES: MorphologicalAffix[] = [
  // 1A. Medical Prefixes (29 Prefixes)
  { id: 'af1', affix: 'Hyper-', cleanKey: 'hyper', type: 'prefix', meaningAr: 'فرط / ارتفاع فوق الطبيعي', meaningEn: 'Excessive / above normal', combiningRule: 'توضع في بداية المركب العربي بصيغة: فرط [الجذر]', examples: ['Hyperbilirubinemia', 'Hypertension', 'Hyperglycemia'] },
  { id: 'af2', affix: 'Hypo-', cleanKey: 'hypo', type: 'prefix', meaningAr: 'نقص / هبوط دون الطبيعي', meaningEn: 'Deficient / below normal', combiningRule: 'توضع في بداية المركب العربي بصيغة: نقص [الجذر] أو هبوط [الجذر]', examples: ['Hypoglycemia', 'Hypovolemic Shock', 'Hypotension'] },
  { id: 'af3', affix: 'Tachy-', cleanKey: 'tachy', type: 'prefix', meaningAr: 'تسرّع / فرط السرعة', meaningEn: 'Rapid / fast', combiningRule: 'توضع في بداية المركب العربي بصيغة: تسرّع [الجذر]', examples: ['Tachycardia', 'Tachypnea', 'Tachyarrhythmia'] },
  { id: 'af4', affix: 'Brady-', cleanKey: 'brady', type: 'prefix', meaningAr: 'بطء / تباطؤ', meaningEn: 'Slow', combiningRule: 'توضع في بداية المركب العربي بصيغة: بطء [الجذر]', examples: ['Bradycardia', 'Bradypnea', 'Bradykinesia'] },
  { id: 'af5', affix: 'Dys-', cleanKey: 'dys', type: 'prefix', meaningAr: 'عسر / خلل وظيفي / صعوبة', meaningEn: 'Painful / difficult / disordered', combiningRule: 'توضع في بداية المركب العربي بصيغة: عسر [الجذر] أو خلل [الجذر]', examples: ['Dyspnea', 'Dysphagia', 'Dysuria'] },
  { id: 'af6', affix: 'Eu-', cleanKey: 'eu', type: 'prefix', meaningAr: 'سويّ / طبيعي', meaningEn: 'Normal / good / healthy', combiningRule: 'توضع بصيغة: سويّ [الجذر] مثل سويّ الدرقية', examples: ['Euthyroid', 'Eupnea'] },
  { id: 'af7', affix: 'A-', cleanKey: 'a', type: 'prefix', meaningAr: 'انعدام / غياب / لا', meaningEn: 'Without / absence of', combiningRule: 'تسبق الحروف الساكنة وتترجم إلى: انعدام [الجذر] أو لا [الجذر]', examples: ['Arrhythmia', 'Apnea', 'Asystole'] },
  { id: 'af8', affix: 'An-', cleanKey: 'an', type: 'prefix', meaningAr: 'انعدام / فقر / غياب', meaningEn: 'Without / lack of', combiningRule: 'تسبق حروف العلة وتترجم إلى: فقر [الجذر] أو انعدام [الجذر]', examples: ['Anemia', 'Anuria', 'Analgesia'] },
  { id: 'af9', affix: 'Poly-', cleanKey: 'poly', type: 'prefix', meaningAr: 'تعدد / كثرة / غزارة', meaningEn: 'Many / excessive / multiple', combiningRule: 'تترجم إلى: تعدد [الجذر] أو بوال في السياق البولي', examples: ['Polyneuropathy', 'Polyuria', 'Polydipsia'] },
  { id: 'af10', affix: 'Oligo-', cleanKey: 'oligo', type: 'prefix', meaningAr: 'قلة / شحّ / ندرة', meaningEn: 'Few / scanty / little', combiningRule: 'تترجم إلى: شحّ [الجذر] أو قلة [الجذر]', examples: ['Oliguria', 'Oligohydramnios'] },
  { id: 'af11', affix: 'Pan-', cleanKey: 'pan', type: 'prefix', meaningAr: 'شامل / عموم / كل', meaningEn: 'All / entire / pan-', combiningRule: 'تترجم إلى: التهاب/نقص شامل لـ [الجذر]', examples: ['Pancytopenia', 'Pancreatitis'] },
  { id: 'af12', affix: 'Hemi-', cleanKey: 'hemi', type: 'prefix', meaningAr: 'نصفي / شقّي', meaningEn: 'Half / unilateral', combiningRule: 'تترجم إلى: نصفي أو شقّي مثل فالج شقّي', examples: ['Hemiplegia', 'Hemiparesis'] },
  { id: 'af13', affix: 'Para-', cleanKey: 'para', type: 'prefix', meaningAr: 'جانب / نظير / شلل نصفي سفلي', meaningEn: 'Beside / near / abnormal', combiningRule: 'تترجم إلى: نظير [الجذر] أو جانب [الجذر]', examples: ['Parathyroid', 'Paraplegia'] },
  { id: 'af14', affix: 'Peri-', cleanKey: 'peri', type: 'prefix', meaningAr: 'حول / محيط بـ (التامور/السمحاق)', meaningEn: 'Around / surrounding', combiningRule: 'تترجم إلى: حول [الجذر] أو التامور في سياق القلب', examples: ['Pericarditis', 'Periosteum'] },
  { id: 'af15', affix: 'Endo-', cleanKey: 'endo', type: 'prefix', meaningAr: 'داخلي / بطانة / شغاف', meaningEn: 'Within / inner / endo-', combiningRule: 'تترجم إلى: بطانة [الجذر] أو الشغاف في سياق القلب', examples: ['Endocarditis', 'Endoscopy', 'Endometrium'] },
  { id: 'af16', affix: 'Epi-', cleanKey: 'epi', type: 'prefix', meaningAr: 'فوق / أعلى / ظاهر', meaningEn: 'Upon / over / above', combiningRule: 'تترجم إلى: فوق [الجذر] أو الشغاف الخارجي', examples: ['Epigastric', 'Epidural', 'Epidermis'] },
  { id: 'af17', affix: 'Sub-', cleanKey: 'sub', type: 'prefix', meaningAr: 'تحت / دون', meaningEn: 'Under / below / subacute', combiningRule: 'تترجم إلى: تحت [الجذر] أو دون الحاد', examples: ['Subarachnoid Hemorrhage', 'Subcutaneous', 'Sublingual'] },
  { id: 'af18', affix: 'Infra-', cleanKey: 'infra', type: 'prefix', meaningAr: 'تحت / أسفل تشريحياً', meaningEn: 'Below / beneath', combiningRule: 'تترجم إلى: تحت [الجذر]', examples: ['Infraclavicular', 'Infrarenal'] },
  { id: 'af19', affix: 'Supra-', cleanKey: 'supra', type: 'prefix', meaningAr: 'فوق / أعلى تشريحياً', meaningEn: 'Above / supraventricular', combiningRule: 'تترجم إلى: فوق [الجذر] مثل فوق البطيني', examples: ['Supraventricular', 'Suprapubic'] },
  { id: 'af20', affix: 'Inter-', cleanKey: 'inter', type: 'prefix', meaningAr: 'بين / خلالي', meaningEn: 'Between / among', combiningRule: 'تترجم إلى: بين [الجذر]', examples: ['Intercostal', 'Interstitial'] },
  { id: 'af21', affix: 'Intra-', cleanKey: 'intra', type: 'prefix', meaningAr: 'داخل / ضمن', meaningEn: 'Inside / within', combiningRule: 'تترجم إلى: داخل [الجذر] مثل داخل الوريد أو داخل القحف', examples: ['Intravenous', 'Intracranial', 'Intramuscular'] },
  { id: 'af22', affix: 'Trans-', cleanKey: 'trans', type: 'prefix', meaningAr: 'عبر / خلال', meaningEn: 'Across / through', combiningRule: 'تترجم إلى: عبر [الجذر]', examples: ['Transesophageal', 'Transdermal'] },
  { id: 'af23', affix: 'Retro-', cleanKey: 'retro', type: 'prefix', meaningAr: 'خلف / راجع / قهقري', meaningEn: 'Behind / backward', combiningRule: 'تترجم إلى: خلف [الجذر] مثل خلف الصفاق', examples: ['Retroperitoneal', 'Retrograde'] },
  { id: 'af24', affix: 'Auto-', cleanKey: 'auto', type: 'prefix', meaningAr: 'ذاتي / تلقائي', meaningEn: 'Self / autoimmune', combiningRule: 'تترجم إلى: ذاتي مثل المناعة الذاتية', examples: ['Autoimmune', 'Autologous'] },
  { id: 'af25', affix: 'Allo-', cleanKey: 'allo', type: 'prefix', meaningAr: 'مغاير / خيفي', meaningEn: 'Other / different', combiningRule: 'تترجم إلى: خيفي أو مغاير', examples: ['Allograft', 'Allogeneic'] },
  { id: 'af26', affix: 'Macro-', cleanKey: 'macro', type: 'prefix', meaningAr: 'كبير / عياني / ضخم', meaningEn: 'Large / gross', combiningRule: 'تترجم إلى: كبير الحجم أو ضخم مثل كبر الكريات', examples: ['Macrocytic', 'Macrophage'] },
  { id: 'af27', affix: 'Micro-', cleanKey: 'micro', type: 'prefix', meaningAr: 'صغير / مجهري / دقّي', meaningEn: 'Small / microscopic', combiningRule: 'تترجم إلى: صغير الحجم أو دقّي', examples: ['Microcytic', 'Microangiopathy'] },
  { id: 'af28', affix: 'Neo-', cleanKey: 'neo', type: 'prefix', meaningAr: 'حديث / تنسّج جديد', meaningEn: 'New / neonatal / neoplasm', combiningRule: 'تترجم إلى: حديث أو ورمي جديد', examples: ['Neoplasm', 'Neonatal', 'Neovascularization'] },
  { id: 'af29', affix: 'Pseudo-', cleanKey: 'pseudo', type: 'prefix', meaningAr: 'كاذب / شبيه', meaningEn: 'False / pseudo-', combiningRule: 'تترجم إلى: كاذب مثل الكيسة الكاذبة', examples: ['Pseudocyst', 'Pseudomembranous'] },

  // 1B. Combining Roots (65 Roots)
  { id: 'af30', affix: 'cardio', cleanKey: 'cardi', type: 'root', meaningAr: 'القلب', meaningEn: 'Heart', combiningRule: 'جذر تشريحي أساسي للقلب', examples: ['Cardiomyopathy', 'Tachycardia', 'Myocardial Infarction'] },
  { id: 'af31', affix: 'myo', cleanKey: 'my', type: 'root', meaningAr: 'العضلة / النسيج العضلي', meaningEn: 'Muscle', combiningRule: 'جذر للنسيج العضلي الهيكلي أو القلبي', examples: ['Myocardial Infarction', 'Cardiomyopathy', 'Myositis'] },
  { id: 'af32', affix: 'neuro', cleanKey: 'neur', type: 'root', meaningAr: 'الأعصاب / الجهاز العصبي', meaningEn: 'Nerve / nervous system', combiningRule: 'جذر تشريحي عصبي', examples: ['Polyneuropathy', 'Neuritis', 'Neurology'] },
  { id: 'af33', affix: 'encephalo', cleanKey: 'encephal', type: 'root', meaningAr: 'الدماغ', meaningEn: 'Brain', combiningRule: 'جذر تشريحي للدماغ داخل القحف', examples: ['Encephalopathy', 'Encephalitis'] },
  { id: 'af34', affix: 'myelo', cleanKey: 'myel', type: 'root', meaningAr: 'النخاع الشوكي أو نقي العظم', meaningEn: 'Spinal cord / bone marrow', combiningRule: 'جذر للنخاع الشوكي أو نقي العظم حسب السياق', examples: ['Myelopathy', 'Myelitis', 'Myeloma'] },
  { id: 'af35', affix: 'angio', cleanKey: 'angi', type: 'root', meaningAr: 'الأوعية الدموية', meaningEn: 'Blood vessel', combiningRule: 'جذر للأوعية الدموية واللمفاوية', examples: ['Angiography', 'Angioplasty'] },
  { id: 'af36', affix: 'vaso', cleanKey: 'vas', type: 'root', meaningAr: 'الوعاء الدموي / القناة', meaningEn: 'Vessel / duct', combiningRule: 'جذر وعائي للانقباض أو التوسع', examples: ['Vasospasm', 'Vasodilation'] },
  { id: 'af37', affix: 'arterio', cleanKey: 'arteri', type: 'root', meaningAr: 'الشرايين', meaningEn: 'Artery', combiningRule: 'جذر للشرايين', examples: ['Arteriosclerosis', 'Arteritis'] },
  { id: 'af38', affix: 'phlebo', cleanKey: 'phleb', type: 'root', meaningAr: 'الأوردة', meaningEn: 'Vein', combiningRule: 'جذر للأوردة مثل التهاب الوريد', examples: ['Phlebitis', 'Thrombophlebitis'] },
  { id: 'af39', affix: 'hemo', cleanKey: 'hem', type: 'root', meaningAr: 'الدم', meaningEn: 'Blood', combiningRule: 'جذر أساسي للدم وخضاب الدم', examples: ['Hemoglobin', 'Hemorrhage', 'Hemolysis'] },
  { id: 'af40', affix: 'hemato', cleanKey: 'hemat', type: 'root', meaningAr: 'الدم / مكونات الدم', meaningEn: 'Blood / hematology', combiningRule: 'جذر مكونات الدم وأمراضه', examples: ['Hematoma', 'Hematology'] },
  { id: 'af41', affix: 'thrombo', cleanKey: 'thromb', type: 'root', meaningAr: 'الخثرة (الجلطة) / الصفيحات', meaningEn: 'Clot / thrombus', combiningRule: 'جذر للتخثر والصفيحات الدموية', examples: ['Thrombosis', 'Thrombolysis'] },
  { id: 'af42', affix: 'thrombocyto', cleanKey: 'thrombocyt', type: 'root', meaningAr: 'الصفيحات الدموية', meaningEn: 'Platelets / thrombocytes', combiningRule: 'جذر مركب للصفيحات الدموية', examples: ['Thrombocytopenia', 'Thrombocytosis'] },
  { id: 'af43', affix: 'erythro', cleanKey: 'erythr', type: 'root', meaningAr: 'أحمر (كريات الدم الحمراء)', meaningEn: 'Red', combiningRule: 'جذر للون الأحمر والكريات الحمراء', examples: ['Erythrocyte', 'Erythropoietin'] },
  { id: 'af44', affix: 'erythrocyto', cleanKey: 'erythrocyt', type: 'root', meaningAr: 'كريات الدم الحمراء', meaningEn: 'Red blood cells', combiningRule: 'جذر مركب لكريات الدم الحمراء', examples: ['Erythrocytosis'] },
  { id: 'af45', affix: 'leuko', cleanKey: 'leuk', type: 'root', meaningAr: 'أبيض (كريات الدم البيضاء)', meaningEn: 'White', combiningRule: 'جذر للون الأبيض والكريات البيضاء', examples: ['Leukopenia', 'Leukemia'] },
  { id: 'af46', affix: 'leukocyto', cleanKey: 'leukocyt', type: 'root', meaningAr: 'كريات الدم البيضاء', meaningEn: 'White blood cells', combiningRule: 'جذر مركب لكريات الدم البيضاء', examples: ['Leukocytosis'] },
  { id: 'af47', affix: 'lympho', cleanKey: 'lymph', type: 'root', meaningAr: 'اللمف / الخلايا اللمفاوية', meaningEn: 'Lymph / lymphatic', combiningRule: 'جذر للجهاز اللمفاوي والمناعي', examples: ['Lymphoma', 'Lymphadenopathy'] },
  { id: 'af48', affix: 'spleno', cleanKey: 'splen', type: 'root', meaningAr: 'الطحال', meaningEn: 'Spleen', combiningRule: 'جذر تشريحي للطحال', examples: ['Splenomegaly', 'Splenectomy'] },
  { id: 'af49', affix: 'pulmono', cleanKey: 'pulmon', type: 'root', meaningAr: 'الرئة', meaningEn: 'Lung', combiningRule: 'جذر لاتيني للرئة', examples: ['Pulmonary Embolism', 'Pulmonary Edema'] },
  { id: 'af50', affix: 'pneumo', cleanKey: 'pneum', type: 'root', meaningAr: 'الرئة / الهواء التنفسي', meaningEn: 'Lung / air', combiningRule: 'جذر إغريقي للرئة أو الهواء في الجوف الصدري', examples: ['Pneumonia', 'Pneumothorax'] },
  { id: 'af51', affix: 'broncho', cleanKey: 'bronch', type: 'root', meaningAr: 'القصبات الهوائية (الشعب)', meaningEn: 'Bronchus / airway', combiningRule: 'جذر للقصبات الهوائية', examples: ['Bronchitis', 'Bronchoscopy', 'Bronchiectasis'] },
  { id: 'af52', affix: 'tracheo', cleanKey: 'trache', type: 'root', meaningAr: 'الرغامى (القصبة الهوائية)', meaningEn: 'Trachea / windpipe', combiningRule: 'جذر للرغامى', examples: ['Tracheostomy', 'Tracheitis'] },
  { id: 'af53', affix: 'laryngo', cleanKey: 'laryng', type: 'root', meaningAr: 'الحنجرة', meaningEn: 'Larynx', combiningRule: 'جذر للحنجرة', examples: ['Laryngitis', 'Laryngoscopy'] },
  { id: 'af54', affix: 'pharyngo', cleanKey: 'pharyng', type: 'root', meaningAr: 'البلعوم', meaningEn: 'Pharynx', combiningRule: 'جذر للبلعوم', examples: ['Pharyngitis'] },
  { id: 'af55', affix: 'rhino', cleanKey: 'rhin', type: 'root', meaningAr: 'الأنف', meaningEn: 'Nose', combiningRule: 'جذر للأنف', examples: ['Rhinitis', 'Rhinorrhea'] },
  { id: 'af56', affix: 'gastro', cleanKey: 'gastr', type: 'root', meaningAr: 'المعدة', meaningEn: 'Stomach', combiningRule: 'جذر تشريحي للمعدة', examples: ['Gastritis', 'Gastroscopy'] },
  { id: 'af57', affix: 'entero', cleanKey: 'enter', type: 'root', meaningAr: 'الأمعاء الدقيقة', meaningEn: 'Intestine (small)', combiningRule: 'جذر للأمعاء', examples: ['Enteritis', 'Enteropathy'] },
  { id: 'af58', affix: 'gastroentero', cleanKey: 'gastroenter', type: 'root', meaningAr: 'المعدة والأمعاء', meaningEn: 'Stomach and intestines', combiningRule: 'جذر مركب للقناة الهضمية', examples: ['Gastroenteritis'] },
  { id: 'af59', affix: 'colo', cleanKey: 'col', type: 'root', meaningAr: 'القولون (الأمعاء الغليظة)', meaningEn: 'Colon / large intestine', combiningRule: 'جذر للقولون', examples: ['Colitis', 'Colonoscopy', 'Colectomy'] },
  { id: 'af60', affix: 'hepato', cleanKey: 'hepat', type: 'root', meaningAr: 'الكبد', meaningEn: 'Liver', combiningRule: 'جذر تشريحي للكبد', examples: ['Hepatomegaly', 'Hepatitis', 'Hepatic Cirrhosis'] },
  { id: 'af61', affix: 'hepatospleno', cleanKey: 'hepatosplen', type: 'root', meaningAr: 'الكبد والطحال', meaningEn: 'Liver and spleen', combiningRule: 'جذر مركب للكبد والطحال معاً', examples: ['Hepatosplenomegaly'] },
  { id: 'af62', affix: 'chole', cleanKey: 'chol', type: 'root', meaningAr: 'الصفراء (المرارة)', meaningEn: 'Bile / gall', combiningRule: 'جذر للصفراء والقنوات الصفراوية', examples: ['Cholelithiasis', 'Cholangitis'] },
  { id: 'af63', affix: 'cholecysto', cleanKey: 'cholecyst', type: 'root', meaningAr: 'الحويصل الصفراوي (المرارة)', meaningEn: 'Gallbladder', combiningRule: 'جذر مركب للمرارة', examples: ['Cholecystolithiasis', 'Cholecystectomy', 'Cholecystitis'] },
  { id: 'af64', affix: 'choledocho', cleanKey: 'choledoch', type: 'root', meaningAr: 'القناة الصفراوية الجامعة', meaningEn: 'Common bile duct', combiningRule: 'جذر للقناة الصفراوية الجامعة', examples: ['Choledocholithiasis', 'Choledocholithotomy'] },
  { id: 'af65', affix: 'pancreato', cleanKey: 'pancreat', type: 'root', meaningAr: 'البنكرياس (المعثكلة)', meaningEn: 'Pancreas', combiningRule: 'جذر للبنكرياس', examples: ['Acute Pancreatitis', 'Pancreatectomy'] },
  { id: 'af66', affix: 'bilirubin', cleanKey: 'bilirubin', type: 'root', meaningAr: 'البيليروبين (صبغة الصفراء)', meaningEn: 'Bilirubin pigment', combiningRule: 'جذر كيميائي حيوي لصبغة البيليروبين', examples: ['Hyperbilirubinemia'] },
  { id: 'af67', affix: 'glyco', cleanKey: 'glyc', type: 'root', meaningAr: 'الغلوكوز / سكر الدم', meaningEn: 'Glucose / sugar', combiningRule: 'جذر لسكر الدم', examples: ['Hyperglycemia', 'Hypoglycemia'] },
  { id: 'af68', affix: 'lipido', cleanKey: 'lipid', type: 'root', meaningAr: 'الشحوم / الدهون', meaningEn: 'Lipids / fats', combiningRule: 'جذر لشحوم الدم', examples: ['Hyperlipidemia', 'Dyslipidemia'] },
  { id: 'af69', affix: 'nephro', cleanKey: 'nephr', type: 'root', meaningAr: 'الكلية', meaningEn: 'Kidney', combiningRule: 'جذر إغريقي للكلية', examples: ['Nephrolithiasis', 'Nephrectomy', 'Nephropathy'] },
  { id: 'af70', affix: 'reno', cleanKey: 'ren', type: 'root', meaningAr: 'الكلية', meaningEn: 'Kidney (renal)', combiningRule: 'جذر لاتيني للكلية', examples: ['Renovascular', 'Renal'] },
  { id: 'af71', affix: 'pyelo', cleanKey: 'pyel', type: 'root', meaningAr: 'حويضة الكلية', meaningEn: 'Renal pelvis', combiningRule: 'جذر لحويضة الكلية', examples: ['Pyelonephritis', 'Pyelography'] },
  { id: 'af72', affix: 'cysto', cleanKey: 'cyst', type: 'root', meaningAr: 'المثانة البولية / الكيسة', meaningEn: 'Bladder / cyst', combiningRule: 'جذر للمثانة البولية أو الكيسات', examples: ['Cystitis', 'Cystoscopy'] },
  { id: 'af73', affix: 'uretero', cleanKey: 'ureter', type: 'root', meaningAr: 'الحالب', meaningEn: 'Ureter', combiningRule: 'جذر للحالب', examples: ['Ureterolithiasis', 'Ureteroscopy'] },
  { id: 'af74', affix: 'urethro', cleanKey: 'urethr', type: 'root', meaningAr: 'الإحليل', meaningEn: 'Urethra', combiningRule: 'جذر للإحليل', examples: ['Urethritis', 'Urethroplasty'] },
  { id: 'af75', affix: 'osteo', cleanKey: 'oste', type: 'root', meaningAr: 'العظم', meaningEn: 'Bone', combiningRule: 'جذر للنسيج العظمي', examples: ['Osteomyelitis', 'Osteoporosis', 'Osteomalacia'] },
  { id: 'af76', affix: 'arthro', cleanKey: 'arthr', type: 'root', meaningAr: 'المفصل', meaningEn: 'Joint', combiningRule: 'جذر للمفاصل', examples: ['Arthritis', 'Arthroscopy', 'Arthroplasty'] },
  { id: 'af77', affix: 'osteoarthro', cleanKey: 'osteoarthr', type: 'root', meaningAr: 'العظم والمفصل', meaningEn: 'Bone and joint', combiningRule: 'جذر مركب للعظام والمفاصل', examples: ['Osteoarthritis'] },
  { id: 'af78', affix: 'chondro', cleanKey: 'chondr', type: 'root', meaningAr: 'الغضروف', meaningEn: 'Cartilage', combiningRule: 'جذر للغضاريف', examples: ['Chondromalacia', 'Chondritis'] },
  { id: 'af79', affix: 'spondylo', cleanKey: 'spondyl', type: 'root', meaningAr: 'الفقرات (العمود الفقري)', meaningEn: 'Vertebra / spine', combiningRule: 'جذر للفقرات', examples: ['Spondylosis', 'Spondylitis'] },
  { id: 'af80', affix: 'dermato', cleanKey: 'dermat', type: 'root', meaningAr: 'الجلد', meaningEn: 'Skin', combiningRule: 'جذر للجلد', examples: ['Dermatitis', 'Dermatology'] },
  { id: 'af81', affix: 'ophthalmo', cleanKey: 'ophthalm', type: 'root', meaningAr: 'العين', meaningEn: 'Eye', combiningRule: 'جذر للعين', examples: ['Ophthalmoplegia', 'Ophthalmoscopy'] },
  { id: 'af82', affix: 'oto', cleanKey: 'ot', type: 'root', meaningAr: 'الأذن', meaningEn: 'Ear', combiningRule: 'جذر للأذن', examples: ['Otitis', 'Otoscopy'] },
  { id: 'af83', affix: 'thyro', cleanKey: 'thyr', type: 'root', meaningAr: 'الغدة الدرقية', meaningEn: 'Thyroid gland', combiningRule: 'جذر للغدة الدرقية', examples: ['Hyperthyroidism', 'Thyroidectomy'] },
  { id: 'af84', affix: 'adreno', cleanKey: 'adren', type: 'root', meaningAr: 'الغدة الكظرية', meaningEn: 'Adrenal gland', combiningRule: 'جذر للكظر', examples: ['Adrenalectomy', 'Adrenocortical'] },
  { id: 'af85', affix: 'hystero', cleanKey: 'hyster', type: 'root', meaningAr: 'الرحم', meaningEn: 'Uterus', combiningRule: 'جذر للرحم', examples: ['Hysterectomy', 'Hysteroscopy'] },
  { id: 'af86', affix: 'oophoro', cleanKey: 'oophor', type: 'root', meaningAr: 'المبيض', meaningEn: 'Ovary', combiningRule: 'جذر للمبيض', examples: ['Oophorectomy', 'Oophoritis'] },
  { id: 'af87', affix: 'salpingo', cleanKey: 'salping', type: 'root', meaningAr: 'البوق الرحمي (قناة فالوب)', meaningEn: 'Fallopian tube', combiningRule: 'جذر للبوق الرحمي', examples: ['Salpingitis', 'Salpingectomy'] },
  { id: 'af88', affix: 'cyto', cleanKey: 'cyt', type: 'root', meaningAr: 'الخلية', meaningEn: 'Cell', combiningRule: 'جذر للخلية الحية', examples: ['Erythrocyte', 'Thrombocytopenia'] },
  { id: 'af89', affix: 'histo', cleanKey: 'hist', type: 'root', meaningAr: 'النسيج الحيوي', meaningEn: 'Tissue', combiningRule: 'جذر للأنسجة', examples: ['Histopathology', 'Histology'] },
  { id: 'af90', affix: 'litho', cleanKey: 'lith', type: 'root', meaningAr: 'الحصاة', meaningEn: 'Stone / calculus', combiningRule: 'جذر للحصيات البولية أو الصفراوية', examples: ['Cholecystolithiasis', 'Lithotripsy'] },
  { id: 'af91', affix: 'onco', cleanKey: 'onc', type: 'root', meaningAr: 'الورم / الكتلة الورمية', meaningEn: 'Tumor / mass', combiningRule: 'جذر للأورام', examples: ['Oncology', 'Oncogene'] },
  { id: 'af92', affix: 'carcino', cleanKey: 'carcin', type: 'root', meaningAr: 'السرطان (الورم الخبيث الظهاري)', meaningEn: 'Carcinoma / cancer', combiningRule: 'جذر للسرطان', examples: ['Carcinoma', 'Adenocarcinoma'] },
  { id: 'af93', affix: 'pyro', cleanKey: 'pyr', type: 'root', meaningAr: 'الحمّى / الحرارة', meaningEn: 'Fever / heat', combiningRule: 'جذر للحمى وارتفاع الحرارة', examples: ['Antipyretic', 'Pyrexia'] },
  { id: 'af94', affix: 'athero', cleanKey: 'ather', type: 'root', meaningAr: 'اللويحة العصيدية الشحمية', meaningEn: 'Fatty plaque / gruel', combiningRule: 'جذر للتصلب العصيدي الشرياني', examples: ['Atherosclerosis', 'Atheroma'] },
  { id: 'af130', affix: 'esophago', cleanKey: 'esophag', type: 'root', meaningAr: 'المريء', meaningEn: 'Esophagus', combiningRule: 'جذر تشريحي للمريء', examples: ['Esophagogastroduodenoscopy', 'Esophagitis', 'Transesophageal'] },
  { id: 'af131', affix: 'duodeno', cleanKey: 'duoden', type: 'root', meaningAr: 'الاثني عشر (العفج)', meaningEn: 'Duodenum', combiningRule: 'جذر تشريحي للاثني عشر', examples: ['Esophagogastroduodenoscopy', 'Duodenitis', 'Gastroduodenal'] },

  // 1C. Medical Suffixes (35 Suffixes)
  { id: 'af95', affix: '-emia', cleanKey: 'emia', type: 'suffix', meaningAr: 'في الدم (حالة دموية)', meaningEn: 'Blood condition', combiningRule: 'تترجم بصيغة: [السابقة] [الجذر] في الدم أو [الجذر] الدم', examples: ['Hyperbilirubinemia', 'Ischemia', 'Anemia', 'Hypoglycemia'] },
  { id: 'af96', affix: '-itis', cleanKey: 'itis', type: 'suffix', meaningAr: 'التهاب', meaningEn: 'Inflammation', combiningRule: 'تفتتح الترجمة العربية بكلمة: التهاب [الجذر]', examples: ['Acute Pancreatitis', 'Cholecystitis', 'Hepatitis'] },
  { id: 'af97', affix: '-osis', cleanKey: 'osis', type: 'suffix', meaningAr: 'داء / حالة تنكسية أو تكاثرية غير التهابية', meaningEn: 'Abnormal condition / degeneration', combiningRule: 'تترجم بصيغة: داء [الجذر] أو كثرة [الجذر]', examples: ['Hepatic Cirrhosis', 'Atherosclerosis', 'Fibrosis'] },
  { id: 'af98', affix: '-iasis', cleanKey: 'iasis', type: 'suffix', meaningAr: 'تولّد مرضي / وجود حصيات أو طفيليات', meaningEn: 'Pathological presence or formation', combiningRule: 'تترجم بصيغة: تحصّي [الجذر] أو داء [الجذر]', examples: ['Cholecystolithiasis', 'Nephrolithiasis'] },
  { id: 'af99', affix: '-lithiasis', cleanKey: 'lithiasis', type: 'suffix', meaningAr: 'تحصٍّ (تشكّل الحصيات)', meaningEn: 'Presence or formation of calculi/stones', combiningRule: 'تفتتح الترجمة العربية بكلمة: تحصّي [الجذر]', examples: ['Cholecystolithiasis', 'Nephrolithiasis', 'Choledocholithiasis'] },
  { id: 'af100', affix: '-pathy', cleanKey: 'pathy', type: 'suffix', meaningAr: 'اعتلال مرضي', meaningEn: 'Disease / pathological disorder', combiningRule: 'تفتتح الترجمة العربية بكلمة: اعتلال [الجذر]', examples: ['Cardiomyopathy', 'Polyneuropathy', 'Nephropathy'] },
  { id: 'af101', affix: '-megaly', cleanKey: 'megaly', type: 'suffix', meaningAr: 'ضخامة / تضخم عضو', meaningEn: 'Enlargement of an organ', combiningRule: 'تفتتح الترجمة العربية بكلمة: ضخامة [الجذر]', examples: ['Hepatomegaly', 'Cardiomegaly', 'Hepatosplenomegaly'] },
  { id: 'af102', affix: '-algia', cleanKey: 'algia', type: 'suffix', meaningAr: 'ألم', meaningEn: 'Pain', combiningRule: 'تفتتح الترجمة العربية بكلمة: ألم [الجذر]', examples: ['Myalgia', 'Neuralgia', 'Arthralgia'] },
  { id: 'af103', affix: '-dynia', cleanKey: 'dynia', type: 'suffix', meaningAr: 'ألم موضعي أو مزمن', meaningEn: 'Pain / tenderness', combiningRule: 'تفتتح الترجمة العربية بكلمة: ألم [الجذر]', examples: ['Pleurodynia', 'Mastodynia'] },
  { id: 'af104', affix: '-ectomy', cleanKey: 'ectomy', type: 'suffix', meaningAr: 'استئصال جراحي', meaningEn: 'Surgical excision / removal', combiningRule: 'تفتتح الترجمة العربية بكلمة: استئصال [الجذر]', examples: ['Cholecystectomy', 'Nephrectomy', 'Appendectomy'] },
  { id: 'af105', affix: '-otomy', cleanKey: 'otomy', type: 'suffix', meaningAr: 'بضع / شقّ جراحي', meaningEn: 'Surgical incision / cutting into', combiningRule: 'تفتتح الترجمة العربية بكلمة: بضع [الجذر]', examples: ['Choledocholithotomy', 'Laparotomy', 'Craniotomy'] },
  { id: 'af106', affix: '-ostomy', cleanKey: 'ostomy', type: 'suffix', meaningAr: 'فغر جراحي (إنشاء فوهة)', meaningEn: 'Surgical creation of an opening/stoma', combiningRule: 'تفتتح الترجمة العربية بكلمة: فغر [الجذر]', examples: ['Tracheostomy', 'Colostomy', 'Ileostomy'] },
  { id: 'af107', affix: '-plasty', cleanKey: 'plasty', type: 'suffix', meaningAr: 'رأب / تقويم جراحي', meaningEn: 'Surgical repair or reconstruction', combiningRule: 'تفتتح الترجمة العربية بكلمة: رأب [الجذر]', examples: ['Angioplasty', 'Arthroplasty', 'Valvuloplasty'] },
  { id: 'af108', affix: '-scopy', cleanKey: 'scopy', type: 'suffix', meaningAr: 'تنظير داخلي', meaningEn: 'Visual examination with an endoscope', combiningRule: 'تفتتح الترجمة العربية بكلمة: تنظير [الجذر]', examples: ['Bronchoscopy', 'Colonoscopy', 'Gastroscopy'] },
  { id: 'af109', affix: '-graphy', cleanKey: 'graphy', type: 'suffix', meaningAr: 'تصوير تشخيصي / تخطيط', meaningEn: 'Diagnostic imaging / recording process', combiningRule: 'تفتتح الترجمة العربية بكلمة: تصوير [الجذر] أو تخطيط [الجذر]', examples: ['Angiography', 'Echocardiography'] },
  { id: 'af110', affix: '-gram', cleanKey: 'gram', type: 'suffix', meaningAr: 'مخطط / صورة إشعاعية', meaningEn: 'Recorded image or tracing', combiningRule: 'تفتتح الترجمة العربية بكلمة: مخطط [الجذر]', examples: ['Electrocardiogram', 'Angiogram'] },
  { id: 'af111', affix: '-penia', cleanKey: 'penia', type: 'suffix', meaningAr: 'قلة / عوز / نقص العدد الخلوي', meaningEn: 'Deficiency / decrease in cell count', combiningRule: 'تفتتح الترجمة العربية بكلمة: قلة [الجذر]', examples: ['Thrombocytopenia', 'Leukopenia', 'Neutropenia'] },
  { id: 'af112', affix: '-cytosis', cleanKey: 'cytosis', type: 'suffix', meaningAr: 'كثرة الخلايا في الدم', meaningEn: 'Abnormal increase in cells', combiningRule: 'تفتتح الترجمة العربية بكلمة: كثرة [الجذر]', examples: ['Leukocytosis', 'Thrombocytosis'] },
  { id: 'af113', affix: '-uria', cleanKey: 'uria', type: 'suffix', meaningAr: 'في البول (بيلة)', meaningEn: 'Urinary condition', combiningRule: 'تفتتح الترجمة العربية بكلمة: بيلة [الجذر] أو [السابقة] التبول', examples: ['Hematuria', 'Polyuria', 'Oliguria'] },
  { id: 'af114', affix: '-pnea', cleanKey: 'pnea', type: 'suffix', meaningAr: 'التنفس / النفس', meaningEn: 'Breathing / respiration', combiningRule: 'تترجم بصيغة: [السابقة] التنفس أو الزلة التنفسية', examples: ['Dyspnea', 'Tachypnea', 'Apnea'] },
  { id: 'af115', affix: '-rrhea', cleanKey: 'rrhea', type: 'suffix', meaningAr: 'سيلان / إفراز غزير / إسهال', meaningEn: 'Flow / excessive discharge', combiningRule: 'تفتتح الترجمة العربية بكلمة: سيلان [الجذر]', examples: ['Rhinorrhea', 'Diarrhea'] },
  { id: 'af116', affix: '-rrhage', cleanKey: 'rrhage', type: 'suffix', meaningAr: 'نزف غزير', meaningEn: 'Excessive bleeding / hemorrhage', combiningRule: 'تفتتح الترجمة العربية بكلمة: نزف [الجذر]', examples: ['Subarachnoid Hemorrhage', 'Hemorrhage'] },
  { id: 'af117', affix: '-rrhagia', cleanKey: 'rrhagia', type: 'suffix', meaningAr: 'نزف مرضي غزير', meaningEn: 'Abnormal or excessive arterial/organ bleeding', combiningRule: 'تفتتح الترجمة العربية بكلمة: نزف [الجذر]', examples: ['Menorrhagia', 'Metrorrhagia'] },
  { id: 'af118', affix: '-stenosis', cleanKey: 'stenosis', type: 'suffix', meaningAr: 'تضيّق وعائي أو صمامي أو قنوي', meaningEn: 'Abnormal narrowing of a duct/valve', combiningRule: 'تفتتح الترجمة العربية بكلمة: تضيّق [الجذر]', examples: ['Mitral Stenosis', 'Aortic Stenosis'] },
  { id: 'af119', affix: '-sclerosis', cleanKey: 'sclerosis', type: 'suffix', meaningAr: 'تصلّب النسيج', meaningEn: 'Abnormal hardening of tissue', combiningRule: 'تفتتح الترجمة العربية بكلمة: تصلّب [الجذر]', examples: ['Multiple Sclerosis', 'Atherosclerosis'] },
  { id: 'af120', affix: '-malacia', cleanKey: 'malacia', type: 'suffix', meaningAr: 'تليّن غير طبيعي في النسيج', meaningEn: 'Abnormal softening of tissue/bone', combiningRule: 'تفتتح الترجمة العربية بكلمة: تليّن [الجذر]', examples: ['Osteomalacia', 'Chondromalacia'] },
  { id: 'af121', affix: '-necrosis', cleanKey: 'necrosis', type: 'suffix', meaningAr: 'نخر / موت الأنسجة', meaningEn: 'Death of tissue cells', combiningRule: 'تفتتح الترجمة العربية بكلمة: نخر [الجذر]', examples: ['Osteonecrosis', 'Myonecrosis'] },
  { id: 'af122', affix: '-lysis', cleanKey: 'lysis', type: 'suffix', meaningAr: 'انحلال / تحلّل / فكّ الالتصاقات', meaningEn: 'Dissolution / breakdown / destruction', combiningRule: 'تفتتح الترجمة العربية بكلمة: انحلال [الجذر]', examples: ['Hemolysis', 'Thrombolysis'] },
  { id: 'af123', affix: '-oma', cleanKey: 'oma', type: 'suffix', meaningAr: 'ورم / كتلة نسيجية', meaningEn: 'Tumor / neoplasm / swelling', combiningRule: 'تفتتح الترجمة العربية بكلمة: ورم [الجذر]', examples: ['Carcinoma', 'Lymphoma', 'Hematoma'] },
  { id: 'af124', affix: '-genesis', cleanKey: 'genesis', type: 'suffix', meaningAr: 'تكون / نشوء / تولّد', meaningEn: 'Origin / formation / development', combiningRule: 'تفتتح الترجمة العربية بكلمة: تكوّن [الجذر]', examples: ['Pathogenesis', 'Angiogenesis'] },
  { id: 'af125', affix: '-stasis', cleanKey: 'stasis', type: 'suffix', meaningAr: 'ركود / إرقاء / توقف التدفق', meaningEn: 'Stopping / controlling flow / stagnation', combiningRule: 'تفتتح الترجمة العربية بكلمة: ركود [الجذر] أو إرقاء الدم', examples: ['Hemostasis', 'Cholestasis'] },
  { id: 'af126', affix: '-plegia', cleanKey: 'plegia', type: 'suffix', meaningAr: 'شلل كامل', meaningEn: 'Paralysis / stroke', combiningRule: 'تفتتح الترجمة العربية بكلمة: شلل [الجذر]', examples: ['Hemiplegia', 'Paraplegia', 'Quadriplegia'] },
  { id: 'af127', affix: '-paresis', cleanKey: 'paresis', type: 'suffix', meaningAr: 'خزل (ضعف عضلي أو شلل جزئي)', meaningEn: 'Partial paralysis / weakness', combiningRule: 'تفتتح الترجمة العربية بكلمة: خزل [الجذر]', examples: ['Hemiparesis', 'Gastroparesis'] },
  { id: 'af128', affix: '-ectasis', cleanKey: 'ectasis', type: 'suffix', meaningAr: 'توسّع / تمدّد وعائي أو قصبي', meaningEn: 'Dilation / expansion / distension', combiningRule: 'تفتتح الترجمة العربية بكلمة: توسّع [الجذر]', examples: ['Bronchiectasis', 'Atelectasis'] },
  { id: 'af129', affix: '-cele', cleanKey: 'cele', type: 'suffix', meaningAr: 'فتق / قيلة', meaningEn: 'Hernia / protrusion / swelling', combiningRule: 'تفتتح الترجمة العربية بكلمة: قيلة [الجذر]', examples: ['Meningocele', 'Hydrocele', 'Varicocele'] },
  { id: 'af132', affix: 'Normo-', cleanKey: 'normo', type: 'prefix', meaningAr: 'سويّ / طبيعي القياس', meaningEn: 'Normal / normo-', combiningRule: 'تترجم إلى: سويّ [الجذر] مثل سويّ الكريات أو سويّ الصباغ', examples: ['Normocytic', 'Normochromic', 'Normotensive'] },
  { id: 'af133', affix: 'Megalo-', cleanKey: 'megalo', type: 'prefix', meaningAr: 'ضخم / متضخم', meaningEn: 'Abnormally large / megalo-', combiningRule: 'تترجم إلى: ضخم [الجذر] مثل ضخم الأرومات', examples: ['Megaloblastic', 'Megaloblast'] },
  { id: 'af134', affix: 'Aniso-', cleanKey: 'aniso', type: 'prefix', meaningAr: 'تفاوت / عدم تساوٍ', meaningEn: 'Unequal / dissimilar', combiningRule: 'تترجم إلى: تفاوت [الجذر]', examples: ['Anisocytosis', 'Anisocoria'] },
  { id: 'af135', affix: 'Poikilo-', cleanKey: 'poikilo', type: 'prefix', meaningAr: 'تفاوت الشكل / تعدد الأشكال', meaningEn: 'Varied / irregular shape', combiningRule: 'تترجم إلى: تفاوت أشكال [الجذر]', examples: ['Poikilocytosis'] },
  { id: 'af136', affix: 'sidero', cleanKey: 'sider', type: 'root', meaningAr: 'الحديد', meaningEn: 'Iron / sidero-', combiningRule: 'جذر للحديد داخل الخلايا أو الأرومات', examples: ['Sideroblastic', 'Hemosiderosis', 'Sideropenia'] },
  { id: 'af137', affix: 'chromo', cleanKey: 'chrom', type: 'root', meaningAr: 'الصباغ / اللون', meaningEn: 'Color / pigment / hemoglobin content', combiningRule: 'جذر للصباغ أو خضاب الكرية الحمراء', examples: ['Hypochromic', 'Normochromic', 'Hyperchromic'] },
  { id: 'af138', affix: 'blasto', cleanKey: 'blast', type: 'root', meaningAr: 'الأرومات (الخلايا الفتية)', meaningEn: 'Immature precursor cell / blast', combiningRule: 'جذر للخلايا الأرومية الفتية في نقي العظم', examples: ['Sideroblastic', 'Megaloblastic', 'Erythroblast'] },
  { id: 'af139', affix: '-cytic', cleanKey: 'cytic', type: 'suffix', meaningAr: 'الكريات / الخلايا', meaningEn: 'Pertaining to cells / corpuscles', combiningRule: 'تترجم بصيغة صفة مضافة: [السابقة] الكريات', examples: ['Microcytic', 'Macrocytic', 'Normocytic'] },
  { id: 'af140', affix: '-chromic', cleanKey: 'chromic', type: 'suffix', meaningAr: 'الصباغ', meaningEn: 'Pertaining to color or hemoglobin pigmentation', combiningRule: 'تترجم بصيغة صفة مضافة: [السابقة] الصباغ', examples: ['Hypochromic', 'Normochromic', 'Hyperchromic'] },
  { id: 'af141', affix: '-blastic', cleanKey: 'blastic', type: 'suffix', meaningAr: 'الأرومات', meaningEn: 'Pertaining to immature precursor cells (blasts)', combiningRule: 'تترجم بصيغة صفة مضافة: [السابقة/الجذر] الأرومات', examples: ['Sideroblastic', 'Megaloblastic'] },
  { id: 'af142', affix: '-lytic', cleanKey: 'lytic', type: 'suffix', meaningAr: 'انحلالي / حالّ', meaningEn: 'Causing dissolution or hemolysis', combiningRule: 'تترجم بصيغة: انحلالي [الجذر] أو حالّ لـ [الجذر]', examples: ['Hemolytic', 'Thrombolytic', 'Osteolytic'] }
];

// ============================================================================
// HELPER: AUTOMATICALLY DETECT LINKED TERM IDS IN SENTENCES
// ============================================================================
export function detectLinkedTermIdsForSentence(
  enText: string,
  arText: string,
  terms: DictionaryTerm[] = INITIAL_TERMS
): string[] {
  const matchedIds = new Set<string>();
  const lowerEn = enText.toLowerCase();

  for (const term of terms) {
    const escapedEn = term.termNormalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const enRegex = new RegExp(`\\b${escapedEn}\\b`, 'i');
    const primaryArChunk = term.translation.split('(')[0].trim();

    if (
      enRegex.test(lowerEn) ||
      (primaryArChunk.length >= 4 && arText.includes(primaryArChunk))
    ) {
      matchedIds.add(term.id);
    }
  }

  for (const [alias, targetId] of Object.entries(EXTRA_LINKABLE_ALIASES)) {
    const escapedAlias = alias.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const aliasRegex = new RegExp(`\\b${escapedAlias}\\b`, 'i');
    if (aliasRegex.test(lowerEn)) {
      matchedIds.add(targetId);
    }
  }

  return Array.from(matchedIds);
}

// ============================================================================
// INITIAL LINKED SENTENCES (PHASE 3 CLINICAL PHRASEBOOK + TERM EXAMPLES)
// ============================================================================
export const CLINICAL_PHRASEBOOK: Array<{
  id: string;
  en: string;
  ar: string;
  category: LexiconCategory;
  specialty: string;
  tags: string[];
}> = [
  {
    id: 'ph-1',
    en: 'The patient presented to the emergency department with acute chest pain and Tachycardia secondary to Myocardial Infarction.',
    ar: 'حضر المريض إلى قسم الطوارئ وهو يشكو من ألم صدري حاد وتسرّع القلب ثانوي لاحتشاء عضلة القلب.',
    category: 'Medical',
    specialty: 'Emergency Medicine · طب الطوارئ',
    tags: ['Clinical Phrasebook', 'Emergency', 'Cardiology']
  },
  {
    id: 'ph-2',
    en: 'Past medical history is significant for Chronic Kidney Disease, Diabetic Ketoacidosis, and iron-deficiency Anemia.',
    ar: 'التاريخ المرضي السابق حافل بالإصابة بمرض الكلى المزمن والحماض الكيتوني السكري وفقر الدم بنقص الحديد.',
    category: 'Medical',
    specialty: 'Internal Medicine · الطب الباطني',
    tags: ['Clinical Phrasebook', 'History']
  },
  {
    id: 'ph-3',
    en: 'Physical examination on admission revealed bilateral basal crackles consistent with Acute Decompensated Congestive Heart Failure and Pulmonary Edema.',
    ar: 'أظهر الفحص السريري عند القبول وجود خراخر قاعدية ثنائية الجانب متوافقة مع فشل القلب الاحتقاني اللاتعاوضي الحاد والوذمة الرئوية.',
    category: 'Medical',
    specialty: 'Cardiopulmonary · القلب والصدرية',
    tags: ['Clinical Phrasebook', 'Physical Exam']
  },
  {
    id: 'ph-4',
    en: 'Vital signs were stable and within normal limits following treatment of paroxysmal Atrial Fibrillation.',
    ar: 'كانت العلامات الحيوية مستقرة وضمن الحدود الطبيعية عقب معالجة الرجفان الأذيني الانتيابي.',
    category: 'Medical',
    specialty: 'General Ward · الأجنحة السريرية',
    tags: ['Clinical Phrasebook', 'Vitals']
  },
  {
    id: 'ph-5',
    en: 'Electrocardiogram showed sinus Tachycardia with ST-segment elevation indicative of acute Myocardial Infarction and coronary Ischemia.',
    ar: 'أظهر تخطيط كهربية القلب تسرعاً جيبياً مع ارتفاع في القطعة ST مما يدل على احتشاء عضلة القلب الحاد ونقص التروية التاجي.',
    category: 'Medical',
    specialty: 'Cardiology · أمراض القلب',
    tags: ['Clinical Phrasebook', 'ECG']
  },
  {
    id: 'ph-6',
    en: 'Computed tomography of the brain without contrast excluded Subarachnoid Hemorrhage prior to thrombolysis for Ischemic Stroke.',
    ar: 'نفى التصوير المقطعي المحوسب للدماغ بدون حقن وجود النزف تحت العنكبوتية قبل إعطاء حالّات الخثرة للسكتة الدماغية الإقفارية.',
    category: 'Medical',
    specialty: 'Neurology & Radiology · الأعصاب والأشعة',
    tags: ['Clinical Phrasebook', 'Neuroimaging']
  },
  {
    id: 'ph-7',
    en: 'Laboratory evaluation revealed conjugated Hyperbilirubinemia and Thrombocytopenia in a patient with decompensated Hepatic Cirrhosis.',
    ar: 'أظهرت الفحوص المخبرية وجود فرط بيليروبين الدم المقترن وقلة الصفيحات الدموية لدى مريض مصاب بتشمّع الكبد اللاتعاوضي.',
    category: 'Medical',
    specialty: 'Hepatology & Labs · الكبد والمختبر',
    tags: ['Clinical Phrasebook', 'Labs']
  },
  {
    id: 'ph-8',
    en: 'The patient was started on empirical intravenous broad-spectrum antibiotics with dose adjustment according to renal Pharmacokinetics.',
    ar: 'تم البدء بإعطاء المريض مضادات حيوية وريدية واسعة الطيف بصورة تجريبية مع تعديل الجرعة وفق الحرائك الدوائية الكلوية.',
    category: 'Medical',
    specialty: 'Pharmacology & Infectious Disease · الأدوية والأمراض الإنتانية',
    tags: ['Clinical Phrasebook', 'Pharmacology']
  },
  {
    id: 'ph-9',
    en: 'Informed consent was obtained prior to laparoscopic Cholecystectomy for symptomatic Cholecystolithiasis and biliary Acute Pancreatitis.',
    ar: 'تم الحصول على الموافقة المستنيرة قبل إجراء استئصال المرارة التنظيري لعلاج تحصّي المرارة العرضي والتهاب البنكرياس الحاد الصفراوي.',
    category: 'Medical',
    specialty: 'General Surgery · الجراحة العامة',
    tags: ['Clinical Phrasebook', 'Surgery']
  },
  {
    id: 'ph-10',
    en: 'Differential Diagnosis in acute chest pain and dyspnea includes Pulmonary Embolism, Myocardial Infarction, and Cardiac Tamponade.',
    ar: 'يشمل التشخيص التفريقي في ألم الصدر الحاد والزلة التنفسية كلاً من الانصمام الرئوي واحتشاء عضلة القلب والاندحاس القلبي.',
    category: 'Medical',
    specialty: 'Emergency & Triage · الطوارئ والفرز',
    tags: ['Clinical Phrasebook', 'Differential Diagnosis']
  },
  {
    id: 'ph-11',
    en: 'Immediate intramuscular epinephrine and airway protection resolved Anaphylactic Shock and prevented progression to Hypovolemic Shock.',
    ar: 'أدى حقن الإبينفرين العضلي الفوري وحماية الطريق الهوائي إلى معالجة الصدمة التأقية ومنع التدهور نحو صدمة نقص حجم الدم.',
    category: 'Medical',
    specialty: 'Critical Care · العناية المركزة',
    tags: ['Clinical Phrasebook', 'Shock']
  },
  {
    id: 'ph-12',
    en: 'Discharged in stable condition with outpatient Neurology follow-up instructions for relapsing-remitting Multiple Sclerosis and prior Status Epilepticus.',
    ar: 'تخرّج المريض بحالة مستقرة مع تعليمات المتابعة في العيادة العصبية الخارجية للتصلب اللويحي المتعدد الناكس الهاجع والحالة الصرعية المستمرة السابقة.',
    category: 'Medical',
    specialty: 'Discharge Summary · تقارير الخروج',
    tags: ['Clinical Phrasebook', 'Discharge']
  }
];

function buildInitialLinkedSentences(): LinkedSentence[] {
  const list: LinkedSentence[] = [];
  const seenEn = new Set<string>();

  for (const item of CLINICAL_PHRASEBOOK) {
    const key = item.en.trim().toLowerCase();
    if (seenEn.has(key)) continue;
    seenEn.add(key);
    list.push({
      id: item.id,
      en: item.en,
      ar: item.ar,
      category: item.category,
      specialty: item.specialty,
      sourceType: 'seed',
      linkedTermIds: detectLinkedTermIdsForSentence(item.en, item.ar, INITIAL_TERMS),
      tags: item.tags,
      favorite: true,
      createdAt: 'موسوعة العبارات السريرية (UMD Phrasebook)'
    });
  }

  for (const term of INITIAL_TERMS) {
    for (let exIdx = 0; exIdx < term.examples.length; exIdx++) {
      const ex = term.examples[exIdx];
      const key = ex.en.trim().toLowerCase();
      if (seenEn.has(key)) continue;
      seenEn.add(key);

      const detected = detectLinkedTermIdsForSentence(ex.en, ex.ar, INITIAL_TERMS);
      if (!detected.includes(term.id)) {
        detected.unshift(term.id);
      }

      list.push({
        id: `sent-ex-${term.id}-${exIdx + 1}`,
        en: ex.en,
        ar: ex.ar,
        category: term.category,
        specialty: term.specialty,
        sourceType: 'seed',
        linkedTermIds: detected,
        tags: [term.term, ...(term.collections || []).slice(0, 1)],
        favorite: Boolean(term.favorite),
        createdAt: `مثال سياقي · ${term.term}`
      });
    }
  }

  return list;
}

export const INITIAL_LINKED_SENTENCES: LinkedSentence[] = buildInitialLinkedSentences();

export const CLINICAL_BENCHMARK_CASES: ClinicalBenchmarkCase[] = [
  {
    id: 'case1',
    titleAr: 'ملاحظة عناية قلبية مركزة (ICU Cardiac & Abbreviation Note)',
    specialty: 'Cardiology & Emergency',
    sourceEn:
      'Pt with Hx of HTN and CHF c/o acute SOB and DOE. ECG revealed ventricular Tachycardia and acute Myocardial Infarction secondary to coronary Ischemia.',
    highlightFocus: 'فك التباس PT واختصارات CHF/SOB/DOE مع حماية Myocardial Infarction وTachycardia.'
  },
  {
    id: 'case2',
    titleAr: 'اختبار فك التباس (MS) الثلاثي: أعصاب vs قلب vs دواء',
    specialty: 'Context Disambiguation Matrix',
    sourceEn:
      'Case A: MRI brain plaques and optic neuritis confirmed relapsing MS. Case B: Auscultation at the apex revealed a diastolic murmur consistent with rheumatic MS. Case C: Administered MS 4 mg IV PRN for severe chest pain.',
    highlightFocus: 'يميز المحرك تلقائياً بين التصلب اللويحي، وتضيق الصمام التاجي، وسلفات المورفين في نفس الفقرة!'
  },
  {
    id: 'case3',
    titleAr: 'تقرير كبدي جراحي مع مصطلحات مركبة خارج المعجم (OOV Morphology)',
    specialty: 'Hepatobiliary & Morphology',
    sourceEn:
      'Ultrasound demonstrated Cholecystolithiasis with conjugated Hyperbilirubinemia, Hepatomegaly, and mild Thrombocytopenia prior to Cholecystectomy.',
    highlightFocus: 'تفكيك الجذور الإغريقية واللاتينية (Hyper- + bilirubin + -emia و Cholecysto- + -ectomy) آلياً.'
  },
  {
    id: 'case4',
    titleAr: 'توصيف الذكاء الاصطناعي الطبي وقواعد البيانات (Hybrid AI + SQLite)',
    specialty: 'Medical AI & Systems Engineering',
    sourceEn:
      'Combining a quantized Transformer and Neural Network with Retrieval-Augmented Generation guarantees Idempotency and low Garbage Collection overhead during high Concurrency.',
    highlightFocus: 'اختبار التكامل ثنائي اللغة بين مصطلحات الذكاء الاصطناعي وهندسة البرمجيات والطب.'
  }
];

export const SAMPLE_AI_RAW_OUTPUT = `[
  {
    "term": "Bradycardia",
    "translation": "بطء ضربات القلب",
    "phonetic": "/ˌbrædɪˈkɑːrdiə/",
    "pos": "Noun · علامة سريرية",
    "category": "Medical",
    "definitionAr": "انخفاض معدل ضربات القلب عن 60 نبضة في الدقيقة أثناء الراحة، وهو الوجه المقابل لحالة Tachycardia ضمن طيف اضطرابات Arrhythmia القلبية.",
    "definitionEn": "A resting heart rate under 60 BPM, contrasting with Tachycardia within the Arrhythmia spectrum.",
    "examples": [
      {
        "en": "Severe Bradycardia can lead to cerebral Ischemia and syncope if cardiac output drops.",
        "ar": "يمكن أن يؤدي بطء ضربات القلب الشديد إلى نقص التروية الدموية الدماغي والإغماء إذا انخفض النتاج القلبي."
      }
    ],
    "relations": {
      "synonyms": ["Slow Heart Rate"],
      "broader": ["Arrhythmia"],
      "related": ["Tachycardia", "Ischemia", "Myocardial Infarction"]
    }
  },
  {
    "term": "Choledocholithotomy",
    "translation": "بضع القناة الصفراوية الجامعة لاستخراج الحصاة",
    "phonetic": "/koʊˌlɛdəkoʊlɪˈθɒtəmi/",
    "pos": "Noun · تداخل جراحي صفراوي",
    "category": "Medical",
    "definitionAr": "شق جراحي في القناة الصفراوية الجامعة لاستخراج حصاة سادّة تسببت في حدوث Hyperbilirubinemia ومضاعفات Cholecystolithiasis.",
    "definitionEn": "Surgical incision into the common bile duct for removal of a gallstone causing obstructive Hyperbilirubinemia.",
    "examples": [
      {
        "en": "Laparoscopic Choledocholithotomy resolved the obstructive Hyperbilirubinemia after ERCP failed.",
        "ar": "أدى بضع القناة الصفراوية الجامعة التنظيري لاستخراج الحصاة إلى زوال فرط بيليروبين الدم الانسدادي بعد تعذر التنظير الراجع."
      }
    ],
    "relations": {
      "synonyms": ["Common Bile Duct Stone Extraction"],
      "broader": ["General Surgery"],
      "related": ["Cholecystolithiasis", "Hyperbilirubinemia", "Acute Pancreatitis"]
    }
  },
  {
    "term": "Idempotency",
    "translation": "خاصية التكرار الآمن (محدث مع أمثلة إضافية)",
    "phonetic": "/ˌaɪdɛmˈpoʊtənsi/",
    "pos": "Noun · مبدأ هندسي برمجي",
    "category": "Programming",
    "definitionAr": "مبدأ هندسي يضمن ثبات النتيجة عند تكرار الطلبات الشبكية تحت ضغط Concurrency العالي في الأنظمة الموزعة.",
    "definitionEn": "Distributed systems property guaranteeing identical state across repeated executions under Concurrency.",
    "examples": [
      {
        "en": "RESTful PUT and DELETE endpoints must implement strict Idempotency by specification.",
        "ar": "يجب أن تطبق نقاط النهاية PUT و DELETE في معمارية REST خاصية التكرار الآمن الصارمة حسب المواصفات."
      }
    ],
    "relations": {
      "synonyms": ["Safe Retry Property"],
      "broader": ["Concurrency"],
      "related": ["Memoization", "Garbage Collection"]
    }
  }
]`;
