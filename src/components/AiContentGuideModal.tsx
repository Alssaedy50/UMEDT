import React, { useState, useMemo } from 'react';
import {
  X,
  Copy,
  Check,
  Sparkles,
  FileJson,
  BookOpen,
  Zap,
  Bot,
  ShieldCheck,
  Sliders,
  Download,
  Layers,
  FileText
} from 'lucide-react';
import {
  importUniversalAiOrLocalContent,
  UniversalImportReport
} from '../services/aiUniversalImportService';
import {
  loadMedicalBlocks,
  loadMedicalSubjects
} from '../services/learningHierarchyService';

interface AiContentGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onQuickImportReport?: (report: UniversalImportReport) => void;
  showToast?: (msg: string, type?: string) => void;
  onOpenPasteModal?: () => void;
  onOpenUploadModal?: () => void;
}

type GuideTab = 'builder' | 'prompts' | 'templates' | 'rules';

type PromptTargetScope = 'block' | 'subject' | 'topic';

type PromptOutputFormat =
  | 'both'
  | 'json_file'
  | 'high_density_text'
  | 'markdown_file';

type TemplateKey =
  | 'block_subject'
  | 'topic_full'
  | 'terms_batch'
  | 'sentences_batch'
  | 'affixes_abbrs'
  | 'questions_all7'
  | 'exam_package'
  | 'book_pdf'
  | 'media_asset';

const COVERAGE_AXIS_PRESETS = [
  { ar: 'التشريح والفسيولوجيا', en: 'Anatomy & Physiology' },
  { ar: 'الفيزيولوجيا المرضية', en: 'Pathophysiology & Etiology' },
  { ar: 'الأعراض والعلامات السريرية', en: 'Clinical Presentation & Signs' },
  { ar: 'التشخيص والفحوصات والأشعة', en: 'Diagnostic Workup, Labs & Imaging' },
  { ar: 'التشخيص التفريقي', en: 'Differential Diagnosis' },
  { ar: 'العلاج الدوائي والتدبير السريري', en: 'Pharmacology & Clinical Management' },
  { ar: 'الطوارئ والمضاعفات والإنذار', en: 'Emergencies, Complications & Prognosis' }
];

const SYSTEM_PROMPT_UNIVERSAL_AI = `أنت خبير أكاديمي طبي ومهندس بيانات تعليمية لمنصة UMEDT (القاموس الطبي والمنصة التعليمية السريرية).
مهمتك: توليد محتوى طبي دقيق ومنظّم بصيغة JSON أو Markdown أو نص عالي الكثافة (||) صالح للاستيراد المباشر داخل تطبيق UMEDT أو للنشر في مستودع UMEDT-DATA.

قواعد الإخراج الإلزامية (Strict Output Contract — UMEDT-DATA v2):
1. أخرج النتيجة بالصيغة المطلوبة تماماً (ملف أو كود JSON أو ملف Markdown .md أو ملف نصي عالي الكثافة .txt بفواصل ||) دون حشو خارجي.
2. لا تضع أي روابط base64 ضخمة (data:...)؛ للصور وملفات PDF والصوت والفيديو استخدم downloadUrl / rawUrl / externalUrl بصيغة https:// مباشرة.
3. استخدم معرفات ثابتة واضحة بالصيغة: block-..., subj-..., tp-..., term-..., sent-..., q-..., exam-..., book-..., asset-... لكي يطابقها التطبيق ويمنع التكرار عبر SHA-256.
4. اربط كل موضوع صراحةً بكلٍ من blockId و subjectId لضمان ظهوره داخل المادة الصحيحة داخل البلوك الصحيح.
5. جميع أنواع البلوكات المدعومة داخل sections[].contentBlocks:
   - heading | paragraph | table | clinical_note | diagram | image | pdf_viewer | book_reference | exam_link | audio | video | video_link | attachment | question
6. جميع أنواع الأسئلة المدعومة في questions[] (UnifiedQuestionType):
   - single_choice | multiple_select | true_false | matching | fill_blank | short_answer | image_based`;

const LECTURE_AND_EXAM_PROMPT = `أنشئ حزمة UMEDT متكاملة لموضوع طبي (مثلاً: Acute Coronary Syndrome أو Acute Kidney Injury) بصيغة JSON واحدة تحتوي على المفاتيح التالية عند الحاجة:
{
  "blocks": [...],
  "subjects": [...],
  "topics": [
    {
      "id": "tp-...",
      "blockId": "blk-...",
      "subjectId": "subj-...",
      "titleEn": "...",
      "titleAr": "...",
      "category": "Medical",
      "sections": [
        {
          "id": "sec-1",
          "headingEn": "...",
          "headingAr": "...",
          "contentBlocks": [
            { "id": "cb-1", "type": "paragraph", "order": 1, "text": "...", "textAr": "..." },
            { "id": "cb-2", "type": "table", "order": 2, "titleEn": "...", "titleAr": "...", "tableHeaders": ["..."], "tableRows": [["..."]] },
            { "id": "cb-3", "type": "clinical_note", "order": 3, "titleEn": "Clinical Pearl", "titleAr": "تنبيه سريري", "text": "..." },
            { "id": "cb-4", "type": "diagram", "order": 4, "titleEn": "...", "titleAr": "...", "diagramSvg": "<svg viewBox='0 0 400 180' xmlns='http://www.w3.org/2000/svg'>...</svg>" },
            { "id": "cb-5", "type": "pdf_viewer", "order": 5, "titleEn": "Reference Slides", "titleAr": "شرائح المحاضرة PDF", "externalUrl": "https://example.org/slides.pdf" },
            { "id": "cb-6", "type": "book_reference", "order": 6, "bookId": "book-...", "titleEn": "Harrison Chapter", "titleAr": "مرجع الكتاب", "text": "Chapter 12, pp. 210-224" },
            { "id": "cb-7", "type": "exam_link", "order": 7, "examId": "exam-...", "titleEn": "Topic Self-Assessment", "titleAr": "اختبار الموضوع" },
            { "id": "cb-8", "type": "question", "order": 8, "inlineQuestion": { "questionEn": "...", "options": [{"key":"A","textEn":"..."},{"key":"B","textEn":"..."}], "correctOptionKeys": ["A"], "explanationEn": "..." } }
          ]
        }
      ]
    }
  ],
  "terms": [...],
  "sentences": [...],
  "books": [...],
  "questions": [...],
  "exams": [...],
  "mediaAssets": [...]
}`;

const JSON_TEMPLATES: Record<
  TemplateKey,
  { labelAr: string; shortDesc: string; json: object }
