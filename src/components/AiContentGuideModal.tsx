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
  ShieldCheck
} from 'lucide-react';
import {
  importUniversalAiOrLocalContent,
  UniversalImportReport
} from '../services/aiUniversalImportService';

interface AiContentGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onQuickImportReport?: (report: UniversalImportReport) => void;
  showToast?: (msg: string, type?: string) => void;
}

type GuideTab = 'prompts' | 'templates' | 'rules';

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

const SYSTEM_PROMPT_CHATGPT_GEMINI = `أنت خبير أكاديمي طبي ومهندس بيانات تعليمية لمنصة UMEDT (القاموس الطبي والمنصة التعليمية السريرية).
مهمتك: توليد محتوى طبي دقيق ومنظّم بصيغة JSON صالحة للاستيراد المباشر داخل تطبيق UMEDT أو للنشر في مستودع UMEDT-DATA.

قواعد الإخراج الإلزامية (Strict Output Contract — UMEDT-DATA v2):
1. أخرج كائن JSON صالحاً فقط (أو داخل كتلة \`\`\`json ... \`\`\`) دون نصوص إضافية خارج الكلة.
2. لا تضع أي روابط base64 ضخمة (data:...)؛ للصور وملفات PDF والصوت والفيديو استخدم downloadUrl / rawUrl / externalUrl بصيغة https:// مباشرة أو اترك mediaIdbKey للرفع اليدوي.
3. استخدم معرفات ثابتة واضحة بالصيغة: blk-..., subj-..., tp-..., term-..., sent-..., q-..., exam-..., book-..., asset-... لكي يطابقها التطبيق ويمنع التكرار عبر SHA-256.
4. يجب أن يتضمن كل موضوع أو مصطلح النصوص الإنجليزية السريرية (titleEn / term / definitionEn) مع الترجمة والشرح العربي الدقيق (titleAr / translation / definitionAr).
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
                },
                {
                  id: 'cb-acs-5',
                  type: 'image',
                  order: 5,
                  captionEn: '12-Lead ECG showing anterior ST elevation',
                  captionAr: 'تخطيط قلب يظهر ارتفاع قطعة ST الأمامي',
                  externalUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/Anterior_STEMI.jpg/640px-Anterior_STEMI.jpg'
                },
                {
                  id: 'cb-acs-6',
                  type: 'pdf_viewer',
                  order: 6,
                  titleEn: 'ESC ACS Clinical Guidelines',
                  titleAr: 'دليل الجمعية الأوروبية للقلب PDF',
                  externalUrl: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
                  mediaFileName: 'ESC_ACS_Summary.pdf'
                },
                {
                  id: 'cb-acs-7',
                  type: 'book_reference',
                  order: 7,
                  bookId: 'book-cardio-manual',
                  titleEn: 'Cardiology Pocket Reference — Ch. 4',
                  titleAr: 'المرجع السريري للقلب — الفصل الرابع',
                  text: 'pp. 88-104: Emergency Management of Acute Coronary Syndromes'
                },
                {
                  id: 'cb-acs-8',
                  type: 'exam_link',
                  order: 8,
                  examId: 'exam-acs-quiz',
                  titleEn: 'ACS Clinical Mastery Quiz',
                  titleAr: 'اختبار تفاعلي في المتلازمة التاجية'
                },
                {
                  id: 'cb-acs-9',
                  type: 'audio',
                  order: 9,
                  titleEn: 'Auscultation S4 Gallop Note',
                  titleAr: 'ملخص صوتي للإصغاء القلبي',
                  externalUrl: 'https://example.org/media/s4-auscultation.mp3',
                  mediaFileName: 's4-auscultation.mp3'
                },
                {
                  id: 'cb-acs-10',
                  type: 'video_link',
                  order: 10,
                  titleEn: 'ECG Interpretation in STEMI',
                  titleAr: 'شرح فيديو لقراءة تخطيط الاحتشاء',
                  externalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
                },
                {
                  id: 'cb-acs-11',
                  type: 'question',
                  order: 11,
                  inlineQuestion: {
                    questionEn: 'Which cardiac biomarker is most specific for myocardial necrosis?',
                    options: [
                      { key: 'A', textEn: 'Cardiac Troponin I/T' },
                      { key: 'B', textEn: 'LDH' },
                      { key: 'C', textEn: 'AST' }
                    ],
                    correctOptionKeys: ['A'],
                    explanationEn: 'Cardiac troponin I and T have the highest myocardial tissue specificity.'
                  }
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
          fullEn: 'Non-ST-Segment Elevation Myocardial Infarction',
          meaningAr: 'احتشاء عضلة القلب دون ارتفاع قطعة ST',
          category: 'Medical'
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
        },
        {
          id: 'q-acs-4',
          type: 'matching',
          topicId: 'tp-acs-overview',
          difficulty: 'hard',
          questionEn: 'Match each coronary territory with the localized ECG leads:',
          matchingPairs: [
            { id: 'mp-1', leftEn: 'LAD (Anterior)', rightEn: 'V1-V4' },
            { id: 'mp-2', leftEn: 'RCA (Inferior)', rightEn: 'II, III, aVF' }
          ],
          options: [],
          correctOptionKeys: [],
          explanationEn: 'ECG lead territories localize the culprit coronary artery.'
        },
        {
          id: 'q-acs-5',
          type: 'fill_blank',
          topicId: 'tp-acs-overview',
          difficulty: 'easy',
          questionEn: 'Cardiac _____ I/T is the preferred biomarker for diagnosing acute MI.',
          acceptableAnswers: ['Troponin', 'troponin'],
          options: [],
          correctOptionKeys: [],
          explanationEn: 'Troponin I and T are specific markers of myocardial cell injury.'
        },
        {
          id: 'q-acs-6',
          type: 'image_based',
          topicId: 'tp-acs-overview',
          difficulty: 'medium',
          imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/Anterior_STEMI.jpg/640px-Anterior_STEMI.jpg',
          questionEn: 'Identify the primary ECG abnormality shown in the tracing:',
          options: [
            { key: 'A', textEn: 'Anterior ST-segment elevation' },
            { key: 'B', textEn: 'Normal sinus rhythm' }
          ],
          correctOptionKeys: ['A'],
          explanationEn: 'Convex ST-segment elevation across precordial leads indicates anterior STEMI.'
        },
        {
          id: 'q-acs-7',
          type: 'short_answer',
          topicId: 'tp-acs-overview',
          difficulty: 'easy',
          questionEn: 'Name the acronym for ST-elevation myocardial infarction:',
          acceptableAnswers: ['STEMI', 'ST elevation myocardial infarction'],
          options: [],
          correctOptionKeys: ['STEMI'],
          explanationEn: 'STEMI stands for ST-Elevation Myocardial Infarction.'
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
          questionIds: ['q-acs-1', 'q-acs-2', 'q-acs-3', 'q-acs-4']
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
          sizeBytes: 1850000,
          chapters: [
            { id: 'ch-1', titleEn: 'Acute Coronary Syndrome', titleAr: 'المتلازمة التاجية الحادة', pageStart: 88, pageEnd: 104 }
          ]
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
  showToast
}) => {
  const [activeTab, setActiveTab] = useState<GuideTab>('prompts');
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateKey>('topic_full');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [importStatusMsg, setImportStatusMsg] = useState<string | null>(null);

  const activeTemplateData = useMemo(
    () => JSON_TEMPLATES[selectedTemplate],
    [selectedTemplate]
  );

  const formattedTemplateJson = useMemo(
    () => JSON.stringify(activeTemplateData.json, null, 2),
    [activeTemplateData]
  );

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
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl max-h-[88dvh] flex flex-col rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="px-4 sm:px-6 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white truncate">
                دليل الذكاء الاصطناعي
              </h2>
              <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 truncate">
                ChatGPT · Gemini · عقود UMEDT-DATA
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
          <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-slate-100 dark:bg-slate-800">
            {(
              [
                { id: 'prompts' as GuideTab, label: 'ChatGPT & Gemini', icon: Bot },
                { id: 'templates' as GuideTab, label: 'قوالب JSON', icon: FileJson },
                { id: 'rules' as GuideTab, label: 'القواعد والتوافق', icon: ShieldCheck }
              ] as const
            ).map((t) => {
              const IconComp = t.icon;
              const active = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  className={`min-h-[44px] px-2.5 py-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
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

          {/* TAB 1: CHATGPT & GEMINI PROMPTS */}
          {activeTab === 'prompts' && (
            <div className="space-y-4">
              {/* System Instructions Block */}
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3.5 sm:p-4 space-y-2.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="min-w-0">
                    <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">
                      1. تعليمات النظام (Custom GPT / Gemini Gem)
                    </h3>
                    <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                      ضعه في إعدادات التعليمات المخصصة للحصول على JSON متوافق تلقائياً
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      handleCopy(
                        SYSTEM_PROMPT_CHATGPT_GEMINI,
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
                  {SYSTEM_PROMPT_CHATGPT_GEMINI}
                </pre>
              </div>

              {/* Prompt for Generating Full Lecture / Pack */}
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3.5 sm:p-4 space-y-2.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="min-w-0">
                    <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">
                      2. برومبت توليد محاضرة واختبار كامل
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

          {/* TAB 2: JSON TEMPLATES FOR ALL CONTENT TYPES */}
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
                      <span>استيراد فوري</span>
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

          {/* TAB 3: UMEDT-DATA CONTRACT & COMPATIBILITY RULES */}
          {activeTab === 'rules' && (
            <div className="space-y-3 text-xs">
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                <h3 className="font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>بنية مستودع UMEDT-DATA الرسمية</span>
                </h3>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                  يقرأ التطبيق تلقائياً الفهرس{' '}
                  <code dir="ltr" className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    data/catalog.json
                  </code>{' '}
                  وملفات المجموعات داخل{' '}
                  <code dir="ltr" className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    data/master/*.json
                  </code>
                  ، مع تخطي أي مجموعة تطابق بصمة{' '}
                  <code dir="ltr" className="font-mono font-bold">sha256</code> المحفوظة.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1 font-mono text-[11px]" dir="ltr">
                  {[
                    'blocks.json',
                    'subjects.json',
                    'topics.json',
                    'terms.json',
                    'sentences.json',
                    'custom-affixes.json',
                    'custom-abbreviations.json',
                    'books.json',
                    'questions.json',
                    'exams.json',
                    'media-index.json'
                  ].map((f) => (
                    <div
                      key={f}
                      className="px-2.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 font-bold"
                    >
                      data/master/{f}
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                <h3 className="font-extrabold text-slate-900 dark:text-white">
                  قواعد الدمج ومنع التكرار وحماية حالة المستخدم
                </h3>
                <ul className="space-y-1.5 text-slate-600 dark:text-slate-300 leading-relaxed list-disc pr-4">
                  <li>
                    يحافظ الاستيراد والمزامنة السحابية على المفضلة (<code className="font-mono">favorite</code>) والمجلدات وتقدم التكرار المتباعد (<code className="font-mono">srsData</code>) ومفاتيح تليجرام المشفرة.
                  </li>
                  <li>
                    يقبل المستورد كتل Markdown (<code dir="ltr" className="font-mono">```json ... ```</code>) من ردود ChatGPT وGemini مباشرة أو ملفات <code dir="ltr" className="font-mono">.json / .md / .csv / .txt / .zip</code>.
                  </li>
                  <li>
                    للوسائط الكبيرة (الصور، PDF، الصوت، الفيديو) يُنصح باستخدام روابط{' '}
                    <code dir="ltr" className="font-mono">https://</code>؛ وعند تنزيل الموضوع أو الكتاب أوفلاين يخزنها التطبيق في IndexedDB تلقائياً.
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
