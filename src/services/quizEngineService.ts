import {
  DictionaryTerm,
  TopicArticle,
  UnifiedQuizQuestion,
  UnifiedQuestionType,
  UnifiedQuizOption,
  UnifiedMatchingPair,
  QuizValidationIssue,
  QuizValidationReport,
  QuizAttemptAnswer,
  QuizAttemptRecord
} from '../types/lexicon';
import { extractLinkedTermsFromText } from '../engine/knowledgeLinker';
import { LEARNING_STORAGE_KEYS } from './learningHierarchyService';

export const BULK_QUIZ_TEXT_TEMPLATE = `Q1: What is the primary site of dietary iron absorption in humans?
A) Stomach
B) Duodenum and proximal jejunum
C) Terminal ileum
D) Ascending colon
Answer: B
Explanation: Non-heme and heme iron are absorbed primarily in the duodenum and proximal jejunum via DMT1 and ferroportin.

Q2: [MULTIPLE] Which of the following laboratory findings are characteristic of intravascular hemolysis?
A) Decreased serum haptoglobin
B) Elevated unconjugated bilirubin
C) Decreased reticulocyte count
D) Hemoglobinuria
Answer: A, B, D
Explanation: Intravascular hemolysis releases free hemoglobin into plasma, depleting haptoglobin and causing hemoglobinuria and elevated indirect bilirubin.

Q3: [TF] Vitamin B12 binds to Intrinsic Factor and is absorbed in the terminal ileum.
Answer: True
Explanation: Vitamin B12-Intrinsic Factor complex is absorbed specifically in the terminal ileum.

Q4: [BLANK] The infective stage of Schistosoma species that penetrates human skin in freshwater is the ______.
Answer: Cercaria | Fork-tailed cercaria
Explanation: Fork-tailed cercariae released from freshwater snails penetrate intact human skin.`;

/**
 * Extracts embedded MCQs (such as Q01..Q22 in pt-parasito-08-mcq-viva) and combines them
 * with curated multi-type Hematology, Parasitology, and Cardiology questions.
 */