> = {
  block_subject: {
    labelAr: 'بلوك ومادة',
    shortDesc: 'Block + Subject',
    json: {
      blocks: [
        {
          id: 'blk-cardio',
          code: 'BLK-CVS',
          titleEn: 'Cardiovascular System Block',
          titleAr: 'بلوك الجهاز القلبي الوعائي',
          descriptionEn: 'Integrated cardiovascular anatomy, physiology, and clinical cardiology.',
          descriptionAr: 'التشريح والفسيولوجيا والأمراض السريرية للجهاز القلبي الوعائي.',
          colorAccent: 'emerald',
          order: 10
        }
      ],
      subjects: [
        {
          id: 'subj-cardiology',
          blockId: 'blk-cardio',
          code: 'CVS-201',
          titleEn: 'Clinical Cardiology',
          titleAr: 'أمراض القلب السريرية',
          descriptionEn: 'Ischemic heart disease, heart failure, and arrhythmias.',
          descriptionAr: 'أمراض نقص التروية القلبية وقصور القلب واضطرابات النظم.',
          order: 1
        }
      ]
    }
  },
  topic_full: {
    labelAr: 'موضوع متكامل',
    shortDesc: 'كل البلوكات + SVG + PDF + اختبار',
    json: {
      topics: [
        {
          id: 'tp-acs-overview',
          blockId: 'blk-cardio',
          subjectId: 'subj-cardiology',
          title: 'Acute Coronary Syndrome',
          titleEn: 'Acute Coronary Syndrome (ACS)',
          titleAr: 'المتلازمة التاجية الحادة',
          subtitle: 'تشخيص وتدبير احتشاء عضلة القلب الحاد والذبحة غير المستقرة',
          category: 'Medical',
          author: 'UMEDT Editorial',
          readingTimeMinutes: 8,
          sections: [
            {
              id: 'sec-acs-1',
              headingEn: 'Pathophysiology & Classification',
              headingAr: 'الفيزيولوجيا المرضية والتصنيف',
              contentBlocks: [
                {
                  id: 'cb-acs-1',
                  type: 'paragraph',
                  order: 1,
                  text: 'Acute coronary syndrome (ACS) spans unstable angina, NSTEMI, and STEMI following atherosclerotic plaque rupture and acute coronary thrombosis.',
                  textAr: 'تشمل المتلازمة التاجية الحادة الذبحة غير المستقرة وNSTEMI وSTEMI نتيجة تمزق اللويحة العصيدية وتخثر الشريان التاجي.'
                },
                {
                  id: 'cb-acs-2',
                  type: 'table',
                  order: 2,
                  titleEn: 'ACS Differential Comparison',
                  titleAr: 'جدول المقارنة بين أنواع ACS',
                  tableHeaders: ['Type', 'ECG Finding', 'Troponin'],
                  tableRows: [
                    ['Unstable Angina', 'Normal or ST depression', 'Negative'],
                    ['NSTEMI', 'ST depression / T inversion', 'Elevated'],
                    ['STEMI', 'ST elevation >= 1 mm', 'Markedly Elevated']
                  ]
                },
                {
                  id: 'cb-acs-3',
                  type: 'clinical_note',
                  order: 3,
                  titleEn: 'Door-to-Balloon Target',
                  titleAr: 'الوقت الحرج للقسطرة',
                  text: 'Primary PCI should be performed within 90 minutes of first medical contact in STEMI.'
                },
                {
                  id: 'cb-acs-4',
                  type: 'diagram',
                  order: 4,
                  titleEn: 'ACS Triage Pathway',
                  titleAr: 'مخطط فرز المتلازمة التاجية',
                  diagramSvg:
                    '<svg viewBox="0 0 420 140" xmlns="http://www.w3.org/2000/svg"><rect x="10" y="45" width="110" height="50" rx="10" fill="#10b981" fill-opacity="0.18" stroke="#10b981" stroke-width="2"/><text x="65" y="75" text-anchor="middle" fill="currentColor" font-size="12" font-weight="bold">Chest Pain + ECG</text><line x1="120" y1="70" x2="165" y2="70" stroke="#10b981" stroke-width="2"/><rect x="165" y="15" width="110" height="44" rx="10" fill="#ef4444" fill-opacity="0.16" stroke="#ef4444" stroke-width="2"/><text x="220" y="41" text-anchor="middle" fill="currentColor" font-size="11" font-weight="bold">ST Elevation -> PCI</text><rect x="165" y="80" width="110" height="44" rx="10" fill="#f59e0b" fill-opacity="0.16" stroke="#f59e0b" stroke-width="2"/><text x="220" y="106" text-anchor="middle" fill="currentColor" font-size="11" font-weight="bold">No STE -> Troponin</text></svg>'
                }
              ]
            }
          ]
        }
      ]
    }
  },
  terms_batch: {
    labelAr: 'مصطلحات',
    shortDesc: 'Terms + أمثلة',
    json: {
      terms: [
        {
          id: 'term-troponin',
          term: 'Troponin',
          translation: 'التروبونين القلبي',
          phonetic: '/ˈtroʊpənɪn/',
          pos: 'noun',
          category: 'Medical',
          umdCode: 'UMD-CVS-001',
          definitionAr: 'بروتين تنظيمي في عضلة القلب يرتفع مستواه في الدم عند حدوث نخر قلبي حاد.',
          definitionEn: 'A regulatory cardiac muscle protein released into circulation upon myocardial injury.',
          examples: [
            {
              en: 'Serial cardiac troponin levels confirm acute myocardial infarction.',
              ar: 'تؤكد مستويات التروبونين القلبي المتسلسلة حدوث احتشاء عضلة القلب الحاد.'
            }
          ],
          relations: {
            synonyms: ['cTnI', 'cTnT'],
            broader: ['Cardiac Biomarker'],
            related: ['Myocardial Infarction']
          }
        }
      ]
    }
  },
  sentences_batch: {
    labelAr: 'جمل سريرية',
    shortDesc: 'Sentences',
    json: {
      sentences: [
        {
          id: 'sent-acs-01',
          en: 'Immediate dual antiplatelet therapy is indicated in suspected acute coronary syndrome.',
          ar: 'يُستطب العلاج المزدوج بمضادات الصفيحات فوراً عند الاشتباه بالمتلازمة التاجية الحادة.',
          category: 'Medical',
          tags: ['ACS', 'Pharmacology'],
          topicId: 'tp-acs-overview'
        }
      ]
    }
  },
  affixes_abbrs: {
    labelAr: 'جذور واختصارات',
    shortDesc: 'Affixes & Abbrs',
    json: {
      customAffixes: [
        {
          affix: 'cardi-',
          cleanKey: 'cardi',
          type: 'root',
          meaningAr: 'قلب',
          meaningEn: 'heart',
          examples: ['cardiomyopathy', 'pericarditis']
        }
      ],
      customAbbreviations: [
        {
          abbr: 'NSTEMI',
          expansionEn: 'Non-ST-Segment Elevation Myocardial Infarction',
          meaningAr: 'احتشاء عضلة القلب دون ارتفاع قطعة ST',
          specialty: 'Cardiology'
        }
      ]
    }
  },
  questions_all7: {
    labelAr: 'بنك أسئلة (7 أنواع)',
    shortDesc: 'كل أنماط الأسئلة القياسية',
    json: {
      questions: [
        {
          id: 'q-acs-1',
          type: 'single_choice',
          blockId: 'blk-cardio',
          subjectId: 'subj-cardiology',
          topicId: 'tp-acs-overview',
          difficulty: 'medium',
          questionEn: 'What is the gold-standard reperfusion strategy for STEMI within 90 minutes?',
          questionAr: 'ما هي استراتيجية إعادة التروية المثلى في احتشاء STEMI خلال 90 دقيقة؟',
          options: [
            { key: 'A', textEn: 'Primary Percutaneous Coronary Intervention (PCI)', textAr: 'القسطرة التاجية الأولية' },
            { key: 'B', textEn: 'Oral Beta Blocker Alone', textAr: 'حاصر بيتا فموي فقط' },
            { key: 'C', textEn: 'Observation for 24 hours', textAr: 'المراقبة لمدة 24 ساعة' }
          ],
          correctOptionKeys: ['A'],
          explanationEn: 'Primary PCI is superior to fibrinolysis when performed within guideline timeframes.',
          explanationAr: 'القسطرة التاجية الأولية هي المعيار الذهبي عند توفرها ضمن المهلة الزمنية المحددة.'
        },
        {
          id: 'q-acs-2',
          type: 'multiple_select',
          topicId: 'tp-acs-overview',
          difficulty: 'medium',
          questionEn: 'Select ALL core initial medications for suspected ACS:',
          questionAr: 'اختر جميع الأدوية الأولية الأساسية في الاشتباه بـ ACS:',
          options: [
            { key: 'A', textEn: 'Aspirin', textAr: 'أسبرين' },
            { key: 'B', textEn: 'P2Y12 inhibitor', textAr: 'مثبط P2Y12' },
            { key: 'C', textEn: 'Amoxicillin', textAr: 'أموكسيسيلين' }
          ],
          correctOptionKeys: ['A', 'B'],
          explanationEn: 'Dual antiplatelet therapy (Aspirin + P2Y12 inhibitor) is essential.'
        },
        {
          id: 'q-acs-3',
          type: 'true_false',
          topicId: 'tp-acs-overview',
          difficulty: 'easy',
          questionEn: 'Serum troponin remains normal in classic Unstable Angina.',
          options: [
            { key: 'T', textEn: 'True', textAr: 'صحيح' },
            { key: 'F', textEn: 'False', textAr: 'خطأ' }
          ],
          correctOptionKeys: ['T'],
          explanationEn: 'Unstable angina involves myocardial ischemia without detectable myocyte necrosis.'
        }
      ]
    }
  },
  exam_package: {
    labelAr: 'اختبار رسمي',
    shortDesc: 'AcademicExamPackage',
    json: {
      exams: [
        {
          id: 'exam-acs-quiz',
          titleEn: 'ACS Clinical Mastery Exam',
          titleAr: 'اختبار إتقان المتلازمة التاجية الحادة',
          descriptionAr: 'تقييم شامل للتشخيص والتخطيط والتدبير الدوائي.',
          examType: 'comprehensive',
          blockId: 'blk-cardio',
          subjectId: 'subj-cardiology',
          topicIds: ['tp-acs-overview'],
          durationMinutes: 15,
          passingScorePercent: 70,
          totalPoints: 100,
          shuffleQuestions: true,
          questionIds: ['q-acs-1', 'q-acs-2', 'q-acs-3']
        }
      ]
    }
  },
  book_pdf: {
    labelAr: 'كتاب / PDF',
    shortDesc: 'AcademicBookResource',
    json: {
      books: [
        {
          id: 'book-cardio-manual',
          titleEn: 'Clinical Cardiology Reference Manual',
          titleAr: 'المرجع السريري لأمراض القلب',
          subtitleAr: 'مذكرة مركزة للطوارئ القلبية وقراءة التخطيط',
          authors: ['UMEDT Medical Board'],
          publisher: 'UMEDT Academic Press',
          publicationYear: 2026,
          resourceKind: 'study_notes',
          format: 'pdf',
          mimeType: 'application/pdf',
          blockId: 'blk-cardio',
          subjectId: 'subj-cardiology',
          topicIds: ['tp-acs-overview'],
          downloadUrl: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
          relativePath: 'books/clinical-cardiology-manual.pdf',
          pageCount: 240,
          sizeBytes: 1850000
        }
      ]
    }
  },
  media_asset: {
    labelAr: 'وسائط ومرفقات',
    shortDesc: 'MediaAssetRecord',
    json: {
      mediaAssets: [
        {
          id: 'asset-ecg-anterior',
          mediaType: 'diagram',
          titleEn: 'Anterior STEMI ECG Strip',
          titleAr: 'مخطط احتشاء أمامي',
          fileName: 'anterior-stemi-ecg.jpg',
          relativePath: 'media/ecg/anterior-stemi-ecg.jpg',
          mimeType: 'image/jpeg',
          rawUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/Anterior_STEMI.jpg/640px-Anterior_STEMI.jpg',
          linkedEntityType: 'topic',
          linkedEntityId: 'tp-acs-overview',
          captionAr: 'تخطيط ECG يوضح ارتفاع ST في الاتصالات الصدرية',
          downloadable: true
        }
      ]
    }
  }
};

