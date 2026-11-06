import { TopicArticle, TopicCategory } from '../types/lexicon';
import { HEMATOLOGY_TOPICS } from './hematologyTopics';
import { PARASITOLOGY_TOPICS } from './parasitologyTopics';

export const TOPIC_CATEGORY_META: Record<
  TopicCategory | 'All',
  { labelAr: string; labelEn: string }
> = {
  All: { labelAr: 'جميع المواضيع', labelEn: 'All Topics' },
  Medical: { labelAr: 'الطب السريري', labelEn: 'Clinical Medicine' },
  Technology: { labelAr: 'التكنولوجيا والأنظمة', labelEn: 'Technology & Systems' },
  AI: { labelAr: 'الذكاء الاصطناعي', labelEn: 'Artificial Intelligence' },
  History: { labelAr: 'التاريخ والحضارة', labelEn: 'History & Heritage' },
  General: { labelAr: 'العلوم والمعرفة العامة', labelEn: 'General Sciences' }
};

function createDiagramSvgDataUrl(
  title: string,
  subtitle: string,
  accentHex: string
): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 420" width="960" height="420">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0f172a" />
        <stop offset="100%" stop-color="#020617" />
      </linearGradient>
    </defs>
    <rect width="960" height="420" rx="24" fill="url(#bg)" />
    <g stroke="${accentHex}" stroke-opacity="0.16" stroke-width="1">
      <line x1="0" y1="84" x2="960" y2="84" />
      <line x1="0" y1="168" x2="960" y2="168" />
      <line x1="0" y1="252" x2="960" y2="252" />
      <line x1="0" y1="336" x2="960" y2="336" />
      <line x1="192" y1="0" x2="192" y2="420" />
      <line x1="384" y1="0" x2="384" y2="420" />
      <line x1="576" y1="0" x2="576" y2="420" />
      <line x1="768" y1="0" x2="768" y2="420" />
    </g>
    <rect x="48" y="48" width="864" height="324" rx="18" fill="#0f172a" fill-opacity="0.7" stroke="${accentHex}" stroke-opacity="0.45" stroke-width="1.5" />
    <circle cx="110" cy="110" r="24" fill="${accentHex}" fill-opacity="0.2" stroke="${accentHex}" stroke-width="2" />
    <path d="M98 110 L106 118 L122 102" fill="none" stroke="${accentHex}" stroke-width="3" stroke-linecap="round" />
    <text x="480" y="195" text-anchor="middle" fill="#f8fafc" font-family="sans-serif" font-size="28" font-weight="700">${title}</text>
    <text x="480" y="245" text-anchor="middle" fill="${accentHex}" font-family="monospace" font-size="17" font-weight="600">${subtitle}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const INITIAL_TOPICS: TopicArticle[] = [
  {
    id: 'topic-med-acs-1',
    title: 'المتلازمة الإكليلية الحادة وتدبير احتشاء عضلة القلب في الطوارئ',
    subtitle:
      'Pathophysiology of Myocardial Infarction, Tissue Ischemia, and Reperfusion Protocols',
    category: 'Medical',
    author: 'هيئة التحرير السريري · WHO UMD',
    publishedAt: 'أكتوبر 2026',
    readingTimeMinutes: 6,
    favorite: true,
    sections: [
      {
        id: 'sec-1',
        heading: '1. الآلية الفيزيولوجية المرضية لنقص التروية والاحتشاء',
        paragraphs: [
          'Patients presenting to the emergency department with acute retrosternal chest pain and severe Dyspnea require immediate clinical evaluation to rule out Myocardial Infarction. The primary pathophysiological mechanism involves sudden rupture of an atherosclerotic plaque within a coronary artery, leading to acute thrombosis, severe Ischemia, and cellular Hypoxia of the myocardium.',
          'عندما ينقطع التدفق الدموي التاجي لفترة تتجاوز العشرين دقيقة، تبدأ الخلايا العضلية القلبية بالتنخر غير العكوس، مما يؤدي إلى ارتفاع المؤشرات الحيوية القلبية وفي مقدمتها إنزيم Troponin عالي الحساسية، بالتزامن مع تغيرات تخطيطية واضحة.'
        ]
      },
      {
        id: 'sec-2',
        heading: '2. التظاهرات السريرية واضطرابات النظم المرافقة',
        paragraphs: [
          'During the hyperacute phase of Myocardial Infarction, autonomic nervous system activation frequently triggers sinus Tachycardia or life-threatening ventricular Arrhythmia. If left ventricular systolic function deteriorates rapidly, patients may develop acute Pulmonary Edema and cardiogenic Shock requiring urgent hemodynamic stabilization.',
          'كما يجب الانتباه لدى مرضى السكري وكبار السن لاحتمال حدوث احتشاء صامت يتظاهر فقط بهبوط ضغط الدم الانتصابي (Hypotension) أو ضيق تنفس مفاجئ دون ألم صدري وصفي، وهو ما يستوجب إجراء تخطيط قلب كهربائي خلال أول 10 دقائق من وصول المريض.'
        ]
      },
      {
        id: 'sec-3',
        heading: '3. إعادة التروية التاجية والتدخل القسطري العاجل',
        paragraphs: [
          'Timely restoration of coronary perfusion via primary percutaneous coronary Angioplasty remains the gold-standard intervention to salvage ischemic myocardium and prevent chronic Cardiomyopathy. Prior to catheterization, dual antiplatelet therapy and anticoagulation are administered unless contraindicated by active Hemorrhage or severe Thrombocytopenia.',
          'إن التكامل بين التشخيص المبكر ومراقبة العلامات الحيوية وإعادة التروية الفورية يقلل بشكل جذري من الوفيات المبكرة ويحمي العضلة القلبية من القصور المزمن.'
        ]
      }
    ],
    images: [
      {
        id: 'img-acs-1',
        url: createDiagramSvgDataUrl(
          'Acute Coronary Reperfusion Pathway',
          'Ischemia → Troponin Elevation → Primary Angioplasty',
          '#10b981'
        ),
        caption:
          'مخطط توضيحي لمسار التشخيص السريع وإعادة التروية القسطرية في حالات احتشاء عضلة القلب الحاد.'
      }
    ],
    links: [
      {
        id: 'lnk-acs-1',
        title: 'WHO Unified Medical Dictionary (UMD) — Cardiovascular Nomenclature',
        url: 'https://applications.emro.who.int/umd/',
        description: 'المرجع الرسمي لمصطلحات أمراض القلب والأوعية الدموية في منظمة الصحة العالمية.'
      },
      {
        id: 'lnk-acs-2',
        title: 'ESC Guidelines for the Management of Acute Coronary Syndromes',
        url: 'https://www.escardio.org/Guidelines',
        description: 'التوصيات السريرية المحدثة لتدبير المتلازمة الإكليلية الحادة.'
      }
    ],
    attachments: [
      {
        id: 'att-acs-1',
        fileName: 'ACS_Emergency_Protocol_Checklist.txt',
        fileType: 'TEXT / CLINICAL PROTOCOL',
        fileSizeLabel: '2.4 KB',
        contentDataUrlOrText:
          '=== ACUTE CORONARY SYNDROME (ACS) EMERGENCY CHECKLIST ===\n1. 12-Lead ECG within 10 minutes of arrival.\n2. High-sensitivity Cardiac Troponin I/T at 0h and 1h.\n3. Monitor for Tachycardia, Arrhythmia, Hypoxia, and Pulmonary Edema.\n4. Primary PCI / Angioplasty within 90 minutes for STEMI.'
      }
    ]
  },
  {
    id: 'topic-ai-gcnmt-2',
    title: 'هندسة الترجمة العصبية المقيدة بالمعجم (GC-NMT) ومنع الهلوسة في النصوص العلمية',
    subtitle:
      'Combining Transformer Architecture, Deterministic Token Masking, and Vector Embedding',
    category: 'AI',
    author: 'فريق أبحاث اللسانيات الحاسوبية',
    publishedAt: 'أكتوبر 2026',
    readingTimeMinutes: 7,
    favorite: false,
    sections: [
      {
        id: 'sec-ai-1',
        heading: '1. تحدي الهلوسة الدلالية في النماذج اللغوية العامة',
        paragraphs: [
          'Modern Neural Machine Translation systems built upon the Transformer Architecture excel at capturing long-range syntactic dependencies through self-attention mechanisms. However, when translating specialized clinical reports, unconstrained generative models remain vulnerable to semantic Hallucination and inconsistent terminology.',
          'فعلى سبيل المثال، قد تترجم النماذج غير المقيدة المصطلح السريري الواحد بعدة صيغ متباينة في الفقرة ذاتها، أو تخطئ في فك الاختصارات السياقية الحرجة مثل MS وPT، مما يشكل خطراً في التوثيق الطبي والتقني.'
        ]
      },
      {
        id: 'sec-ai-2',
        heading: '2. التمويه الحتمي للكيانات قبل الترميز (Pre-Tokenization Masking)',
        paragraphs: [
          'To guarantee 100% terminological fidelity without sacrificing grammatical fluency, Glossary-Constrained NMT applies a Deterministic Aho-Corasick scanner prior to subword Tokenization. Verified multi-word terms are replaced with invariant placeholders before passing the sequence into the quantized model.',
          'وبالتوازي مع ذلك، تسمح تقنيات Quantization بتقليص حجم الأوزان الحسابية من 32-bit إلى 8-bit، مما يقلل استهلاك Memory Footprint وزمن الاستجابة Latency ليتم تشغيل المحرك محلياً بالكامل على الهواتف الذكية دون اتصال بالسحابة.'
        ]
      },
      {
        id: 'sec-ai-3',
        heading: '3. الاسترجاع المعزز بالمعرفة وتحديث الفهارس المتجهة',
        paragraphs: [
          'By combining Vector Embedding similarity with Retrieval-Augmented Generation and Zero-Shot Learning fallbacks, hybrid engines bridge the gap between symbolic lexicography and neural fluency. Even when Fine-Tuning is not feasible on edge devices, dynamic glossary injection ensures immediate adaptation to newly ingested terms.',
          'بفضل هذه البنية الهجينة، يصبح بإمكان المستخدم إضافة أي مصطلح جديد إلى القاموس ليتم اعتماده فوراً في جميع عمليات الترجمة اللاحقة بدقة حتمية.'
        ]
      }
    ],
    images: [
      {
        id: 'img-ai-1',
        url: createDiagramSvgDataUrl(
          '4-Layer Hybrid GC-NMT Architecture',
          'Aho-Corasick Masking → OOV Morphology → Neural NMT → UMD Injection',
          '#14b8a6'
        ),
        caption:
          'مخطط الطبقات الأربع لمحرك الترجمة العصبية المقيدة بالمعجم الطبي الموحد.'
      }
    ],
    links: [
      {
        id: 'lnk-ai-1',
        title: 'Attention Is All You Need — Transformer Architecture Paper',
        url: 'https://arxiv.org/abs/1706.03762',
        description: 'الورقة البحثية التأسيسية لمعمارية المحولات والانتباه الذاتي.'
      }
    ],
    attachments: [
      {
        id: 'att-ai-1',
        fileName: 'GCNMT_Pipeline_Specification.json',
        fileType: 'JSON / ARCHITECTURE SPEC',
        fileSizeLabel: '1.8 KB',
        contentDataUrlOrText: JSON.stringify(
          {
            architecture: 'Hybrid GC-NMT v2',
            layers: [
              'Layer 1: Aho-Corasick + [-7,+7] Contextual Disambiguation',
              'Layer 2: Multi-Root OOV Morphological Decomposer',
              'Layer 3: Neural Structural Translator',
              'Layer 4: UMD Bilingual Post-Processor'
            ]
          },
          null,
          2
        )
      }
    ]
  },
  {
    id: 'topic-tech-sqlite-3',
    title: 'تصميم محركات البحث الفوري SQLite FTS5 والمزامنة المحلية في بيئة Termux',
    subtitle:
      'High-Concurrency Edge Storage, Idempotency, and Sub-Millisecond Full-Text Search',
    category: 'Technology',
    author: 'قسم هندسة البرمجيات المدمجة',
    publishedAt: 'أكتوبر 2026',
    readingTimeMinutes: 5,
    favorite: false,
    sections: [
      {
        id: 'sec-tech-1',
        heading: '1. الفهرسة المعكوسة (Inverted Indexing) في SQLite FTS5',
        paragraphs: [
          'Building an offline-first knowledge graph capable of searching tens of thousands of bilingual records with ultra-low Latency requires an inverted index structure. SQLite FTS5 tokenizes both Arabic and English strings into prefix trees, enabling instant Concordance lookup across definitions and contextual examples.',
          'وعند تفعيل وضع الكتابة المسبقة في السجل (Write-Ahead Logging - WAL)، تتحقق درجة عالية من Concurrency تسمح لسكربتات بايثون في Termux بضخ المصطلحات الجديدة في الوقت نفسه الذي يتصفح فيه المستخدم الواجهة دون أي قفل لقاعدة البيانات.'
        ]
      },
      {
        id: 'sec-tech-2',
        heading: '2. ضمان عدم التكرار (Idempotency) وسلامة التسلسل البياني',
        paragraphs: [
          'Every batch ingestion pipeline must enforce strict Idempotency and schema validation during JSON Serialization. Using a Deterministic merge policy ensures that importing updated lexicon files enriches existing entries with new contextual sentences rather than duplicating records.',
          'كما تساعد الخوارزميات الاستدلالية (Heuristic) في اكتشاف الروابط الثنائية تلقائياً بين المصطلحات المشتركة في الجمل، مما يحول القاموس من قائمة جامدة إلى شبكة معرفية حية.'
        ]
      }
    ],
    images: [],
    links: [
      {
        id: 'lnk-tech-1',
        title: 'SQLite FTS5 Extension Official Documentation',
        url: 'https://www.sqlite.org/fts5.html',
        description: 'التوثيق الرسمي لمحرك البحث النصي الكامل FTS5 في قواعد بيانات SQLite.'
      }
    ],
    attachments: []
  },
  {
    id: 'topic-hist-lexicon-4',
    title: 'تاريخ المعاجم الطبية والعلمية العربية: من القانون في الطب إلى المعجم الموحد',
    subtitle:
      'Historical Evolution of Arabic Scientific Terminology and Morphological Derivation',
    category: 'History',
    author: 'وحدة التراث العلمي وتاريخ الطب',
    publishedAt: 'أكتوبر 2026',
    readingTimeMinutes: 6,
    favorite: true,
    sections: [
      {
        id: 'sec-hist-1',
        heading: '1. مدرسة الترجمة العباسية وتأسيس المصطلح السريري الدقيق',
        paragraphs: [
          'شهدت الحضارة العربية الإسلامية في القرنين الثالث والرابع للهجرة نهضة علمية غير مسبوقة في تعريب وتأصيل المصطلحات الطبية والفلسفية. وقد اعتمد العلماء والأطباء مثل حنين بن إسحاق وأبو بكر الرازي وابن سينا منهجية علمية صارمة تقوم على الاشتقاق الصرفي والنحت الدلالي لترجمة الجذور اليونانية واللاتينية إلى مقابلات عربية فصيحة ودقيقة.',
          'Classical Arabic medical encyclopedias systematically documented complex clinical conditions such as Pneumonia, Meningitis, Hemorrhage, and Jaundice (Hyperbilirubinemia) centuries before modern European nosology standardized clinical classifications.'
        ]
      },
      {
        id: 'sec-hist-2',
        heading: '2. التحول نحو المعجم الطبي الموحد (WHO UMD) في العصر الرقمي',
        paragraphs: [
          'في العصر الحديث، أطلقت منظمة الصحة العالمية مشروع المعجم الطبي الموحد لتوحيد المصطلح الطبي العربي عبر الجامعات والمستشفيات، والجمع بين الأصالة اللغوية العربية والدقة الاصطلاحية العالمية.',
          'Today, integrating the Unified Medical Dictionary with Morphological analysis, Epistemology, and Empirical clinical corpora empowers clinicians and researchers to read and publish complex scientific literature seamlessly in both Arabic and English.'
        ]
      }
    ],
    images: [
      {
        id: 'img-hist-1',
        url: createDiagramSvgDataUrl(
          'Arabic Scientific Lexicography Timeline',
          'Hunayn ibn Ishaq → Ibn Sina (Avicenna) → WHO Unified Medical Dictionary',
          '#f59e0b'
        ),
        caption:
          'مسيرة تطور المصطلح الطبي العربي من حركة الترجمة الكلاسيكية إلى الفهرسة الرقمية الحديثة.'
      }
    ],
    links: [],
    attachments: []
  },
  ...HEMATOLOGY_TOPICS,
  ...PARASITOLOGY_TOPICS
];