export function buildInitialSeedQuizBank(
  topics: TopicArticle[],
  terms: DictionaryTerm[]
): UnifiedQuizQuestion[] {
  const seedQuestions: UnifiedQuizQuestion[] = [];

  // 1. Parse all Q01..Q22 from pt-parasito-08-mcq-viva automatically
  const parasitoMcqTopic = topics.find((t) => t.id === 'pt-parasito-08-mcq-viva');
  if (parasitoMcqTopic) {
    for (const sec of parasitoMcqTopic.sections) {
      for (const para of sec.paragraphs || []) {
        const parsed = parseInlineCompactMcqLine(
          para,
          'block-infectious',
          'subj-parasitology',
          parasitoMcqTopic.id,
          terms,
          parasitoMcqTopic.images?.[0]?.url
        );
        if (parsed) {
          seedQuestions.push(parsed);
        }
      }
    }
  }

  // 2. Add comprehensive multi-type questions across Hematology, Parasitology, and Cardiology
  const curatedMultiType: UnifiedQuizQuestion[] = [
    {
      id: 'seed-q-heme-01',
      type: 'single_choice',
      questionEn:
        'Which hormone is produced primarily by peritubular interstitial cells of the kidney in response to tissue hypoxia to stimulate erythroid progenitors?',
      questionAr: 'ما الهرمون الذي يُفرز أساساً من الكلية استجابةً لنقص الأكسجة لتحفيز سلائف الكريات الحمر؟',
      options: [
        { key: 'A', textEn: 'Thrombopoietin (TPO)', textAr: 'ثرومبوبويتين' },
        { key: 'B', textEn: 'Erythropoietin (EPO)', textAr: 'إريثروبويتين' },
        { key: 'C', textEn: 'Hepcidin', textAr: 'هيبسيدين' },
        { key: 'D', textEn: 'G-CSF', textAr: 'عامل تحفيز مستعمرات المحببات' }
      ],
      correctOptionKeys: ['B'],
      explanationEn:
        'Erythropoietin (EPO) is synthesized mainly by the kidneys in response to cellular hypoxia and drives red blood cell production in bone marrow.',
      explanationAr:
        'يُفرز الإريثروبويتين (EPO) بشكل رئيسي من الكليتين استجابة لنقص الأكسجة النسيجية ويحفز تمايز الكريات الحمر في نخاع العظم.',
      blockId: 'block-hematology',
      subjectId: 'subj-hematology',
      topicId: 'topic-heme-01',
      linkedTermIds: extractLinkedTermsFromText('Erythropoietin hypoxia anemia bone marrow', terms),
      difficulty: 'easy',
      sourceLabel: 'UMEDT Hematology Core Bank',
      createdAt: '2026-11-05'
    },
    {
      id: 'seed-q-heme-02',
      type: 'multiple_select',
      questionEn:
        'Select ALL laboratory findings expected in classic uncomplicated Iron Deficiency Anemia (IDA):',
      questionAr: 'اختر جميع النتائج المخبرية المتوقعة في فقر الدم الكلاسيكي بعوز الحديد (IDA):',
      options: [
        { key: 'A', textEn: 'Decreased serum ferritin', textAr: 'انخفاض فيريتين المصل' },
        { key: 'B', textEn: 'Increased Total Iron-Binding Capacity (TIBC)', textAr: 'ارتفاع السعة الرابطة الكلية للحديد (TIBC)' },
        { key: 'C', textEn: 'Decreased MCV and MCH (microcytic hypochromic)', textAr: 'انخفاض MCV و MCH (صغير الكريات ناقص الصباغ)' },
        { key: 'D', textEn: 'Increased transferrin saturation (>50%)', textAr: 'ارتفاع إشباع الترانسفيرين فوق 50%' }
      ],
      correctOptionKeys: ['A', 'B', 'C'],
      explanationEn:
        'IDA is characterized by depleted iron stores (low ferritin), compensatory elevation of transferrin/TIBC, low MCV/MCH, and decreased transferrin saturation.',
      explanationAr:
        'يتميز عوز الحديد بانخفاض الفيريتين، وارتفاع تعويضي في TIBC، ونقص MCV و MCH، مع انخفاض نسبة إشباع الترانسفيرين.',
      blockId: 'block-hematology',
      subjectId: 'subj-hematology',
      topicId: 'topic-heme-04',
      linkedTermIds: extractLinkedTermsFromText('Iron Deficiency Anemia microcytic ferritin', terms),
      difficulty: 'medium',
      sourceLabel: 'UMEDT Hematology Core Bank',
      createdAt: '2026-11-05'
    },
    {
      id: 'seed-q-heme-03',
      type: 'matching',
      questionEn:
        'Match each hematologic condition or finding with its classic clinical/laboratory association:',
      questionAr: 'طابق كل حالة دموية مع الارتباط المخبري أو السريري المميز لها:',
      options: [],
      correctOptionKeys: [],
      matchingPairs: [
        {
          id: 'mp-1',
          leftEn: 'Parvovirus B19 in Sickle Cell Disease',
          leftAr: 'فيروس Parvovirus B19 في فقر الدم المنجلي',
          rightEn: 'Aplastic crisis with markedly low reticulocytes',
          rightAr: 'أزمة لاتنسجية مع هبوط شديد في الشبكيات'
        },
        {
          id: 'mp-2',
          leftEn: 'Vitamin B12 Deficiency',
          leftAr: 'عوز فيتامين B12',
          rightEn: 'Hypersegmented neutrophils + peripheral neuropathy',
          rightAr: 'عدلات مفرطة التفصص مع اعتلال عصبي محيطي'
        },
        {
          id: 'mp-3',
          leftEn: 'Acute Myeloid Leukemia (AML)',
          leftAr: 'ابيضاض الدم النقوي الحاد (AML)',
          rightEn: 'Myeloperoxidase (MPO) positivity & Auer rods',
          rightAr: 'إيجابية MPO وعصيات Auer داخل الأرومات'
        },
        {
          id: 'mp-4',
          leftEn: 'Chronic Myeloid Leukemia (CML)',
          leftAr: 'ابيضاض الدم النقوي المزمن (CML)',
          rightEn: 'BCR::ABL1 fusion (Philadelphia chromosome)',
          rightAr: 'اندماج BCR::ABL1 (صبغي فيلادلفيا)'
        }
      ],
      explanationEn:
        'Parvovirus B19 infects erythroid progenitors causing aplastic crisis; B12 deficiency causes megaloblastic anemia with neuropathy; AML shows MPO/Auer rods; CML is driven by BCR::ABL1.',
      explanationAr:
        'يصيب Parvovirus B19 سلائف الحمر مسبباً أزمة لاتنسجية، ويسبب عوز B12 ضخامة أرومات مع أعصاب، بينما تتميز AML بعصيات Auer و CML بصبغي فيلادلفيا.',
      blockId: 'block-hematology',
      subjectId: 'subj-hematology',
      topicId: 'topic-heme-06',
      linkedTermIds: extractLinkedTermsFromText('Sickle Cell Leukemia Anemia', terms),
      difficulty: 'medium',
      sourceLabel: 'UMEDT Hematology Core Bank',
      createdAt: '2026-11-05'
    },
    {
      id: 'seed-q-heme-04',
      type: 'fill_blank',
      questionEn:
        'In primary hemostasis, platelets adhere to exposed subendothelial collagen via ______ factor binding to platelet receptor GPIb.',
      questionAr: 'في الإرقاء الأولي، تلتصق الصفائح الدموية بالكولاجين تحت البطاني عبر عامل ______ المرتبط بمستقبل GPIb.',
      options: [],
      correctOptionKeys: [],
      acceptableAnswers: ['von Willebrand', 'vWF', 'von Willebrand factor', 'فون ويلبراند'],
      explanationEn:
        'von Willebrand factor (vWF) bridges subendothelial collagen and platelet glycoprotein Ib (GPIb) during platelet adhesion.',
      explanationAr:
        'يعمل عامل فون ويلبراند (vWF) كجسر يربط الكولاجين تحت البطاني بمستقبل GPIb على سطح الصفيحة الدموية.',
      blockId: 'block-hematology',
      subjectId: 'subj-hematology',
      topicId: 'topic-heme-12',
      linkedTermIds: extractLinkedTermsFromText('Thrombocytopenia Hemorrhage Coagulation', terms),
      difficulty: 'medium',
      sourceLabel: 'UMEDT Hematology Core Bank',
      createdAt: '2026-11-05'
    },
    {
      id: 'seed-q-heme-05',
      type: 'true_false',
      questionEn:
        'Folic acid supplementation alone should NEVER be given empirically when Vitamin B12 deficiency has not been excluded, because it can mask hematologic findings while neurological damage progresses.',
      questionAr: 'لا يجوز إعطاء حمض الفوليك وحده دون استبعاد عوز فيتامين B12 لأنه قد يحسّن فقر الدم بينما يستمر التلف العصبي بالتفاقم.',
      options: [
        { key: 'T', textEn: 'True (صحيح)', textAr: 'صحيح' },
        { key: 'F', textEn: 'False (خطأ)', textAr: 'خطأ' }
      ],
      correctOptionKeys: ['T'],
      explanationEn:
        'Giving folate alone in B12 deficiency partially corrects megaloblastic anemia but allows subacute combined degeneration of the spinal cord to worsen.',
      explanationAr:
        'إعطاء الفولات منفرداً لمريض يعاني من عوز B12 قد يخفي فقر الدم بينما يستمر التنكس العصبي في الحبل الشوكي والأعصاب المحيطية.',
      blockId: 'block-hematology',
      subjectId: 'subj-hematology',
      topicId: 'topic-heme-07',
      linkedTermIds: extractLinkedTermsFromText('Anemia Neuropathy', terms),
      difficulty: 'easy',
      sourceLabel: 'UMEDT Hematology Core Bank',
      createdAt: '2026-11-05'
    },
    {
      id: 'seed-q-heme-06',
      type: 'short_answer',
      questionEn:
        'Name the characteristic histological structures found exclusively in the medulla of the thymus gland:',
      questionAr: 'اذكر الاسم العلمي للبنى النسيجية المميزة الموجودة حصرياً في لب الغدة الزعترية (Thymic medulla):',
      options: [],
      correctOptionKeys: [],
      acceptableAnswers: [
        'Hassall corpuscles',
        "Hassall's corpuscles",
        'Hassall',
        'جسيمات هاسال'
      ],
      explanationEn:
        'Hassall corpuscles (concentric eosinophilic whorls of epithelial reticular cells) are the hallmark of the thymic medulla.',
      explanationAr:
        'جسيمات هاسال (Hassall corpuscles) هي العلامة النسيجية الفارقة للب الغدة الزعترية.',
      blockId: 'block-hematology',
      subjectId: 'subj-hematology',
      topicId: 'topic-heme-13',
      linkedTermIds: [],
      difficulty: 'medium',
      sourceLabel: 'UMEDT Hematology Core Bank',
      createdAt: '2026-11-05'
    },
    {
      id: 'seed-q-para-img-01',
      type: 'image_based',
      questionEn:
        'Examine the diagnostic taxonomy diagram. Which class of Platyhelminthes includes segmented tapeworms such as Taenia saginata and Hymenolepis nana?',
      questionAr: 'انظر إلى المخطط التشخيصي المرفق: أي صنف من الديدان المفلطحة يضم الديدان الشريطية المقسمة مثل Taenia و Hymenolepis؟',
      imageUrl:
        topics.find((t) => t.id === 'pt-parasito-01-foundations')?.images?.[0]?.url || '',
      imageCaption: 'Helminths Taxonomy & Diagnostic Classification Diagram',
      options: [
        { key: 'A', textEn: 'Nematoda (Roundworms)', textAr: 'الديدان الأسطوانية' },
        { key: 'B', textEn: 'Cestoda (Tapeworms)', textAr: 'الديدان الشريطية' },
        { key: 'C', textEn: 'Trematoda (Flukes)', textAr: 'المثقوبات' },
        { key: 'D', textEn: 'Protozoa', textAr: 'الأوالي' }
      ],
      correctOptionKeys: ['B'],
      explanationEn:
        'Platyhelminthes (flatworms) are divided into Cestoda (segmented tapeworms) and Trematoda (non-segmented leaf-like flukes).',
      explanationAr:
        'تنقسم الديدان المفلطحة إلى Cestoda (الديدان الشريطية المقسمة) و Trematoda (المثقوبات الورقية غير المقسمة).',
      blockId: 'block-infectious',
      subjectId: 'subj-parasitology',
      topicId: 'pt-parasito-01-foundations',
      linkedTermIds: [],
      difficulty: 'easy',
      sourceLabel: 'UMEDT Parasitology Practical Spotter',
      createdAt: '2026-11-05'
    },
    {
      id: 'seed-q-cardio-01',
      type: 'single_choice',
      questionEn:
        'In patients presenting with ST-Elevation Myocardial Infarction (STEMI), what is the gold-standard reperfusion strategy and target time window?',
      questionAr: 'في مرضى احتشاء عضلة القلب المترافق بارتفاع القطعة ST، ما هو التدخل المعياري الذهبي لإعادة التروية التاجية؟',
      options: [
        {
          key: 'A',
          textEn: 'Primary PCI / Coronary Angioplasty within 90 minutes',
          textAr: 'القسطرة التاجية الأولية (Primary PCI) خلال 90 دقيقة'
        },
        {
          key: 'B',
          textEn: 'Observation with serial ECGs over 48 hours only',
          textAr: 'المراقبة السريرية فقط لمدة 48 ساعة'
        },
        {
          key: 'C',
          textEn: 'Oral iron replacement therapy',
          textAr: 'تعويض الحديد الفموي'
        },
        {
          key: 'D',
          textEn: 'Delayed outpatient stress echocardiography',
          textAr: 'إيكو القلب بالمجهود في العيادات الخارجية'
        }
      ],
      correctOptionKeys: ['A'],
      explanationEn:
        'Timely restoration of coronary perfusion via primary percutaneous coronary angioplasty (PCI) within 90 minutes salvages ischemic myocardium and reduces mortality.',
      explanationAr:
        'إعادة التروية العاجلة عبر القسطرة التاجية الأولية (Primary PCI) خلال 90 دقيقة تنقذ العضلة القلبية الإقفارية وتقلل الوفيات.',
      blockId: 'block-clinical-medicine',
      subjectId: 'subj-cardiology',
      topicId: 'topic-med-acs-1',
      linkedTermIds: extractLinkedTermsFromText(
        'Myocardial Infarction Ischemia Angioplasty Troponin',
        terms
      ),
      difficulty: 'easy',
      sourceLabel: 'WHO UMD Cardiology Protocol',
      createdAt: '2026-11-05'
    }
  ];

  // Combine without duplicate IDs
  const byId = new Map<string, UnifiedQuizQuestion>();
  for (const q of [...seedQuestions, ...curatedMultiType]) {
    byId.set(q.id, q);
  }
  return Array.from(byId.values());
}

