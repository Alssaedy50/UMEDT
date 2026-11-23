import {
  DictionaryTerm,
  TopicArticle,
  MedicalBlock,
  MedicalSubject,
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
import {
  LEARNING_STORAGE_KEYS,
  loadMedicalBlocks,
  loadMedicalSubjects
} from './learningHierarchyService';

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

  // Combine without duplicate IDs — only include seed questions for locally downloaded topics
  const localTopicIds = new Set(topics.map((t) => t.id));
  const byId = new Map<string, UnifiedQuizQuestion>();
  for (const q of [...seedQuestions, ...curatedMultiType]) {
    if (q.topicId && !localTopicIds.has(q.topicId)) {
      continue;
    }
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

const memoryQuizStorage = new Map<string, string>();

function getSafeQuizStorage(): {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
} {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return {
    getItem: (k: string) => memoryQuizStorage.get(k) ?? null,
    setItem: (k: string, v: string) => {
      memoryQuizStorage.set(k, v);
    }
  };
}

// ============================================================================
// UNIFIED QUESTION IDENTITY, DEDUPLICATION & HIERARCHY INTEGRITY HELPERS
// ============================================================================

function normalizeTextToken(raw?: string): string {
  return String(raw || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f\u064B-\u065F\u0670]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeQuestionStemKey(raw?: string): string {
  const withoutPrefix = String(raw || '')
    .trim()
    .replace(/^(?:q\s*\d+|\d+)\s*[.):\-–—]+\s*/i, '')
    .trim();
  return normalizeTextToken(withoutPrefix);
}

/**
 * Computes a deterministic content identity fingerprint for any quiz question so
 * repeated imports with different or timestamped IDs are always detected as duplicates.
 */
export function computeQuestionIdentityFingerprint(
  q: Pick<
    UnifiedQuizQuestion,
    'type' | 'questionEn' | 'options' | 'acceptableAnswers' | 'matchingPairs'
  >
): string {
  const stemKey = normalizeQuestionStemKey(q.questionEn);
  const typeKey = String(q.type || 'single_choice').toLowerCase();
  if (!stemKey) return '';

  if (typeKey === 'matching') {
    const pairsKey = (q.matchingPairs || [])
      .map((p) => `${normalizeTextToken(p.leftEn)}=${normalizeTextToken(p.rightEn)}`)
      .filter(Boolean)
      .sort()
      .join('|');
    return `${typeKey}::${stemKey}::${pairsKey}`;
  }

  if (typeKey === 'fill_blank' || typeKey === 'short_answer') {
    const ansKey = (q.acceptableAnswers || [])
      .map((a) => normalizeTextToken(a))
      .filter(Boolean)
      .sort()
      .join('|');
    return `${typeKey}::${stemKey}::${ansKey}`;
  }

  if (typeKey === 'true_false') {
    return `${typeKey}::${stemKey}`;
  }

  const optsKey = (q.options || [])
    .map((o) => normalizeTextToken(o.textEn))
    .filter(Boolean)
    .sort()
    .join('|');
  return `${typeKey}::${stemKey}::${optsKey}`;
}

export function isQuestionContentEquivalent(
  existing: UnifiedQuizQuestion,
  incoming: UnifiedQuizQuestion
): boolean {
  if (existing.type !== incoming.type) return false;
  if (normalizeQuestionStemKey(existing.questionEn) !== normalizeQuestionStemKey(incoming.questionEn)) {
    return false;
  }
  if (incoming.questionAr && incoming.questionAr.trim() && !existing.questionAr?.trim()) {
    return false;
  }
  if (incoming.explanationAr && incoming.explanationAr.trim() && !existing.explanationAr?.trim()) {
    return false;
  }
  if (
    incoming.explanationEn &&
    incoming.explanationEn.trim() &&
    incoming.explanationEn.trim() !== 'Correct answer verified.' &&
    (!existing.explanationEn?.trim() || existing.explanationEn.trim() === 'Correct answer verified.')
  ) {
    return false;
  }
  if (incoming.imageUrl && incoming.imageUrl.trim() && !existing.imageUrl?.trim()) {
    return false;
  }
  if (incoming.topicId && !existing.topicId) {
    return false;
  }
  if (incoming.subjectId && !existing.subjectId) {
    return false;
  }
  if (incoming.blockId && !existing.blockId) {
    return false;
  }
  const existingCorrect = [...(existing.correctOptionKeys || [])].map((k) => k.toUpperCase()).sort().join(',');
  const incomingCorrect = [...(incoming.correctOptionKeys || [])].map((k) => k.toUpperCase()).sort().join(',');
  if (existingCorrect !== incomingCorrect) return false;
  return true;
}

function buildTopicMatchTokens(topic: TopicArticle): string[] {
  const candidates = [topic.id, topic.titleEn, topic.titleAr, topic.title, topic.subtitle];
  const tokens = new Set<string>();
  for (const c of candidates) {
    const norm = normalizeTextToken(c);
    if (norm.length >= 3) {
      tokens.add(norm);
    }
  }
  return Array.from(tokens);
}

/**
 * Resolves a question's topicId, subjectId, and blockId against the actual local hierarchy.
 * - Remaps incoming topic IDs when a topic matched an existing local topic.
 * - Matches slug/title aliases (e.g. "tp-phys-atherosclerosis" -> local Atherosclerosis topic).
 * - Backfills valid subjectId & blockId from the matched topic.
 * - Clears broken/phantom IDs that do not exist in the local hierarchy when local hierarchy is present.
 */
export function resolveQuestionHierarchyLink(
  q: UnifiedQuizQuestion,
  context: {
    blocks: MedicalBlock[];
    subjects: MedicalSubject[];
    topics: TopicArticle[];
    topicIdRemap?: Map<string, string>;
    fallbackSourceLabel?: string;
    clearUnknownIds?: boolean;
  }
): UnifiedQuizQuestion {
  const { blocks, subjects, topics, topicIdRemap, fallbackSourceLabel, clearUnknownIds = true } =
    context;

  const blockById = new Map(blocks.map((b) => [b.id, b]));
  const subjectById = new Map(subjects.map((s) => [s.id, s]));
  const topicById = new Map(topics.map((t) => [t.id, t]));

  let resolvedTopic: TopicArticle | undefined;
  const rawTopicId = String(q.topicId || '').trim();

  if (rawTopicId && topicIdRemap?.has(rawTopicId)) {
    resolvedTopic = topicById.get(topicIdRemap.get(rawTopicId)!);
  }
  if (!resolvedTopic && rawTopicId && topicById.has(rawTopicId)) {
    resolvedTopic = topicById.get(rawTopicId);
  }

  // Try matching broken/slugified topicId or sourceLabel against local topic titles
  if (!resolvedTopic && topics.length > 0) {
    const hints = [rawTopicId, q.sourceLabel, fallbackSourceLabel]
      .map((h) => normalizeTextToken(h))
      .filter((h) => h.length >= 3);

    if (hints.length > 0) {
      let bestTopic: TopicArticle | undefined;
      let bestScore = 0;
      for (const topic of topics) {
        const topicTokens = buildTopicMatchTokens(topic);
        for (const hint of hints) {
          for (const tt of topicTokens) {
            if (hint === tt) {
              bestTopic = topic;
              bestScore = 100;
              break;
            }
            if (tt.length >= 5 && (hint.includes(tt) || tt.includes(hint))) {
              const score = Math.min(hint.length, tt.length);
              if (score > bestScore) {
                bestScore = score;
                bestTopic = topic;
              }
            }
          }
          if (bestScore === 100) break;
        }
        if (bestScore === 100) break;
      }
      if (bestTopic && bestScore >= 5) {
        resolvedTopic = bestTopic;
      }
    }
  }

  if (resolvedTopic) {
    const validSubject = resolvedTopic.subjectId ? subjectById.get(resolvedTopic.subjectId) : undefined;
    const resolvedBlockId =
      (resolvedTopic.blockId && blockById.has(resolvedTopic.blockId) ? resolvedTopic.blockId : undefined) ||
      (validSubject?.blockId && blockById.has(validSubject.blockId) ? validSubject.blockId : undefined) ||
      (q.blockId && blockById.has(q.blockId) ? q.blockId : undefined);
    const resolvedSubjectId =
      (validSubject ? validSubject.id : undefined) ||
      (q.subjectId && subjectById.has(q.subjectId) ? q.subjectId : undefined);

    return {
      ...q,
      topicId: resolvedTopic.id,
      subjectId: resolvedSubjectId,
      blockId: resolvedBlockId
    };
  }

  // No local topic matched — still validate subjectId and blockId against local hierarchy
  const rawSubjectId = String(q.subjectId || '').trim();
  const rawBlockId = String(q.blockId || '').trim();

  let resolvedSubject = rawSubjectId ? subjectById.get(rawSubjectId) : undefined;
  if (!resolvedSubject && rawSubjectId && subjects.length > 0) {
    const normSubj = normalizeTextToken(rawSubjectId);
    resolvedSubject = subjects.find((s) => {
      const code = normalizeTextToken(s.code);
      const en = normalizeTextToken(s.titleEn);
      const ar = normalizeTextToken(s.titleAr);
      return (code && normSubj === code) || (en && normSubj.includes(en)) || (ar && normSubj.includes(ar));
    });
  }

  let resolvedBlock = rawBlockId ? blockById.get(rawBlockId) : undefined;
  if (!resolvedBlock && resolvedSubject?.blockId) {
    resolvedBlock = blockById.get(resolvedSubject.blockId);
  }
  if (!resolvedBlock && rawBlockId && blocks.length > 0) {
    const normBlk = normalizeTextToken(rawBlockId);
    resolvedBlock = blocks.find((b) => {
      const code = normalizeTextToken(b.code);
      const en = normalizeTextToken(b.titleEn);
      const ar = normalizeTextToken(b.titleAr);
      return (code && normBlk === code) || (en && normBlk.includes(en)) || (ar && normBlk.includes(ar));
    });
  }

  if (!clearUnknownIds) {
    return {
      ...q,
      topicId: rawTopicId || undefined,
      subjectId: resolvedSubject?.id || rawSubjectId || undefined,
      blockId: resolvedBlock?.id || rawBlockId || undefined
    };
  }

  return {
    ...q,
    topicId: topics.length > 0 ? undefined : rawTopicId || undefined,
    subjectId:
      resolvedSubject?.id || (subjects.length > 0 ? undefined : rawSubjectId || undefined),
    blockId: resolvedBlock?.id || (blocks.length > 0 ? undefined : rawBlockId || undefined)
  };
}

function mergeSingleQuestionRecord(
  existing: UnifiedQuizQuestion,
  incoming: UnifiedQuizQuestion,
  mode: 'ignore' | 'merge' | 'overwrite'
): UnifiedQuizQuestion {
  if (mode === 'overwrite') {
    return {
      ...existing,
      ...incoming,
      id: existing.id,
      blockId: incoming.blockId || existing.blockId,
      subjectId: incoming.subjectId || existing.subjectId,
      topicId: incoming.topicId || existing.topicId,
      linkedTermIds:
        incoming.linkedTermIds && incoming.linkedTermIds.length > 0
          ? Array.from(new Set([...(existing.linkedTermIds || []), ...incoming.linkedTermIds]))
          : existing.linkedTermIds || []
    };
  }
  // Smart non-destructive merge: preserve existing ID and valid hierarchy links, fill missing fields
  return {
    ...existing,
    questionAr: existing.questionAr?.trim() ? existing.questionAr : incoming.questionAr,
    imageUrl: existing.imageUrl?.trim() ? existing.imageUrl : incoming.imageUrl,
    imageCaption: existing.imageCaption?.trim() ? existing.imageCaption : incoming.imageCaption,
    explanationEn:
      existing.explanationEn?.trim() && existing.explanationEn !== 'Correct answer verified.'
        ? existing.explanationEn
        : incoming.explanationEn || existing.explanationEn,
    explanationAr: existing.explanationAr?.trim() ? existing.explanationAr : incoming.explanationAr,
    blockId: existing.blockId || incoming.blockId,
    subjectId: existing.subjectId || incoming.subjectId,
    topicId: existing.topicId || incoming.topicId,
    sectionId: existing.sectionId || incoming.sectionId,
    linkedTermIds: Array.from(
      new Set([...(existing.linkedTermIds || []), ...(incoming.linkedTermIds || [])])
    )
  };
}

export function mergeAndDeduplicateQuizQuestions(
  existing: UnifiedQuizQuestion[],
  incoming: UnifiedQuizQuestion[],
  options?: {
    conflictPolicy?: 'ignore' | 'merge' | 'overwrite';
    blocks?: MedicalBlock[];
    subjects?: MedicalSubject[];
    topics?: TopicArticle[];
    topicIdRemap?: Map<string, string>;
    fallbackSourceLabel?: string;
    clearUnknownIds?: boolean;
  }
): {
  mergedQuestions: UnifiedQuizQuestion[];
  addedQuestions: UnifiedQuizQuestion[];
  updatedQuestions: UnifiedQuizQuestion[];
  skippedDuplicates: number;
} {
  const mode = options?.conflictPolicy || 'merge';
  const blocks = options?.blocks;
  const subjects = options?.subjects;
  const topics = options?.topics;
  const shouldResolveHierarchy = Boolean(blocks || subjects || topics);

  const result: UnifiedQuizQuestion[] = [...existing];
  const byId = new Map<string, number>();
  const byFingerprint = new Map<string, number>();

  result.forEach((q, idx) => {
    byId.set(q.id, idx);
    const fp = computeQuestionIdentityFingerprint(q);
    if (fp && !byFingerprint.has(fp)) {
      byFingerprint.set(fp, idx);
    }
  });

  const addedQuestions: UnifiedQuizQuestion[] = [];
  const updatedQuestions: UnifiedQuizQuestion[] = [];
  let skippedDuplicates = 0;

  for (const rawQ of incoming) {
    const resolvedQ = shouldResolveHierarchy
      ? resolveQuestionHierarchyLink(rawQ, {
          blocks: blocks || [],
          subjects: subjects || [],
          topics: topics || [],
          topicIdRemap: options?.topicIdRemap,
          fallbackSourceLabel: options?.fallbackSourceLabel,
          clearUnknownIds: options?.clearUnknownIds ?? true
        })
      : rawQ;

    const fp = computeQuestionIdentityFingerprint(resolvedQ);
    let matchIdx = byId.has(resolvedQ.id) ? byId.get(resolvedQ.id)! : -1;
    if (matchIdx === -1 && fp && byFingerprint.has(fp)) {
      matchIdx = byFingerprint.get(fp)!;
    }

    if (matchIdx !== -1) {
      if (mode === 'ignore') {
        skippedDuplicates++;
        continue;
      }
      const prev = result[matchIdx];
      if (mode === 'merge' && isQuestionContentEquivalent(prev, resolvedQ)) {
        skippedDuplicates++;
        continue;
      }
      const merged = mergeSingleQuestionRecord(prev, resolvedQ, mode);
      if (JSON.stringify(merged) === JSON.stringify(prev)) {
        skippedDuplicates++;
        continue;
      }
      result[matchIdx] = merged;
      updatedQuestions.push(merged);
      const mergedFp = computeQuestionIdentityFingerprint(merged);
      if (mergedFp) byFingerprint.set(mergedFp, matchIdx);
    } else {
      // Ensure unique ID (avoid collision with any existing ID)
      let safeId = resolvedQ.id;
      if (byId.has(safeId)) {
        safeId = `${safeId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      }
      const finalQ: UnifiedQuizQuestion = safeId === resolvedQ.id ? resolvedQ : { ...resolvedQ, id: safeId };
      const nextIdx = result.length;
      result.push(finalQ);
      byId.set(finalQ.id, nextIdx);
      if (fp) byFingerprint.set(fp, nextIdx);
      addedQuestions.push(finalQ);
    }
  }

  return {
    mergedQuestions: result,
    addedQuestions,
    updatedQuestions,
    skippedDuplicates
  };
}

function scoreQuestionQuality(
  q: UnifiedQuizQuestion,
  validTopicIds: Set<string>,
  referencedInAttempts: Set<string>
): number {
  let score = 0;
  if (referencedInAttempts.has(q.id)) score += 100;
  if (q.topicId && validTopicIds.has(q.topicId)) score += 50;
  if (q.subjectId) score += 10;
  if (q.blockId) score += 10;
  if (q.questionAr?.trim()) score += 5;
  if (q.explanationAr?.trim()) score += 5;
  if (q.explanationEn?.trim() && q.explanationEn !== 'Correct answer verified.') score += 4;
  if (q.imageUrl?.trim()) score += 3;
  return score;
}

/**
 * Safely deduplicates stored questions (by normalized identity fingerprint) and repairs
 * broken slug/title topic links against the local hierarchy without losing valid user data.
 */
export function sanitizeAndReconcileStoredQuizQuestions(
  stored: UnifiedQuizQuestion[],
  topics: TopicArticle[],
  blocks?: MedicalBlock[],
  subjects?: MedicalSubject[]
): { questions: UnifiedQuizQuestion[]; changed: boolean; removedDuplicates: number } {
  if (!Array.isArray(stored) || stored.length === 0) {
    return { questions: [], changed: false, removedDuplicates: 0 };
  }

  const localBlocks = blocks ?? loadMedicalBlocks();
  const localSubjects = subjects ?? loadMedicalSubjects();
  const validTopicIds = new Set(topics.map((t) => t.id));
  const referencedIds = new Set<string>();
  try {
    for (const att of loadQuizAttempts()) {
      for (const qid of att.questionIds || []) referencedIds.add(qid);
      for (const ans of att.answers || []) referencedIds.add(ans.questionId);
    }
  } catch {
    // non-fatal
  }

  let changed = false;
  let removedDuplicates = 0;

  // Step 1: Repair hierarchy links ONLY when local topics are available (never strip when topics is empty!)
  const repaired = stored.map((q) => {
    if (topics.length === 0) return q;
    const next = resolveQuestionHierarchyLink(q, {
      blocks: localBlocks,
      subjects: localSubjects,
      topics,
      clearUnknownIds: true
    });
    if (
      next.topicId !== q.topicId ||
      next.subjectId !== q.subjectId ||
      next.blockId !== q.blockId
    ) {
      changed = true;
    }
    return next;
  });

  // Step 2: Deduplicate exact duplicate questions by fingerprint (keeping highest quality/referenced copy)
  const deduped: UnifiedQuizQuestion[] = [];
  const fpToIndex = new Map<string, number>();
  const idSeen = new Set<string>();

  for (const q of repaired) {
    if (!q || typeof q.questionEn !== 'string' || !q.questionEn.trim()) {
      changed = true;
      removedDuplicates++;
      continue;
    }
    if (idSeen.has(q.id)) {
      changed = true;
      removedDuplicates++;
      continue;
    }
    const fp = computeQuestionIdentityFingerprint(q);
    if (fp && fpToIndex.has(fp)) {
      const existingIdx = fpToIndex.get(fp)!;
      const existingQ = deduped[existingIdx];
      const existingScore = scoreQuestionQuality(existingQ, validTopicIds, referencedIds);
      const candidateScore = scoreQuestionQuality(q, validTopicIds, referencedIds);
      if (candidateScore > existingScore) {
        deduped[existingIdx] = mergeSingleQuestionRecord(q, existingQ, 'merge');
      } else {
        deduped[existingIdx] = mergeSingleQuestionRecord(existingQ, q, 'merge');
      }
      changed = true;
      removedDuplicates++;
      continue;
    }
    idSeen.add(q.id);
    if (fp) fpToIndex.set(fp, deduped.length);
    deduped.push(q);
  }

  return { questions: deduped, changed, removedDuplicates };
}

export function loadQuizQuestions(
  topics: TopicArticle[],
  terms: DictionaryTerm[]
): UnifiedQuizQuestion[] {
  const isBrowserRuntime = typeof window !== 'undefined';
  const seedBank = isBrowserRuntime ? [] : buildInitialSeedQuizBank(topics, terms);
  try {
    const raw = getSafeQuizStorage().getItem(LEARNING_STORAGE_KEYS.QUIZ_QUESTIONS);
    if (!raw) return seedBank;
    const parsed = JSON.parse(raw) as UnifiedQuizQuestion[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return seedBank;
    }
    if (isBrowserRuntime) {
      const reconciled = sanitizeAndReconcileStoredQuizQuestions(parsed, topics);
      if (reconciled.changed) {
        saveQuizQuestions(reconciled.questions);
      }
      return reconciled.questions;
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
    getSafeQuizStorage().setItem(
      LEARNING_STORAGE_KEYS.QUIZ_QUESTIONS,
      JSON.stringify(questions)
    );
  } catch {
    // ignore
  }
}

export function loadQuizAttempts(): QuizAttemptRecord[] {
  try {
    const raw = getSafeQuizStorage().getItem(LEARNING_STORAGE_KEYS.QUIZ_ATTEMPTS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveQuizAttempts(attempts: QuizAttemptRecord[]): void {
  try {
    getSafeQuizStorage().setItem(
      LEARNING_STORAGE_KEYS.QUIZ_ATTEMPTS,
      JSON.stringify(attempts.slice(0, 100))
    );
  } catch {
    // ignore
  }
}

export function saveQuizAttempt(attempt: QuizAttemptRecord): QuizAttemptRecord[] {
  const current = loadQuizAttempts();
  const updated = [attempt, ...current.filter((a) => a.id !== attempt.id)].slice(0, 100);
  try {
    getSafeQuizStorage().setItem(
      LEARNING_STORAGE_KEYS.QUIZ_ATTEMPTS,
      JSON.stringify(updated)
    );
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