export const AiContentGuideModal: React.FC<AiContentGuideModalProps> = ({
  isOpen,
  onClose,
  onQuickImportReport,
  showToast,
  onOpenPasteModal,
  onOpenUploadModal
}) => {
  const [activeTab, setActiveTab] = useState<GuideTab>('builder');
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateKey>('topic_full');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [importStatusMsg, setImportStatusMsg] = useState<string | null>(null);

  // Interactive Prompt Builder State
  const [targetScope, setTargetScope] = useState<PromptTargetScope>('block');
  const [blockName, setBlockName] = useState<string>(
    'Cardiovascular System Block (بلوك الجهاز القلبي الوعائي)'
  );
  const [blockCode, setBlockCode] = useState<string>('BLK-CV');
  const [subjectName, setSubjectName] = useState<string>(
    'Cardiovascular Histology (علم أنسجة الجهاز القلبي الوعائي)'
  );
  const [subjectCode, setSubjectCode] = useState<string>('CV-HIST');
  const [topicName, setTopicName] = useState<string>(
    'Histological Layers of the Heart Wall (الطبقات النسيجية لجدار القلب)'
  );
  const [subjectsCount, setSubjectsCount] = useState<number>(4);
  const [topicsCount, setTopicsCount] = useState<number>(12);
  const [termsCount, setTermsCount] = useState<number>(500);
  const [sentencesCount, setSentencesCount] = useState<number>(250);
  const [questionsCount, setQuestionsCount] = useState<number>(40);
  const [topicsCoverage, setTopicsCoverage] = useState<string>(
    'Anatomy & Physiology, Pathophysiology & Etiology, Clinical Presentation & Signs, Diagnostic Workup (Labs, ECG, Imaging), Differential Diagnosis, Pharmacology & Emergency Management, Complications'
  );
  const [includeTables, setIncludeTables] = useState<boolean>(true);
  const [includeSvgDiagrams, setIncludeSvgDiagrams] = useState<boolean>(true);
  const [includeClinicalNotes, setIncludeClinicalNotes] = useState<boolean>(true);
  const [includeAllQuestionTypes, setIncludeAllQuestionTypes] = useState<boolean>(true);
  const [includeAffixesAndAbbrs, setIncludeAffixesAndAbbrs] = useState<boolean>(true);
  const [includeBooksAndMedia, setIncludeBooksAndMedia] = useState<boolean>(false);
  const [outputFormat, setOutputFormat] = useState<PromptOutputFormat>('json_file');

  const savedBlocks = useMemo(() => (isOpen ? loadMedicalBlocks() : []), [isOpen]);
  const savedSubjects = useMemo(() => (isOpen ? loadMedicalSubjects() : []), [isOpen]);

  const activeTemplateData = useMemo(
    () => JSON_TEMPLATES[selectedTemplate],
    [selectedTemplate]
  );

  const formattedTemplateJson = useMemo(
    () => JSON.stringify(activeTemplateData.json, null, 2),
    [activeTemplateData]
  );

  const toggleCoverageAxis = (axisEn: string) => {
    const current = topicsCoverage.trim();
    if (current.toLowerCase().includes(axisEn.toLowerCase())) {
      const next = current
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.toLowerCase() !== axisEn.toLowerCase())
        .join(', ');
      setTopicsCoverage(next);
    } else {
      setTopicsCoverage(current ? `${current}, ${axisEn}` : axisEn);
    }
  };

  const toSlug = (raw: string, fallback: string) => {
    const ascii = raw
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return ascii || fallback;
  };

  const generatedEnglishPrompt = useMemo(() => {
    const cleanBlockName =
      blockName.trim() || 'Cardiovascular System Block (بلوك الجهاز القلبي الوعائي)';
    const cleanBlockCode = (blockCode.trim() || 'BLK-CV').toUpperCase();
    const cleanSubjectName =
      subjectName.trim() || 'Clinical Cardiology (أمراض القلب السريرية)';
    const cleanSubjectCode = (subjectCode.trim() || `${cleanBlockCode}-101`).toUpperCase();
    const cleanTopicName =
      topicName.trim() || 'Core Clinical Topic (موضوع سريري شامل)';

    const blockSlug = toSlug(cleanBlockCode || cleanBlockName, 'med-block');
    const subjectSlug = toSlug(cleanSubjectCode || cleanSubjectName, 'med-subject');
    const topicSlug = toSlug(cleanTopicName, 'med-topic');

    const blockIdRef = `block-${blockSlug}`;
    const subjectIdRef = `subj-${subjectSlug}`;
    const topicIdRef = `tp-${topicSlug}`;

    const scopeDescription =
      targetScope === 'block'
        ? `a complete Medical Academic Block ("${cleanBlockName}", Code: ${cleanBlockCode}, ID: "${blockIdRef}") containing ${subjectsCount} Subjects (starting with "${cleanSubjectName}", Code: ${cleanSubjectCode}, ID: "${subjectIdRef}"), ${topicsCount} Comprehensive Topics (including "${cleanTopicName}"), ${termsCount} Medical Terms, ${sentencesCount} Linked Clinical Sentences, and ${questionsCount} Assessment Questions`
        : targetScope === 'subject'
          ? `a complete Medical Subject ("${cleanSubjectName}", Code: ${cleanSubjectCode}, ID: "${subjectIdRef}") strictly linked under Parent Block ("${cleanBlockName}", Code: ${cleanBlockCode}, ID: "${blockIdRef}"), containing ${topicsCount} Comprehensive Topics (including "${cleanTopicName}"), ${termsCount} Medical Terms, ${sentencesCount} Linked Clinical Sentences, and ${questionsCount} Assessment Questions`
          : `a Comprehensive Interactive Medical Topic ("${cleanTopicName}", ID: "${topicIdRef}") strictly linked under Parent Subject ("${cleanSubjectName}", Code: ${cleanSubjectCode}, ID: "${subjectIdRef}") and Parent Block ("${cleanBlockName}", Code: ${cleanBlockCode}, ID: "${blockIdRef}"), including ${termsCount} linked Medical Terms, ${sentencesCount} Clinical Sentences, and ${questionsCount} Assessment Questions`;

    const requiredBlocksList: string[] = [
      '- Bilingual rich paragraphs (`type: "paragraph"`, `text` in English + `textAr` in Arabic)'
    ];
    if (includeTables) {
      requiredBlocksList.push(
        '- Differential diagnosis & comparison tables (`type: "table"`, `titleEn`, `titleAr`, `tableHeaders`: string[], `tableRows`: string[][])'
      );
    }
    if (includeSvgDiagrams) {
      requiredBlocksList.push(
        '- Clean inline vector medical diagrams/flowcharts (`type: "diagram"`, `titleEn`, `titleAr`, `diagramSvg`: "<svg viewBox=\'0 0 420 160\' xmlns=\'http://www.w3.org/2000/svg\'>...</svg>")'
      );
    }
    if (includeClinicalNotes) {
      requiredBlocksList.push(
        '- High-yield clinical pearls & red-flag warnings (`type: "clinical_note"`, `noteSeverity`: "high-yield" | "warning" | "exam-trap" | "clinical-correlation", `titleEn`, `titleAr`, `text`, `textAr`)'
      );
    }
    if (includeBooksAndMedia) {
      requiredBlocksList.push(
        '- Reference books & external media links (`books[]`, `mediaAssets[]`, and contentBlocks with `type: "pdf_viewer" | "book_reference" | "video_link" | "audio"` using direct https:// URLs only — NEVER base64 data URIs)'
      );
    }

    const questionTypesSpec = includeAllQuestionTypes
      ? 'Use a rich mix of all 7 UMEDT question types: `single_choice`, `multiple_select`, `true_false`, `matching` (with `matchingPairs: [{id, leftEn, leftAr, rightEn, rightAr}]`), `fill_blank` (with `acceptableAnswers: string[]`), `short_answer` (with `acceptableAnswers: string[]`), and `image_based`.'
      : 'Use clinical `single_choice`, `multiple_select`, and `true_false` questions with `options: [{key: "A", textEn: "...", textAr: "..."}]` and `correctOptionKeys: ["A"]`.';

    const selectedFileExtensionLabel =
      outputFormat === 'json_file'
        ? 'JSON File (.json)'
        : outputFormat === 'high_density_text'
          ? 'Plain Text File (.txt) — High-Density Pipe-Delimited Protocol (||)'
          : outputFormat === 'markdown_file'
            ? 'Markdown File (.md) — Structured Headings & Tables'
            : 'Hybrid Package (.json + High-Density || Text)';

    const formatInstructions =
      outputFormat === 'json_file'
        ? `### OUTPUT FILE FORMAT: STRICT UMEDT JSON FILE (\`.json\`)
Deliver a single valid JSON file (\`umedt-${targetScope}-${subjectSlug}.json\`) or a single clean \`\`\`json ... \`\`\` code block with NO external commentary, strictly matching this hierarchy contract:
\`\`\`json
{
  "format": "umedt-ai-bundle-v2",
  "blocks": [
    {
      "id": "${blockIdRef}",
      "code": "${cleanBlockCode}",
      "titleEn": "${cleanBlockName}",
      "titleAr": "${cleanBlockName}",
      "descriptionEn": "...",
      "descriptionAr": "...",
      "colorAccent": "emerald",
      "order": 1
    }
  ],
  "subjects": [
    {
      "id": "${subjectIdRef}",
      "blockId": "${blockIdRef}",
      "code": "${cleanSubjectCode}",
      "titleEn": "${cleanSubjectName}",
      "titleAr": "${cleanSubjectName}",
      "descriptionEn": "...",
      "descriptionAr": "...",
      "order": 1
    }
  ],
  "topics": [
    {
      "id": "${topicIdRef}",
      "blockId": "${blockIdRef}",
      "subjectId": "${subjectIdRef}",
      "titleEn": "${cleanTopicName}",
      "titleAr": "${cleanTopicName}",
      "subtitle": "...",
      "category": "Medical",
      "readingTimeMinutes": 10,
      "sections": [
        {
          "id": "sec-1",
          "headingEn": "...",
          "headingAr": "...",
          "paragraphs": ["..."],
          "contentBlocks": [
            { "id": "cb-1", "type": "paragraph", "order": 1, "text": "...", "textAr": "..." },
            { "id": "cb-2", "type": "table", "order": 2, "titleEn": "...", "titleAr": "...", "tableHeaders": ["Feature", "Condition A", "Condition B"], "tableRows": [["...", "...", "..."]] },
            { "id": "cb-3", "type": "clinical_note", "order": 3, "noteSeverity": "high-yield", "titleEn": "Clinical Pearl", "titleAr": "لؤلؤة سريرية", "text": "...", "textAr": "..." },
            { "id": "cb-4", "type": "diagram", "order": 4, "titleEn": "...", "titleAr": "...", "diagramSvg": "<svg viewBox='0 0 420 140' xmlns='http://www.w3.org/2000/svg'>...</svg>" }
          ]
        }
      ]
    }
  ],
  "terms": [
    {
      "id": "term-${subjectSlug}-1",
      "term": "English Medical Term",
      "translation": "الترجمة الطبية بالعربية",
      "phonetic": "/.../",
      "pos": "noun",
      "category": "Medical",
      "definitionAr": "تعريف طبي سريري دقيق بالعربية...",
      "definitionEn": "Precise clinical definition in English...",
      "examples": [{ "en": "Clinical example sentence in English.", "ar": "ترجمة الجملة السريرية بالعربية." }],
      "linkedBlockIds": ["${blockIdRef}"],
      "linkedSubjectIds": ["${subjectIdRef}"],
      "linkedTopicIds": ["${topicIdRef}"]
    }
  ],
  "sentences": [
    {
      "id": "sen-${subjectSlug}-1",
      "en": "High-yield clinical sentence in English.",
      "ar": "الترجمة العربية الدقيقة للجملة السريرية.",
      "category": "Medical",
      "tags": ["${cleanSubjectCode}"]
    }
  ],
  "questions": [
    {
      "id": "q-${subjectSlug}-1",
      "type": "single_choice",
      "blockId": "${blockIdRef}",
      "subjectId": "${subjectIdRef}",
      "topicId": "${topicIdRef}",
      "difficulty": "medium",
      "questionEn": "Clinical vignette and question stem in English?",
      "questionAr": "نص السؤال السريري بالعربية؟",
      "options": [
        { "key": "A", "textEn": "Option A", "textAr": "الخيار أ" },
        { "key": "B", "textEn": "Option B", "textAr": "الخيار ب" },
        { "key": "C", "textEn": "Option C", "textAr": "الخيار ج" },
        { "key": "D", "textEn": "Option D", "textAr": "الخيار د" }
      ],
      "correctOptionKeys": ["A"],
      "explanationEn": "Detailed explanation in English.",
      "explanationAr": "الشرح العلمي التفصيلي بالعربية."
    }
  ]${
    includeAffixesAndAbbrs
      ? `,
  "customAffixes": [
    { "affix": "cardi-", "cleanKey": "cardi", "type": "root", "meaningAr": "قلب", "meaningEn": "heart", "examples": ["cardiomyopathy"] }
  ],
  "customAbbreviations": [
    { "abbr": "ACS", "expansionEn": "Acute Coronary Syndrome", "meaningAr": "المتلازمة التاجية الحادة", "specialty": "${cleanSubjectName}" }
  ]`
      : ''
  }
}
\`\`\``
        : outputFormat === 'high_density_text'
          ? `### OUTPUT FILE FORMAT: PLAIN TEXT HIGH-DENSITY FILE (\`.txt\` using \`||\` Pipe Protocol)
Deliver a plain text file (\`umedt-${targetScope}-${subjectSlug}.txt\`) or plain text code block containing one record per line using the exact UMEDT \`||\` delimiter protocol below (NO prose/commentary outside the lines):

1. Block definition (ALWAYS keep the parent Block intact):
\`BLOCK || ${cleanBlockCode} || ${cleanBlockName} || ${cleanBlockName} || Bilingual Block Description\`
2. Subject definition (linked to \`${cleanBlockCode}\`):
\`SUBJECT || ${cleanBlockCode} || ${cleanSubjectCode} || ${cleanSubjectName} || ${cleanSubjectName} || Bilingual Subject Description\`
3. Topic records (ALWAYS linked to \`${blockIdRef}\` and \`${subjectIdRef}\`, separate paragraphs with \`;;\`):
\`TOPIC || ${blockIdRef} || ${subjectIdRef} || ${cleanTopicName} || ${cleanTopicName} || Paragraph 1 in English & Arabic ;; Paragraph 2 in English & Arabic ;; High-yield clinical summary\`
4. Medical Terms (generate all ${termsCount} terms):
\`TERM || English Term || الترجمة العربية || noun || Medical || التعريف السريري بالعربية || Clinical definition in English || Clinical example sentence in English || ترجمة الجملة السريرية بالعربية\`
5. Standalone Clinical Sentences (generate all ${sentencesCount} sentences):
\`SENTENCE || Clinical English sentence || الترجمة العربية الدقيقة للجملة || Medical\`
6. Assessment Questions (generate all ${questionsCount} questions; separate options with \`;\`):
\`QUESTION || single_choice || Clinical question stem in English? || السؤال بالعربية؟ || A) Option 1; B) Option 2; C) Option 3; D) Option 4 || A || الشرح العلمي بالعربية || Detailed explanation in English\`${
              includeAffixesAndAbbrs
                ? `
7. Morphological Affixes & Abbreviations:
\`AFFIX || cardi || root || قلب || heart || cardiomyopathy; pericarditis\`
\`ABBR || ACS || Acute Coronary Syndrome || المتلازمة التاجية الحادة || ${cleanSubjectName}\``
                : ''
            }`
          : outputFormat === 'markdown_file'
            ? `### OUTPUT FILE FORMAT: STRUCTURED MARKDOWN FILE (\`.md\`)
Deliver a clean Markdown file (\`umedt-${targetScope}-${subjectSlug}.md\`) or a single \`\`\`markdown ... \`\`\` block strictly using UMEDT Markdown headings and tables so the Universal Reader imports the complete Block -> Subject -> Topic hierarchy directly:

\`\`\`markdown
# Block: ${cleanBlockName} | ${cleanBlockName}

## Subject: ${cleanSubjectName} | ${cleanSubjectName}

### Topic: ${cleanTopicName} | ${cleanTopicName}

#### Pathophysiology & Key Concepts
Rich clinical explanation paragraph in English followed by accurate Arabic explanation.

| Term | Translation | DefinitionAr | DefinitionEn | ExampleEn | ExampleAr |
| --- | --- | --- | --- | --- | --- |
| Example Term | الترجمة العربية | التعريف العلمي بالعربية | Clinical definition in English | Example sentence in English. | ترجمة المثال بالعربية. |

QUESTION || single_choice || Clinical question stem in English? || السؤال بالعربية؟ || A) Option 1; B) Option 2; C) Option 3; D) Option 4 || A || الشرح العلمي بالعربية || Detailed explanation in English
\`\`\``
            : `### OUTPUT FILE FORMAT: UNIFIED PACKAGE (\`.json\` Hierarchy + High-Density \`||\` Lexicon)
You may generate either:
- A complete downloadable \`.json\` file (\`umedt-${targetScope}-${subjectSlug}.json\`) containing \`blocks\`, \`subjects\`, \`topics\` (each with \`blockId: "${blockIdRef}"\` and \`subjectId: "${subjectIdRef}"\`), \`questions\`, \`terms\`, and \`sentences\`, OR
- A \`\`\`json ... \`\`\` block for \`blocks\`, \`subjects\`, and rich \`topics\` (with tables & SVG diagrams) followed by high-density \`TERM || ...\` and \`SENTENCE || ...\` lines for massive batches (${termsCount} terms + ${sentencesCount} sentences).
UMEDT's Universal Reader automatically ingests both seamlessly.`;

    return `You are a Senior Medical Educator, Clinical Lexicographer, and Data Architect for the UMEDT Medical Platform.
Work cleanly regardless of which AI assistant/model runs this prompt. Follow the exact parameters below with zero deviations.

Your task is to generate ${scopeDescription}.

====================================================================
1. TARGET HIERARCHY, NAMES & FILE SPECIFICATION
====================================================================
- Target Level / Scope: ${targetScope.toUpperCase()}
- Block Name: ${cleanBlockName}
- Block Code & ID: ${cleanBlockCode} (use exact \`blockId: "${blockIdRef}"\`)
- Subject Name: ${cleanSubjectName}
- Subject Code & ID: ${cleanSubjectCode} (use exact \`subjectId: "${subjectIdRef}"\` with \`blockId: "${blockIdRef}"\`)
- Focus / Sample Topic Name: ${cleanTopicName} (start topic ID with \`"${topicIdRef}"\`, and ALWAYS set both \`"blockId": "${blockIdRef}"\` and \`"subjectId": "${subjectIdRef}"\`)
- Requested Output File Type: ${selectedFileExtensionLabel}
${targetScope === 'block' ? `- Number of Subjects in Block: ${subjectsCount} Subjects\n` : ''}${
      targetScope === 'block' || targetScope === 'subject'
        ? `- Number of Topics to Generate: ${topicsCount} Comprehensive Topics\n`
        : `- Number of Topics to Generate: 1 Deep Comprehensive Topic focused strictly on "${cleanTopicName}"\n`
    }- Number of Medical Terms: ${termsCount} Bilingual Terms (English + Arabic translation + definitions + clinical examples)
- Number of Clinical Sentences: ${sentencesCount} Bilingual Sentences (English + Arabic)
- Number of Clinical Assessment Questions: ${questionsCount} Questions

====================================================================
2. REQUIRED TOPIC AXES & CONTENT STRUCTURE
====================================================================
Cover these scientific & clinical axes thoroughly:
${topicsCoverage || 'Anatomy, Physiology, Pathophysiology, Clinical Presentation, Diagnostic Workup, Differential Diagnosis, Pharmacology & Management'}

Inside each topic's \`sections[].contentBlocks\`, include:
${requiredBlocksList.join('\n')}

====================================================================
3. ASSESSMENT & QUESTION BANK REQUIREMENTS
====================================================================
- ${questionTypesSpec}
- Every question MUST include both English (\`questionEn\`, \`explanationEn\`) and Arabic (\`questionAr\`, \`explanationAr\`), valid \`options\`, and accurate \`correctOptionKeys\`, linked via \`"blockId": "${blockIdRef}"\`, \`"subjectId": "${subjectIdRef}"\`, and \`"topicId": "${topicIdRef}"\`.

${formatInstructions}

====================================================================
4. CRITICAL EXECUTION RULES (UNIVERSAL — WORKS ON ANY AI MODEL)
====================================================================
1. NEVER write placeholders such as "// ... repeat for remaining terms" or "... (omitted for brevity)". Every single record must be real, clinically accurate, and complete.
2. NEVER omit \`blockId\` or \`subjectId\` on Topics or Questions. Every Topic under "${cleanSubjectName}" must carry BOTH \`"blockId": "${blockIdRef}"\` and \`"subjectId": "${subjectIdRef}"\`.
3. Ensure 100% bilingual accuracy: precise international English medical terminology paired with natural, accurate Modern Standard Arabic medical terminology.
4. If the requested file size exceeds a single turn limit, generate a downloadable file if supported by your environment OR output Part 1 at maximum capacity ending with "[READY FOR PART 2 — SEND 'CONTINUE']" so the user can download/paste cleanly into UMEDT.`;
  }, [
    targetScope,
    blockName,
    blockCode,
    subjectName,
    subjectCode,
    topicName,
    subjectsCount,
    topicsCount,
    termsCount,
    sentencesCount,
    questionsCount,
    topicsCoverage,
    includeTables,
    includeSvgDiagrams,
    includeClinicalNotes,
    includeAllQuestionTypes,
    includeAffixesAndAbbrs,
    includeBooksAndMedia,
    outputFormat
  ]);

  const handleCopy = (text: string, key: string, msg = 'تم النسخ') => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        void navigator.clipboard.writeText(text);
      } else {
        const el = document.createElement('textarea');
        el.value = text;
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      }
      setCopiedKey(key);
      showToast?.(msg, 'info');
      setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 1800);
    } catch {
      showToast?.('تعذر النسخ التلقائي', 'info');
    }
  };

  const handleDownloadPromptTxt = () => {
    try {
      const blob = new Blob([generatedEnglishPrompt], {
        type: 'text/plain;charset=utf-8'
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const safeSlug = toSlug(subjectCode || blockCode || 'umedt-prompt', 'umedt-prompt');
      a.href = url;
      a.download = `UMEDT_AI_Prompt_${targetScope}_${safeSlug}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast?.('تم تنزيل ملف البرومبت باللغة الإنجليزية', 'success');
    } catch {
      showToast?.('تعذر تنزيل ملف البرومبت', 'info');
    }
  };

  const handleQuickImportTemplate = () => {
    const report = importUniversalAiOrLocalContent({
      rawText: formattedTemplateJson,
      sourceLabel: `قالب ${activeTemplateData.labelAr}`
    });
    if (report.success) {
      setImportStatusMsg(`تم الاستيراد: ${report.summaryText}`);
      onQuickImportReport?.(report);
      showToast?.(`تم الاستيراد بنجاح (${report.summaryText})`, 'success');
    } else {
      setImportStatusMsg(report.errors[0] || 'تعذر استيراد القالب');
      showToast?.(report.errors[0] || 'تعذر الاستيراد', 'info');
    }
  };

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-2.5 sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl max-h-[90dvh] flex flex-col rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="px-4 sm:px-6 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white truncate">
                مولّد برومبت الذكاء الاصطناعي ودليل التوليد
              </h2>
              <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 truncate">
                إعداد البرومبت الإنجليزي المخصص · متوافق مع أي نموذج ذكاء اصطناعي · UMEDT-DATA
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="min-h-[44px] min-w-[44px] rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="px-4 sm:px-6 pt-3 shrink-0">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 rounded-2xl bg-slate-100 dark:bg-slate-800">
            {(
              [
                { id: 'builder' as GuideTab, label: 'إعداد البرومبت المخصص', icon: Sliders },
                { id: 'prompts' as GuideTab, label: 'برومبتات سريعة', icon: Bot },
                { id: 'templates' as GuideTab, label: 'قوالب JSON', icon: FileJson },
                { id: 'rules' as GuideTab, label: 'قواعد التوافق', icon: ShieldCheck }
              ] as const
            ).map((t) => {
              const IconComp = t.icon;
              const active = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  className={`min-h-[42px] px-2.5 py-1.5 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-300 shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <IconComp className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
          {importStatusMsg && (
            <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-xs font-bold text-emerald-800 dark:text-emerald-200 flex items-center justify-between gap-2">
              <span>{importStatusMsg}</span>
              <button
                type="button"
                onClick={() => setImportStatusMsg(null)}
                className="min-h-[32px] min-w-[32px] flex items-center justify-center text-emerald-600 dark:text-emerald-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* TAB 1: INTERACTIVE PROMPT CONFIGURATOR & ENGLISH PROMPT GENERATOR */}
          {activeTab === 'builder' && (
            <div className="space-y-4">
              {/* Step 1: 3 Strict Target Scope Options (Block / Subject / Topic) */}
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3.5 sm:p-4 space-y-3.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">
                    1. اختر مستوى المحتوى المطلوب توليده
                  </h3>
                  <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                    صالح لأي نموذج ذكاء اصطناعي
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      {
                        id: 'block' as PromptTargetScope,
                        title: 'بلوك',
                        sub: 'Block + مواد + مواضيع + مصطلحات',
                        icon: Layers
                      },
                      {
                        id: 'subject' as PromptTargetScope,
                        title: 'مادة',
                        sub: 'Subject + مواضيع + مصطلحات',
                        icon: BookOpen
                      },
                      {
                        id: 'topic' as PromptTargetScope,
                        title: 'موضوع',
                        sub: 'Topic + شرح + جداول + أسئلة',
                        icon: FileText
                      }
                    ] as const
                  ).map((item) => {
                    const IconComp = item.icon;
                    const active = targetScope === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setTargetScope(item.id)}
                        className={`p-3 rounded-2xl border text-right transition-all flex flex-col justify-between gap-1 ${
                          active
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 hover:border-emerald-500/40'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs sm:text-sm font-extrabold">{item.title}</span>
                          <IconComp className={`w-4 h-4 shrink-0 ${active ? 'text-white' : 'text-emerald-500'}`} />
                        </div>
                        <span
                          className={`text-[10px] font-bold leading-snug ${
                            active ? 'text-emerald-100' : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {item.sub}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Step 2: Block Name/Code, Subject Name/Code, Topic Name (+ Optional Presets from Saved Library) */}
                <div className="space-y-2.5 pt-1">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-[11px] font-extrabold text-slate-700 dark:text-slate-300">
                      2. أسماء التسلسل الهرمي (تُدمج بالكامل داخل البرومبت)
                    </span>
                    {savedBlocks.length > 0 && (
                      <select
                        aria-label="تعبئة سريعة من بلوك محفوظ"
                        defaultValue=""
                        onChange={(e) => {
                          const b = savedBlocks.find((item) => item.id === e.target.value);
                          if (!b) return;
                          setBlockName(b.titleEn || b.titleAr);
                          setBlockCode(b.code || 'BLK-MED');
                          const firstSub = savedSubjects.find((s) => s.blockId === b.id);
                          if (firstSub) {
                            setSubjectName(firstSub.titleEn || firstSub.titleAr);
                            setSubjectCode(firstSub.code || 'SUB-101');
                          }
                        }}
                        className="min-h-[34px] px-2.5 py-1 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-700 dark:text-slate-200"
                      >
                        <option value="">تعبئة سريعة من بلوك محفوظ...</option>
                        {savedBlocks.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.code} — {b.titleAr || b.titleEn}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* Block + Code */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-extrabold text-slate-700 dark:text-slate-300 mb-1">
                        اسم البلوك *
                      </label>
                      <input
                        type="text"
                        value={blockName}
                        onChange={(e) => setBlockName(e.target.value)}
                        placeholder="مثال: Cardiovascular System Block"
                        className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-extrabold text-slate-700 dark:text-slate-300 mb-1">
                        رمز البلوك
                      </label>
                      <input
                        type="text"
                        dir="ltr"
                        value={blockCode}
                        onChange={(e) => setBlockCode(e.target.value)}
                        placeholder="BLK-CV"
                        className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-mono font-bold text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>

                  {/* Subject + Code */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="sm:col-span-2">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <label className="block text-[11px] font-extrabold text-slate-700 dark:text-slate-300">
                          اسم المادة {targetScope === 'block' ? '(المادة الرئيسية / النموذجية)' : '*'}
                        </label>
                        {savedSubjects.length > 0 && (
                          <select
                            aria-label="تعبئة سريعة من مادة محفوظة"
                            defaultValue=""
                            onChange={(e) => {
                              const s = savedSubjects.find((item) => item.id === e.target.value);
                              if (!s) return;
                              setSubjectName(s.titleEn || s.titleAr);
                              setSubjectCode(s.code || 'SUB-101');
                              const parentBlk = savedBlocks.find((b) => b.id === s.blockId);
                              if (parentBlk) {
                                setBlockName(parentBlk.titleEn || parentBlk.titleAr);
                                setBlockCode(parentBlk.code || 'BLK-MED');
                              }
                            }}
                            className="px-2 py-0.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[10px] font-bold text-slate-600 dark:text-slate-300"
                          >
                            <option value="">اختيار مادة محفوظة...</option>
                            {savedSubjects.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.code} — {s.titleAr || s.titleEn}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                      <input
                        type="text"
                        value={subjectName}
                        onChange={(e) => setSubjectName(e.target.value)}
                        placeholder="مثال: Cardiovascular Histology"
                        className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-extrabold text-slate-700 dark:text-slate-300 mb-1">
                        رمز المادة
                      </label>
                      <input
                        type="text"
                        dir="ltr"
                        value={subjectCode}
                        onChange={(e) => setSubjectCode(e.target.value)}
                        placeholder="CV-HIST"
                        className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-mono font-bold text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>

                  {/* Topic Name */}
                  <div>
                    <label className="block text-[11px] font-extrabold text-slate-700 dark:text-slate-300 mb-1">
                      اسم الموضوع {targetScope === 'topic' ? '*' : '(موضوع التركيز / النموذجي)'}
                    </label>
                    <input
                      type="text"
                      value={topicName}
                      onChange={(e) => setTopicName(e.target.value)}
                      placeholder="مثال: Histological Layers of the Heart Wall"
                      className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                {/* Step 3: Quantities */}
                <div className="pt-1 space-y-2.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <label className="text-[11px] font-extrabold text-slate-700 dark:text-slate-300">
                      3. الكميات المطلوبة (يدعم المئات وآلاف المصطلحات والجمل والمواضيع)
                    </label>
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-[10px] font-bold text-slate-500">عدد المصطلحات:</span>
                      {[100, 500, 1000, 2500, 5000].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => {
                            setTermsCount(preset);
                            setSentencesCount(Math.max(50, Math.round(preset * 0.5)));
                          }}
                          className={`px-2 py-0.5 rounded-lg text-[10px] font-extrabold border transition-colors ${
                            termsCount === preset
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {preset.toLocaleString('en-US')}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                        عدد المصطلحات
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={20000}
                        value={termsCount}
                        onChange={(e) => setTermsCount(Math.max(1, Number(e.target.value) || 100))}
                        className="w-full min-h-[40px] px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-extrabold text-slate-900 dark:text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                        عدد الجمل السريرية
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={20000}
                        value={sentencesCount}
                        onChange={(e) => setSentencesCount(Math.max(0, Number(e.target.value) || 0))}
                        className="w-full min-h-[40px] px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-extrabold text-slate-900 dark:text-white"
                      />
                    </div>

                    {(targetScope === 'block' || targetScope === 'subject') && (
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                          عدد المواضيع
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={500}
                          value={topicsCount}
                          onChange={(e) => setTopicsCount(Math.max(1, Number(e.target.value) || 1))}
                          className="w-full min-h-[40px] px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-extrabold text-slate-900 dark:text-white"
                        />
                      </div>
                    )}

                    {targetScope === 'block' && (
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                          عدد المواد بالبلوك
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={50}
                          value={subjectsCount}
                          onChange={(e) => setSubjectsCount(Math.max(1, Number(e.target.value) || 1))}
                          className="w-full min-h-[40px] px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-extrabold text-slate-900 dark:text-white"
                        />
                      </div>
                    )}

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                        عدد الأسئلة الاختبارية
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={2000}
                        value={questionsCount}
                        onChange={(e) => setQuestionsCount(Math.max(0, Number(e.target.value) || 0))}
                        className="w-full min-h-[40px] px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-extrabold text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>
                </div>

                {/* Step 4: Clinical Coverage Axes & Components */}
                <div className="pt-1 space-y-2">
                  <label className="block text-[11px] font-extrabold text-slate-700 dark:text-slate-300">
                    4. المحاور العلمية ومحتويات الموضوع
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {COVERAGE_AXIS_PRESETS.map((axis) => {
                      const isSelected = topicsCoverage
                        .toLowerCase()
                        .includes(axis.en.toLowerCase());
                      return (
                        <button
                          key={axis.en}
                          type="button"
                          onClick={() => toggleCoverageAxis(axis.en)}
                          className={`px-2.5 py-1 rounded-xl text-[11px] font-bold border transition-colors ${
                            isSelected
                              ? 'bg-emerald-500/15 border-emerald-500 text-emerald-800 dark:text-emerald-200'
                              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          {isSelected ? '✓ ' : '+ '}
                          {axis.ar}
                        </button>
                      );
                    })}
                  </div>
                  <textarea
                    rows={2}
                    value={topicsCoverage}
                    onChange={(e) => setTopicsCoverage(e.target.value)}
                    placeholder="اكتب المحاور الفرعية أو العناوين المطلوب تغطيتها في المواضيع..."
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-900 dark:text-white"
                  />

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                    {[
                      {
                        label: 'جداول مقارنة تشخيصية',
                        checked: includeTables,
                        onChange: setIncludeTables
                      },
                      {
                        label: 'رسومات ومخططات SVG',
                        checked: includeSvgDiagrams,
                        onChange: setIncludeSvgDiagrams
                      },
                      {
                        label: 'لآلئ وتنبيهات سريرية',
                        checked: includeClinicalNotes,
                        onChange: setIncludeClinicalNotes
                      },
                      {
                        label: 'جميع أنماط الأسئلة الـ 7',
                        checked: includeAllQuestionTypes,
                        onChange: setIncludeAllQuestionTypes
                      },
                      {
                        label: 'الجذور والاختصارات الطبية',
                        checked: includeAffixesAndAbbrs,
                        onChange: setIncludeAffixesAndAbbrs
                      },
                      {
                        label: 'مراجع كتب وروابط وسائط',
                        checked: includeBooksAndMedia,
                        onChange: setIncludeBooksAndMedia
                      }
                    ].map((opt) => (
                      <label
                        key={opt.label}
                        className="flex items-center gap-2 p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-800 dark:text-slate-200 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={opt.checked}
                          onChange={(e) => opt.onChange(e.target.checked)}
                          className="rounded text-emerald-600 focus:ring-emerald-500"
                        />
                        <span className="truncate">{opt.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Step 5: Output File Type */}
                <div className="pt-1 space-y-1.5">
                  <label className="block text-[11px] font-extrabold text-slate-700 dark:text-slate-300">
                    5. نوع الملف المطلوب إخراجه من الذكاء الاصطناعي
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                      {
                        id: 'json_file' as PromptOutputFormat,
                        title: 'ملف JSON قياسي (.json)',
                        desc: 'بنية متوافقة بالكامل مع مستودع UMEDT-DATA واستيراد التطبيق'
                      },
                      {
                        id: 'high_density_text' as PromptOutputFormat,
                        title: 'ملف نصي عالي الكثافة (.txt / ||)',
                        desc: 'صيغة نصية مضغوطة لتوليد آلاف المصطلحات والجمل والمواضيع في دفعة واحدة'
                      },
                      {
                        id: 'markdown_file' as PromptOutputFormat,
                        title: 'ملف Markdown منظم (.md)',
                        desc: 'عناوين # Block / ## Subject / ### Topic وجداول منظمة'
                      },
                      {
                        id: 'both' as PromptOutputFormat,
                        title: 'حزمة شاملة (.json + نص عالي الكثافة)',
                        desc: 'مرن لأي نموذج: هيكل JSON أو دفق نصي للكميات الضخمة'
                      }
                    ].map((fmt) => {
                      const active = outputFormat === fmt.id;
                      return (
                        <button
                          key={fmt.id}
                          type="button"
                          onClick={() => setOutputFormat(fmt.id)}
                          className={`p-2.5 rounded-xl border text-right transition-colors ${
                            active
                              ? 'bg-emerald-500/15 border-emerald-500 text-emerald-900 dark:text-emerald-200'
                              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <div className="text-xs font-extrabold">{fmt.title}</div>
                          <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mt-0.5">
                            {fmt.desc}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Generated English Prompt Box */}
              <div className="rounded-2xl border-2 border-emerald-500/40 bg-slate-950 text-slate-100 p-3.5 sm:p-4 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-extrabold">
                      READY-TO-COPY ENGLISH PROMPT
                    </span>
                    <h4 className="text-xs sm:text-sm font-extrabold text-white mt-1">
                      البرومبت الإنجليزي الموحّد (يعمل مع أي نموذج ذكاء اصطناعي)
                    </h4>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() =>
                        handleCopy(
                          generatedEnglishPrompt,
                          'custom-en-prompt',
                          'تم نسخ البرومبت الإنجليزي المخصص بنجاح'
                        )
                      }
                      className="min-h-[42px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-sm"
                    >
                      {copiedKey === 'custom-en-prompt' ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                      <span>
                        {copiedKey === 'custom-en-prompt'
                          ? 'تم نسخ البرومبت!'
                          : 'نسخ البرومبت الإنجليزي'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={handleDownloadPromptTxt}
                      className="min-h-[42px] px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-extrabold flex items-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>تنزيل .txt</span>
                    </button>
                  </div>
                </div>

                <pre
                  dir="ltr"
                  className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-[11px] font-mono leading-relaxed whitespace-pre-wrap text-left text-emerald-100 max-h-72 overflow-y-auto select-all"
                >
                  {generatedEnglishPrompt}
                </pre>

                {(onOpenPasteModal || onOpenUploadModal) && (
                  <div className="pt-1 flex items-center justify-between gap-2 flex-wrap border-t border-slate-800">
                    <span className="text-[11px] font-bold text-slate-400">
                      بعد توليد البيانات أو الملف من أي نموذج ذكاء اصطناعي:
                    </span>
                    <div className="flex items-center gap-2">
                      {onOpenPasteModal && (
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onOpenPasteModal();
                          }}
                          className="min-h-[38px] px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-extrabold"
                        >
                          فتح نافذة لصق النص/الكود
                        </button>
                      )}
                      {onOpenUploadModal && (
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onOpenUploadModal();
                          }}
                          className="min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-extrabold"
                        >
                          فتح نافذة رفع ملف
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: UNIVERSAL AI SYSTEM PROMPTS */}
          {activeTab === 'prompts' && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3.5 sm:p-4 space-y-2.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="min-w-0">
                    <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">
                      1. تعليمات النظام العامة (لأي نموذج ذكاء اصطناعي)
                    </h3>
                    <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                      ضعه في التعليمات المخصصة للحصول على ملفات ونصوص متوافقة تلقائياً مع التطبيق والمستودع
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      handleCopy(
                        SYSTEM_PROMPT_UNIVERSAL_AI,
                        'sys-prompt',
                        'تم نسخ تعليمات النظام'
                      )
                    }
                    className="min-h-[44px] px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    {copiedKey === 'sys-prompt' ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                    <span>{copiedKey === 'sys-prompt' ? 'تم النسخ' : 'نسخ التعليمات'}</span>
                  </button>
                </div>

                <pre
                  dir="rtl"
                  className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] font-mono leading-relaxed whitespace-pre-wrap text-slate-700 dark:text-slate-200 max-h-56 overflow-y-auto"
                >
                  {SYSTEM_PROMPT_UNIVERSAL_AI}
                </pre>
              </div>

              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3.5 sm:p-4 space-y-2.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="min-w-0">
                    <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">
                      2. برومبت سريع لتوليد محاضرة واختبار كامل
                    </h3>
                    <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                      انسخه وألصق اسم المحاضرة أو ملف PDF ليخرج حزمة شاملة
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      handleCopy(
                        LECTURE_AND_EXAM_PROMPT,
                        'lecture-prompt',
                        'تم نسخ البرومبت'
                      )
                    }
                    className="min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-950 text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    {copiedKey === 'lecture-prompt' ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                    <span>
                      {copiedKey === 'lecture-prompt' ? 'تم النسخ' : 'نسخ البرومبت'}
                    </span>
                  </button>
                </div>

                <pre
                  dir="ltr"
                  className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] font-mono leading-relaxed whitespace-pre-wrap text-left text-slate-700 dark:text-slate-200 max-h-60 overflow-y-auto"
                >
                  {LECTURE_AND_EXAM_PROMPT}
                </pre>
              </div>
            </div>
          )}

          {/* TAB 3: JSON TEMPLATES FOR ALL CONTENT TYPES */}
          {activeTab === 'templates' && (
            <div className="space-y-3.5">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {(Object.entries(JSON_TEMPLATES) as Array<[TemplateKey, typeof JSON_TEMPLATES[TemplateKey]]>).map(
                  ([key, meta]) => {
                    const active = selectedTemplate === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setSelectedTemplate(key)}
                        className={`min-h-[48px] px-3 py-2 rounded-2xl border text-right transition-colors flex flex-col justify-center ${
                          active
                            ? 'bg-emerald-500/10 border-emerald-500 text-emerald-800 dark:text-emerald-200'
                            : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200'
                        }`}
                      >
                        <span className="text-xs font-extrabold truncate">{meta.labelAr}</span>
                        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 truncate">
                          {meta.shortDesc}
                        </span>
                      </button>
                    );
                  }
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3.5 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-extrabold text-slate-900 dark:text-white">
                    {activeTemplateData.labelAr} ·{' '}
                    <span className="font-mono text-slate-500 dark:text-slate-400">
                      {activeTemplateData.shortDesc}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        handleCopy(
                          formattedTemplateJson,
                          `tpl-${selectedTemplate}`,
                          'تم نسخ القالب'
                        )
                      }
                      className="min-h-[44px] px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 whitespace-nowrap shrink-0"
                    >
                      {copiedKey === `tpl-${selectedTemplate}` ? (
                        <Check className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                      <span>نسخ القالب</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleQuickImportTemplate}
                      className="min-h-[44px] px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap shrink-0"
                    >
                      <Zap className="w-4 h-4" />
                      <span>استيراد تجريبي</span>
                    </button>
                  </div>
                </div>

                <pre
                  dir="ltr"
                  className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] font-mono leading-relaxed overflow-x-auto max-h-72 overflow-y-auto text-left text-slate-800 dark:text-slate-200"
                >
                  {formattedTemplateJson}
                </pre>
              </div>
            </div>
          )}

          {/* TAB 4: UMEDT-DATA CONTRACT & COMPATIBILITY RULES */}
          {activeTab === 'rules' && (
            <div className="space-y-3 text-xs">
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                <h3 className="font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>الصيغ المدعومة في القارئ الشامل (Universal Data Reader)</span>
                </h3>
                <ul className="space-y-1.5 text-slate-600 dark:text-slate-300 leading-relaxed list-disc pr-4">
                  <li>
                    <strong>ملفات وأكواد JSON و JSONL:</strong> يقرأ كائنات UMEDT-DATA القياسية، أو الكيانات المتداخلة (بلوك وبداخله مواد ومواضيع ومصطلحات)، أو النسخ الاحتياطية السابقة، ويصلح الفواصل الزائدة تلقائياً.
                  </li>
                  <li>
                    <strong>النصوص عالية الكثافة (<code dir="ltr" className="font-mono">||</code>):</strong> يدعم استيراد آلاف السجلات دفعة واحدة عبر الأسطر القياسية (<code dir="ltr" className="font-mono">BLOCK || ...</code>، <code dir="ltr" className="font-mono">SUBJECT || ...</code>، <code dir="ltr" className="font-mono">TOPIC || ...</code>، <code dir="ltr" className="font-mono">TERM || ...</code>، <code dir="ltr" className="font-mono">SENTENCE || ...</code>، <code dir="ltr" className="font-mono">QUESTION || ...</code>).
                  </li>
                  <li>
                    <strong>جداول ومستندات Markdown و CSV/TSV:</strong> يقرأ عناوين Markdown (<code dir="ltr" className="font-mono"># Block:</code> / <code dir="ltr" className="font-mono">## Subject:</code> / <code dir="ltr" className="font-mono">### Topic:</code>) وجداول Markdown (<code dir="ltr" className="font-mono">| Term | Translation | ... |</code>) وملفات الأرشيف <code dir="ltr" className="font-mono">.zip</code> و <code dir="ltr" className="font-mono">.umedpack</code>.
                  </li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