/**
 * Parses compact single-paragraph MCQ lines like:
 * "Q01. The infective stage of Ascaris lumbricoides for humans is: A) Unfertilized egg  B) Embryonated egg  C) Rhabditiform larva  D) Adult worm. Answer: B — الإنسان يبتلع embryonated egg."
 */
export function parseInlineCompactMcqLine(
  line: string,
  blockId: string,
  subjectId: string,
  topicId: string,
  terms: DictionaryTerm[],
  fallbackImageUrl?: string
): UnifiedQuizQuestion | null {
  const clean = line.trim();
  const qMatch = clean.match(/^Q(\d+)\.\s*(.+?)\s+Answer:\s*([A-E])\s*(?:—|-|:)?\s*(.*)$/i);
  if (!qMatch) return null;

  const qNum = qMatch[1];
  const bodyAndOptions = qMatch[2].trim();
  const answerKey = qMatch[3].toUpperCase();
  const explanationRaw = (qMatch[4] || '').trim();

  // Split question stem from options A) ... B) ...
  const firstOptionIdx = bodyAndOptions.search(/\bA\)\s+/);
  if (firstOptionIdx === -1) return null;

  const questionStem = bodyAndOptions.slice(0, firstOptionIdx).trim();
  const optionsSegment = bodyAndOptions.slice(firstOptionIdx).trim();

  const optionRegex = /\b([A-E])\)\s*([\s\S]*?)(?=(?:\s+[B-E]\)\s+)|$)/g;
  const options: UnifiedQuizOption[] = [];
  let match: RegExpExecArray | null;
  while ((match = optionRegex.exec(optionsSegment)) !== null) {
    const key = match[1].toUpperCase();
    const rawOptText = match[2].trim().replace(/\.\s*$/, '');
    options.push({
      key,
      textEn: rawOptText
    });
  }

  if (options.length < 2) return null;

  const isTrueFalse =
    options.length === 2 &&
    options[0].textEn.toLowerCase() === 'true' &&
    options[1].textEn.toLowerCase() === 'false';

  const normalizedOptions: UnifiedQuizOption[] = isTrueFalse
    ? [
        { key: 'T', textEn: 'True', textAr: 'صحيح' },
        { key: 'F', textEn: 'False', textAr: 'خطأ' }
      ]
    : options;

  const normalizedAnswerKey = isTrueFalse
    ? answerKey === 'A'
      ? 'T'
      : 'F'
    : answerKey;

  const linkedTermIds = extractLinkedTermsFromText(
    `${questionStem} ${options.map((o) => o.textEn).join(' ')} ${explanationRaw}`,
    terms
  );

  return {
    id: `para-q-${qNum}`,
    type: isTrueFalse ? 'true_false' : 'single_choice',
    questionEn: `Q${qNum}. ${questionStem}`,
    options: normalizedOptions,
    correctOptionKeys: [normalizedAnswerKey],
    explanationEn: explanationRaw || `Correct answer is ${normalizedAnswerKey}.`,
    explanationAr: explanationRaw,
    blockId,
    subjectId,
    topicId,
    imageUrl: qNum === '02' || qNum === '12' || qNum === '16' ? fallbackImageUrl : undefined,
    linkedTermIds,
    difficulty: 'medium',
    sourceLabel: 'Parasitology Practical Course (Topic 08)',
    createdAt: '2026-11-05'
  };
}

/**
 * Validates a single question object before saving or importing, returning detailed issues.
 */
export function validateSingleQuizQuestion(
  q: Partial<UnifiedQuizQuestion>,
  indexOrLine = 1
): { valid: boolean; normalized?: UnifiedQuizQuestion; issues: QuizValidationIssue[] } {
  const issues: QuizValidationIssue[] = [];
  const questionEn = (q.questionEn || '').trim();
  const type: UnifiedQuestionType = q.type || 'single_choice';

  if (!questionEn || questionEn.length < 4) {
    issues.push({
      lineOrIndex: indexOrLine,
      field: 'questionEn',
      severity: 'error',
      messageAr: `السؤال رقم ${indexOrLine}: نص السؤال باللغة الإنجليزية مفقود أو قصير جداً.`
    });
  }

  const options = Array.isArray(q.options) ? q.options : [];
  const correctKeys = Array.isArray(q.correctOptionKeys)
    ? q.correctOptionKeys.map((k) => String(k).trim().toUpperCase()).filter(Boolean)
    : [];

  if (type === 'single_choice' || type === 'multiple_select' || type === 'image_based') {
    if (options.length < 2) {
      issues.push({
        lineOrIndex: indexOrLine,
        field: 'options',
        severity: 'error',
        messageAr: `السؤال رقم ${indexOrLine}: يجب توفير خيارين (A, B) على الأقل لأسئلة الاختيار.`
      });
    }
    const emptyOpt = options.find((o) => !o.textEn || !o.textEn.trim());
    if (emptyOpt) {
      issues.push({
        lineOrIndex: indexOrLine,
        field: 'options',
        severity: 'error',
        messageAr: `السؤال رقم ${indexOrLine}: الخيار (${emptyOpt.key}) فارغ بدون نص.`
      });
    }
    if (correctKeys.length === 0) {
      issues.push({
        lineOrIndex: indexOrLine,
        field: 'correctOptionKeys',
        severity: 'error',
        messageAr: `السؤال رقم ${indexOrLine}: لم يتم تحديد الإجابة الصحيحة.`
      });
    } else {
      const validKeySet = new Set(options.map((o) => o.key.toUpperCase()));
      for (const ck of correctKeys) {
        if (!validKeySet.has(ck)) {
          issues.push({
            lineOrIndex: indexOrLine,
            field: 'correctOptionKeys',
            severity: 'error',
            messageAr: `السؤال رقم ${indexOrLine}: رمز الإجابة الصحيحة (${ck}) غير موجود ضمن الخيارات المتاحة (${Array.from(validKeySet).join(', ')}).`
          });
        }
      }
    }
    if (type === 'image_based' && !q.imageUrl?.trim()) {
      issues.push({
        lineOrIndex: indexOrLine,
        field: 'imageUrl',
        severity: 'warning',
        messageAr: `السؤال رقم ${indexOrLine}: سؤال مبني على صورة ولكن لم يتم إرفاق رابط أو ملف صورة بعد.`
      });
    }
  } else if (type === 'true_false') {
    if (correctKeys.length === 0 || !['T', 'F', 'TRUE', 'FALSE', 'A', 'B'].includes(correctKeys[0])) {
      issues.push({
        lineOrIndex: indexOrLine,
        field: 'correctOptionKeys',
        severity: 'error',
        messageAr: `السؤال رقم ${indexOrLine}: سؤال صح/خطأ يتطلب تحديد الإجابة (T أو F).`
      });
    }
  } else if (type === 'matching') {
    const pairs = Array.isArray(q.matchingPairs) ? q.matchingPairs : [];
    if (pairs.length < 2) {
      issues.push({
        lineOrIndex: indexOrLine,
        field: 'matchingPairs',
        severity: 'error',
        messageAr: `السؤال رقم ${indexOrLine}: سؤال المطابقة (Matching) يتطلب زوجين على الأقل.`
      });
    }
  } else if (type === 'fill_blank' || type === 'short_answer') {
    const acceptable = Array.isArray(q.acceptableAnswers)
      ? q.acceptableAnswers.map((a) => a.trim()).filter(Boolean)
      : [];
    if (acceptable.length === 0) {
      issues.push({
        lineOrIndex: indexOrLine,
        field: 'acceptableAnswers',
        severity: 'error',
        messageAr: `السؤال رقم ${indexOrLine}: يجب إدخال إجابة نموذجية مقبولة واحدة على الأقل.`
      });
    }
  }

  const explanationEn = (q.explanationEn || q.explanationAr || '').trim();
  if (!explanationEn) {
    issues.push({
      lineOrIndex: indexOrLine,
      field: 'explanationEn',
      severity: 'warning',
      messageAr: `السؤال رقم ${indexOrLine}: يفضّل إضافة تفسير علمي (Explanation) لتوضيح سبب صحة الإجابة.`
    });
  }

  const hasBlockingError = issues.some((i) => i.severity === 'error');
  if (hasBlockingError) {
    return { valid: false, issues };
  }

  const normalizedTfKey =
    type === 'true_false'
      ? ['T', 'TRUE', 'A'].includes(correctKeys[0])
        ? ['T']
        : ['F']
      : correctKeys;

  const normalizedOptions: UnifiedQuizOption[] =
    type === 'true_false'
      ? [
          { key: 'T', textEn: 'True', textAr: 'صحيح' },
          { key: 'F', textEn: 'False', textAr: 'خطأ' }
        ]
      : options.map((o) => ({
          key: o.key.toUpperCase(),
          textEn: o.textEn.trim(),
          textAr: o.textAr?.trim()
        }));

  const normalized: UnifiedQuizQuestion = {
    id: q.id || `quiz-q-${Date.now()}-${indexOrLine}`,
    type,
    questionEn,
    questionAr: q.questionAr?.trim(),
    imageUrl: q.imageUrl?.trim(),
    imageCaption: q.imageCaption?.trim(),
    options: normalizedOptions,
    correctOptionKeys: normalizedTfKey,
    matchingPairs: q.matchingPairs,
    acceptableAnswers: q.acceptableAnswers?.map((a) => a.trim()).filter(Boolean),
    explanationEn: explanationEn || 'Correct answer verified.',
    explanationAr: q.explanationAr?.trim() || explanationEn,
    blockId: q.blockId,
    subjectId: q.subjectId,
    topicId: q.topicId,
    sectionId: q.sectionId,
    linkedTermIds: q.linkedTermIds || [],
    difficulty: q.difficulty || 'medium',
    sourceLabel: q.sourceLabel || 'User Imported Question',
    createdAt: q.createdAt || new Date().toISOString()
  };

  return { valid: true, normalized, issues };
}

/**
 * Parses bulk pasted text containing multiple questions into validated UnifiedQuizQuestion items,
 * pinpointing exact block/line errors before saving.
 */
export function parseAndValidateBulkQuestionsText(
  rawText: string,
  defaults: {
    blockId?: string;
    subjectId?: string;
    topicId?: string;
    terms: DictionaryTerm[];
  }
): QuizValidationReport {
  const issues: QuizValidationIssue[] = [];
  const validQuestions: UnifiedQuizQuestion[] = [];
  const trimmed = rawText.trim();

  if (!trimmed) {
    return {
      valid: false,
      questions: [],
      issues: [
        {
          lineOrIndex: 1,
          field: 'rawText',
          severity: 'error',
          messageAr: 'النص المُلصق فارغ. يرجى لصق الأسئلة أو استخدام القالب القياسي.'
        }
      ]
    };
  }

  // First check if user pasted compact single-line questions (Q01. ... Answer: B — ...)
  const singleLines = trimmed
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const compactMatches = singleLines.filter((l) => /^Q\d+\.\s+.+Answer:\s*[A-E]/i.test(l));
  if (compactMatches.length > 0 && compactMatches.length === singleLines.length) {
    singleLines.forEach((line, idx) => {
      const parsed = parseInlineCompactMcqLine(
        line,
        defaults.blockId || 'block-hematology',
        defaults.subjectId || 'subj-hematology',
        defaults.topicId || '',
        defaults.terms
      );
      if (parsed) {
        parsed.id = `bulk-compact-${Date.now()}-${idx + 1}`;
        validQuestions.push(parsed);
      } else {
        issues.push({
          lineOrIndex: idx + 1,
          field: 'format',
          severity: 'error',
          messageAr: `السطر ${idx + 1}: تعذر قراءة الخيارات أو الإجابة الصحيحة في هذا السطر.`,
          rawSnippet: line.slice(0, 90)
        });
      }
    });

    return {
      valid: issues.every((i) => i.severity !== 'error') && validQuestions.length > 0,
      questions: validQuestions,
      issues
    };
  }

  // Standard multi-line blocks separated by blank lines or starting with Q1: / 1.
  const rawBlocks = trimmed
    .split(/\n\s*\n+/)
    .map((b) => b.trim())
    .filter(Boolean);

  rawBlocks.forEach((block, idx) => {
    const blockNum = idx + 1;
    const lines = block
      .split(/\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length === 0) return;

    const firstLine = lines[0].replace(/^(?:Q\d+[:.)]?|\d+[:.)])\s*/i, '').trim();
    let type: UnifiedQuestionType = 'single_choice';
    let cleanQuestionEn = firstLine;

    if (/^\[MULTIPLE\]/i.test(cleanQuestionEn)) {
      type = 'multiple_select';
      cleanQuestionEn = cleanQuestionEn.replace(/^\[MULTIPLE\]\s*/i, '').trim();
    } else if (/^\[TF\]|^\[TRUE\/FALSE\]/i.test(cleanQuestionEn)) {
      type = 'true_false';
      cleanQuestionEn = cleanQuestionEn.replace(/^\[(?:TF|TRUE\/FALSE)\]\s*/i, '').trim();
    } else if (/^\[BLANK\]/i.test(cleanQuestionEn)) {
      type = 'fill_blank';
      cleanQuestionEn = cleanQuestionEn.replace(/^\[BLANK\]\s*/i, '').trim();
    } else if (/^\[SHORT\]/i.test(cleanQuestionEn)) {
      type = 'short_answer';
      cleanQuestionEn = cleanQuestionEn.replace(/^\[SHORT\]\s*/i, '').trim();
    }

    const options: UnifiedQuizOption[] = [];
    let answerLine = '';
    let explanationLine = '';
    let questionAr = '';

    for (let i = 1; i < lines.length; i++) {
      const l = lines[i];
      const optMatch = l.match(/^([A-E])[).:-]\s*(.+)$/i);
      const ansMatch = l.match(/^(?:Answer|Correct|الإجابة)\s*[:=-]\s*(.+)$/i);
      const expMatch = l.match(/^(?:Explanation|Rationale|التفسير|الشرح)\s*[:=-]\s*(.+)$/i);
      const arMatch = l.match(/^(?:AR|الترجمة)\s*[:=-]\s*(.+)$/i);

      if (optMatch) {
        options.push({
          key: optMatch[1].toUpperCase(),
          textEn: optMatch[2].trim()
        });
      } else if (ansMatch) {
        answerLine = ansMatch[1].trim();
      } else if (expMatch) {
        explanationLine = expMatch[1].trim();
      } else if (arMatch) {
        questionAr = arMatch[1].trim();
      }
    }

    let correctOptionKeys: string[] = [];
    let acceptableAnswers: string[] = [];

    if (type === 'fill_blank' || type === 'short_answer') {
      acceptableAnswers = answerLine
        .split(/[|,]/)
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (type === 'true_false' || (options.length === 0 && /^(true|false|t|f|صحيح|خطأ)$/i.test(answerLine))) {
      type = 'true_false';
      const upper = answerLine.toUpperCase();
      correctOptionKeys =
        upper.startsWith('T') || answerLine === 'صحيح'
          ? ['T']
          : upper.startsWith('F') || answerLine === 'خطأ'
            ? ['F']
            : [];
    } else {
      correctOptionKeys = answerLine
        .split(/[\s,|/]+/)
        .map((s) => s.replace(/[^A-Ea-e]/g, '').toUpperCase())
        .filter(Boolean);
      if (correctOptionKeys.length > 1) {
        type = 'multiple_select';
      }
    }

    const linkedTermIds = extractLinkedTermsFromText(
      `${cleanQuestionEn} ${options.map((o) => o.textEn).join(' ')} ${explanationLine}`,
      defaults.terms
    );

    const validation = validateSingleQuizQuestion(
      {
        id: `bulk-q-${Date.now()}-${blockNum}`,
        type,
        questionEn: cleanQuestionEn,
        questionAr: questionAr || undefined,
        options,
        correctOptionKeys,
        acceptableAnswers,
        explanationEn: explanationLine || `Correct answer: ${answerLine}`,
        explanationAr: explanationLine || undefined,
        blockId: defaults.blockId,
        subjectId: defaults.subjectId,
        topicId: defaults.topicId,
        linkedTermIds
      },
      blockNum
    );

    issues.push(
      ...validation.issues.map((iss) => ({
        ...iss,
        rawSnippet: lines[0].slice(0, 80)
      }))
    );

    if (validation.valid && validation.normalized) {
      validQuestions.push(validation.normalized);
    }
  });

  return {
    valid: issues.every((i) => i.severity !== 'error') && validQuestions.length > 0,
    questions: validQuestions,
    issues
  };
}

/**
 * Parses and validates imported JSON (primary format) or CSV/TXT files into UnifiedQuizQuestion[].
 */
export function parseAndValidateQuestionsJsonOrCsv(
  content: string,
  fileName: string,
  defaults: {
    blockId?: string;
    subjectId?: string;
    topicId?: string;
    terms: DictionaryTerm[];
  }
): QuizValidationReport {
  const lowerName = fileName.toLowerCase();
  const trimmed = content.trim();

  if (lowerName.endsWith('.json') || trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      const rawArray: Record<string, unknown>[] = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed.questions)
          ? parsed.questions
          : [];

      if (rawArray.length === 0) {
        return {
          valid: false,
          questions: [],
          issues: [
            {
              lineOrIndex: 1,
              field: 'json',
              severity: 'error',
              messageAr: 'ملف JSON لا يحتوي على مصفوفة أسئلة صالحة (questions array).'
            }
          ]
        };
      }

      const issues: QuizValidationIssue[] = [];
      const validQuestions: UnifiedQuizQuestion[] = [];

      rawArray.forEach((rawItem, idx) => {
        const qNum = idx + 1;
        const rawType = String(rawItem.type || 'single_choice') as UnifiedQuestionType;
        const questionEn = String(
          rawItem.questionEn || rawItem.question || rawItem.stem || ''
        ).trim();
        const questionAr = rawItem.questionAr ? String(rawItem.questionAr).trim() : undefined;

        let options: UnifiedQuizOption[] = [];
        if (Array.isArray(rawItem.options)) {
          options = rawItem.options.map((opt: unknown, oIdx: number) => {
            if (typeof opt === 'string') {
              return {
                key: String.fromCharCode(65 + oIdx),
                textEn: opt
              };
            }
            const obj = opt as Record<string, unknown>;
            return {
              key: String(obj.key || String.fromCharCode(65 + oIdx)).toUpperCase(),
              textEn: String(obj.textEn || obj.text || ''),
              textAr: obj.textAr ? String(obj.textAr) : undefined
            };
          });
        }

        const rawCorrect =
          rawItem.correctOptionKeys ||
          rawItem.correctAnswerKey ||
          rawItem.correctAnswer ||
          rawItem.answer;
        const correctOptionKeys: string[] = Array.isArray(rawCorrect)
          ? rawCorrect.map((k) => String(k).toUpperCase())
          : rawCorrect
            ? [String(rawCorrect).toUpperCase()]
            : [];

        const acceptableAnswers: string[] = Array.isArray(rawItem.acceptableAnswers)
          ? rawItem.acceptableAnswers.map((a) => String(a))
          : [];

        const matchingPairs: UnifiedMatchingPair[] | undefined = Array.isArray(
          rawItem.matchingPairs
        )
          ? rawItem.matchingPairs.map((p: Record<string, unknown>, pIdx: number) => ({
              id: String(p.id || `pair-${pIdx + 1}`),
              leftEn: String(p.leftEn || p.left || ''),
              leftAr: p.leftAr ? String(p.leftAr) : undefined,
              rightEn: String(p.rightEn || p.right || ''),
              rightAr: p.rightAr ? String(p.rightAr) : undefined
            }))
          : undefined;

        const explanationEn = String(
          rawItem.explanationEn || rawItem.explanation || ''
        ).trim();

        const linkedTermIds = extractLinkedTermsFromText(
          `${questionEn} ${options.map((o) => o.textEn).join(' ')} ${explanationEn}`,
          defaults.terms
        );

        const check = validateSingleQuizQuestion(
          {
            id: rawItem.id ? String(rawItem.id) : `json-q-${Date.now()}-${qNum}`,
            type: rawType,
            questionEn,
            questionAr,
            imageUrl: rawItem.imageUrl ? String(rawItem.imageUrl) : undefined,
            options,
            correctOptionKeys,
            matchingPairs,
            acceptableAnswers,
            explanationEn,
            explanationAr: rawItem.explanationAr
              ? String(rawItem.explanationAr)
              : explanationEn,
            blockId: rawItem.blockId ? String(rawItem.blockId) : defaults.blockId,
            subjectId: rawItem.subjectId ? String(rawItem.subjectId) : defaults.subjectId,
            topicId: rawItem.topicId ? String(rawItem.topicId) : defaults.topicId,
            linkedTermIds
          },
          qNum
        );

        issues.push(...check.issues);
        if (check.valid && check.normalized) {
          validQuestions.push(check.normalized);
        }
      });

      return {
        valid: issues.every((i) => i.severity !== 'error') && validQuestions.length > 0,
        questions: validQuestions,
        issues
      };
    } catch (err) {
      return {
        valid: false,
        questions: [],
        issues: [
          {
            lineOrIndex: 1,
            field: 'json',
            severity: 'error',
            messageAr: `خطأ في صياغة ملف JSON: ${err instanceof Error ? err.message : 'Invalid JSON'}`
          }
        ]
      };
    }
  }

  // Fallback to text/template parser
  return parseAndValidateBulkQuestionsText(content, defaults);
}

/**
 * Evaluates a user's answer for any of the 7 supported question types.
 */
export function evaluateQuizQuestionAnswer(
  question: UnifiedQuizQuestion,
  userResponse: {
    selectedKeys?: string[];
    textAnswer?: string;
    matchingMap?: Record<string, string>;
  }
): boolean {
  if (
    question.type === 'single_choice' ||
    question.type === 'true_false' ||
    question.type === 'image_based'
  ) {
    const selected = (userResponse.selectedKeys || [])[0]?.toUpperCase();
    const expected = (question.correctOptionKeys || [])[0]?.toUpperCase();
    return Boolean(selected && expected && selected === expected);
  }

  if (question.type === 'multiple_select') {
    const selectedSet = new Set((userResponse.selectedKeys || []).map((k) => k.toUpperCase()));
    const expectedSet = new Set((question.correctOptionKeys || []).map((k) => k.toUpperCase()));
    if (selectedSet.size !== expectedSet.size || expectedSet.size === 0) return false;
    for (const k of expectedSet) {
      if (!selectedSet.has(k)) return false;
    }
    return true;
  }

  if (question.type === 'matching') {
    const pairs = question.matchingPairs || [];
    const map = userResponse.matchingMap || {};
    if (pairs.length === 0) return false;
    return pairs.every((p) => map[p.id] === p.rightEn);
  }

  if (question.type === 'fill_blank' || question.type === 'short_answer') {
    const cleanUser = (userResponse.textAnswer || '')
      .trim()
      .toLowerCase()
      .replace(/[.,;:!?'"()-]+/g, ' ')
      .replace(/\s+/g, ' ');
    if (!cleanUser) return false;
    const acceptable = (question.acceptableAnswers || []).map((a) =>
      a
        .trim()
        .toLowerCase()
        .replace(/[.,;:!?'"()-]+/g, ' ')
        .replace(/\s+/g, ' ')
    );
    return acceptable.some((acc) => cleanUser === acc || cleanUser.includes(acc));
  }

  return false;
}

export function loadQuizQuestions(
  topics: TopicArticle[],
  terms: DictionaryTerm[]
): UnifiedQuizQuestion[] {
  const seedBank = buildInitialSeedQuizBank(topics, terms);
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return seedBank;
    }
    const raw = window.localStorage.getItem(LEARNING_STORAGE_KEYS.QUIZ_QUESTIONS);
    if (!raw) return seedBank;
    const parsed = JSON.parse(raw) as UnifiedQuizQuestion[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return seedBank;
    }
    const existingIds = new Set(parsed.map((q) => q.id));
    const missingSeeds = seedBank.filter((sq) => !existingIds.has(sq.id));
    return [...parsed, ...missingSeeds];
  } catch {
    return seedBank;
  }
}

export function saveQuizQuestions(questions: UnifiedQuizQuestion[]): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(
        LEARNING_STORAGE_KEYS.QUIZ_QUESTIONS,
        JSON.stringify(questions)
      );
    }
  } catch {
    // ignore
  }
}

export function loadQuizAttempts(): QuizAttemptRecord[] {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    const raw = window.localStorage.getItem(LEARNING_STORAGE_KEYS.QUIZ_ATTEMPTS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveQuizAttempt(attempt: QuizAttemptRecord): QuizAttemptRecord[] {
  const current = loadQuizAttempts();
  const updated = [attempt, ...current.filter((a) => a.id !== attempt.id)].slice(0, 100);
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(
        LEARNING_STORAGE_KEYS.QUIZ_ATTEMPTS,
        JSON.stringify(updated)
      );
    }
  } catch {
    // ignore
  }
  return updated;
}

export function buildQuizAttemptRecord(params: {
  title: string;
  scopeType: QuizAttemptRecord['scopeType'];
  blockId?: string;
  subjectId?: string;
  topicIds: string[];
  mode: 'instant' | 'exam';
  questions: UnifiedQuizQuestion[];
  answers: QuizAttemptAnswer[];
  durationSeconds: number;
}): QuizAttemptRecord {
  const totalQuestions = params.questions.length;
  const correctCount = params.answers.filter((a) => a.isCorrect).length;
  const wrongCount = Math.max(0, totalQuestions - correctCount);
  const scorePercent =
    totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

  return {
    id: `attempt-${Date.now()}`,
    title: params.title,
    scopeType: params.scopeType,
    blockId: params.blockId,
    subjectId: params.subjectId,
    topicIds: params.topicIds,
    mode: params.mode,
    totalQuestions,
    correctCount,
    wrongCount,
    scorePercent,
    durationSeconds: params.durationSeconds,
    completedAt: new Date().toISOString(),
    answers: params.answers,
    questionIds: params.questions.map((q) => q.id)
  };
}
