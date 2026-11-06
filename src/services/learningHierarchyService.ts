import {
  TopicArticle,
  TopicSection,
  TopicImageItem,
  TopicLinkItem,
  TopicAttachmentItem,
  MedicalBlock,
  MedicalSubject,
  TopicContentBlock,
  RecentLearningItem,
  StudiedTermLogEntry
} from '../types/lexicon';

export const LEARNING_STORAGE_KEYS = {
  BLOCKS: 'dictengine_umd_blocks_v2',
  SUBJECTS: 'dictengine_umd_subjects_v2',
  QUIZ_QUESTIONS: 'dictengine_umd_quiz_questions_v2',
  QUIZ_ATTEMPTS: 'dictengine_umd_quiz_attempts_v2',
  RECENT_LEARNING: 'dictengine_umd_recent_learning_v2',
  STUDIED_TERMS_LOG: 'dictengine_umd_studied_terms_log_v2'
} as const;

export const INITIAL_MEDICAL_BLOCKS: MedicalBlock[] = [
  {
    id: 'block-hematology',
    code: 'BLK-HEME',
    titleEn: 'Hematology & Lymphoreticular System Block',
    titleAr: 'بلوك أمراض الدم والجهاز اللمفاوي',
    descriptionEn:
      'Comprehensive study of hematopoiesis, CBC indices, anemias, hemoglobinopathies, leukemias, hemostasis, transfusion medicine, and lymphoid histology.',
    descriptionAr:
      'دراسة متكاملة لتكوّن الدم، قراءة CBC، تصنيف فقر الدم، اعتلالات الهيموغلوبين، اللوكيميا، الإرقاء والتخثر، نقل الدم، وهستولوجيا الأعضاء اللمفاوية.',
    colorAccent: 'rose',
    order: 1,
    createdAt: '2026-11-01',
    updatedAt: '2026-11-05'
  },
  {
    id: 'block-infectious',
    code: 'BLK-INF',
    titleEn: 'Infectious Diseases & Microbiology Block',
    titleAr: 'بلوك الأمراض المعدية والأحياء الدقيقة والطفيليات',
    descriptionEn:
      'Diagnostic and clinical mastery of human parasites, helminths (Nematodes, Cestodes, Trematodes), infective vs. diagnostic stages, and microscopy spotters.',
    descriptionAr:
      'إتقان التشخيص السريري والمخبري للطفيليات البشرية والديدان (الأسطوانية، الشريطية، المثقوبات)، الأطوار المعدية والتشخيصية، وعينات العملي.',
    colorAccent: 'emerald',
    order: 2,
    createdAt: '2026-11-01',
    updatedAt: '2026-11-05'
  },
  {
    id: 'block-clinical-medicine',
    code: 'BLK-CLIN',
    titleEn: 'Cardiopulmonary & Emergency Medicine Block',
    titleAr: 'بلوك طب القلب والطوارئ السريرية',
    descriptionEn:
      'Acute coronary syndromes, myocardial infarction pathophysiology, hemodynamic stabilization, and emergency reperfusion protocols.',
    descriptionAr:
      'المتلازمة الإكليلية الحادة، الفيزيولوجيا المرضية لاحتشاء عضلة القلب، الاستقرار الهيموديناميكي، وبروتوكولات إعادة التروية العاجلة.',
    colorAccent: 'sky',
    order: 3,
    createdAt: '2026-10-15',
    updatedAt: '2026-11-05'
  },
  {
    id: 'block-informatics',
    code: 'BLK-INFO',
    titleEn: 'Medical Informatics, AI & Lexicography Block',
    titleAr: 'بلوك المعلوماتية الطبية والذكاء الاصطناعي والمعاجم',
    descriptionEn:
      'Glossary-Constrained Neural Machine Translation (GC-NMT), SQLite FTS5 edge indexing, and history of Arabic medical terminology.',
    descriptionAr:
      'الترجمة العصبية المقيدة بالمعجم الطبي، محركات الفهرسة الفورية SQLite FTS5، وتاريخ تأصيل المصطلح الطبي العربي.',
    colorAccent: 'amber',
    order: 4,
    createdAt: '2026-10-15',
    updatedAt: '2026-11-05'
  }
];

export const INITIAL_MEDICAL_SUBJECTS: MedicalSubject[] = [
  {
    id: 'subj-hematology',
    code: 'HEME-101',
    blockId: 'block-hematology',
    isStandalone: false,
    titleEn: 'Clinical & Laboratory Hematology',
    titleAr: 'علم أمراض الدم السريري والمخبري',
    descriptionEn:
      '13 structured topics covering RBC physiology, CBC interpretation, microcytic/macrocytic/hemolytic anemias, marrow failure, WBC disorders, leukemia, hemostasis, and blood banking.',
    descriptionAr:
      '13 موضوعاً متسلسلاً تغطي فيزيولوجيا الدم، قراءة CBC، أنواع فقر الدم، فشل النخاع، الكريات البيض، اللوكيميا، التخثر، وفصائل الدم.',
    order: 1,
    createdAt: '2026-11-01',
    updatedAt: '2026-11-05'
  },
  {
    id: 'subj-parasitology',
    code: 'PARA-201',
    blockId: 'block-infectious',
    isStandalone: false,
    titleEn: 'Diagnostic Medical Parasitology & Helminthology',
    titleAr: 'علم الطفيليات الطبية التشخيصي والعملي',
    descriptionEn:
      '8 comprehensive practical and theoretical units covering foundations, intestinal & tissue nematodes, cestodes, trematodes, microscopy spotter atlas, 1-day study plan, and MCQ/Viva bank.',
    descriptionAr:
      '8 وحدات عملية ونظرية شاملة تغطي الأساسيات، الديدان الأسطوانية والشريطية والمثقوبات، أطلس صور العملي، خطة المراجعة، وبنك أسئلة MCQ و Viva.',
    order: 1,
    createdAt: '2026-11-01',
    updatedAt: '2026-11-05'
  },
  {
    id: 'subj-cardiology',
    code: 'CARD-301',
    blockId: 'block-clinical-medicine',
    isStandalone: false,
    titleEn: 'Cardiovascular Emergencies & Critical Care',
    titleAr: 'طوارئ القلب والأوعية الدموية والعناية الحرجة',
    descriptionEn:
      'Clinical protocols for acute coronary syndrome (ACS), STEMI/NSTEMI recognition, cardiac biomarkers, and primary PCI.',
    descriptionAr:
      'البروتوكولات السريرية للمتلازمة الإكليلية الحادة، تشخيص احتشاء عضلة القلب، الواسمات القلبية، والقسطرة التاجية العاجلة.',
    order: 1,
    createdAt: '2026-10-15',
    updatedAt: '2026-11-05'
  },
  {
    id: 'subj-medical-ai',
    code: 'MDAI-401',
    blockId: 'block-informatics',
    isStandalone: false,
    titleEn: 'Medical AI, GC-NMT & Edge Systems',
    titleAr: 'الذكاء الاصطناعي الطبي وهندسة قواعد البيانات',
    descriptionEn:
      'Neural machine translation constrained by WHO UMD terminology, SQLite FTS5 inverted indexing, and Arabic medical lexicography.',
    descriptionAr:
      'الترجمة العصبية المقيدة بالمعجم الطبي الموحد، الفهرسة المعكوسة SQLite FTS5، وتاريخ المعاجم الطبية العربية.',
    order: 1,
    createdAt: '2026-10-15',
    updatedAt: '2026-11-05'
  }
];

const CURATED_TOPIC_ENGLISH_TITLES: Record<string, { titleEn: string; titleAr: string }> = {
  'topic-med-acs-1': {
    titleEn: 'Acute Coronary Syndrome (ACS) & Emergency Myocardial Infarction Management',
    titleAr: 'المتلازمة الإكليلية الحادة وتدبير احتشاء عضلة القلب في الطوارئ'
  },
  'topic-ai-gcnmt-2': {
    titleEn: 'Glossary-Constrained Neural Machine Translation (GC-NMT) in Clinical Texts',
    titleAr: 'هندسة الترجمة العصبية المقيدة بالمعجم (GC-NMT) ومنع الهلوسة في النصوص العلمية'
  },
  'topic-tech-sqlite-3': {
    titleEn: 'SQLite FTS5 Instant Search Architecture & Local Edge Synchronization',
    titleAr: 'تصميم محركات البحث الفوري SQLite FTS5 والمزامنة المحلية في بيئة Termux'
  },
  'topic-hist-lexicon-4': {
    titleEn: 'History of Arabic Medical Lexicography: From The Canon of Medicine to WHO UMD',
    titleAr: 'تاريخ المعاجم الطبية والعلمية العربية: من القانون في الطب إلى المعجم الموحد'
  },
  'topic-heme-01': {
    titleEn: '01. Introduction to Hematology and Hematopoiesis',
    titleAr: 'مدخل إلى علم الدم وتكوّن خلايا الدم'
  },
  'topic-heme-02': {
    titleEn: '02. Complete Blood Count (CBC), RBC Indices, and Peripheral Smear',
    titleAr: 'قراءة CBC ومؤشرات كريات الدم الحمراء واللطاخة المحيطية'
  },
  'topic-heme-03': {
    titleEn: '03. Anemia: Classification and Diagnostic Approach',
    titleAr: 'تصنيف فقر الدم وخوارزمية التشخيص'
  },
  'topic-heme-04': {
    titleEn: '04. Iron Deficiency Anemia (IDA)',
    titleAr: 'فقر الدم بعوز الحديد'
  },
  'topic-heme-05': {
    titleEn: '05. Thalassemia and Hemoglobinopathies',
    titleAr: 'الثلاسيميا واضطرابات الهيموغلوبين'
  },
  'topic-heme-06': {
    titleEn: '06. Sickle Cell Disease and Acute Crises',
    titleAr: 'فقر الدم المنجلي والأزمات الحادة'
  },
  'topic-heme-07': {
    titleEn: '07. Megaloblastic Anemia: Vitamin B12 and Folate Deficiency',
    titleAr: 'فقر الدم ضخم الأرومات ونقص B12 والفولات'
  },
  'topic-heme-08': {
    titleEn: '08. Hemolytic Anemia and Laboratory Workup',
    titleAr: 'فقر الدم الانحلالي والاختبارات المخبرية'
  },
  'topic-heme-09': {
    titleEn: '09. Bone Marrow Failure, Aplastic Anemia, and Pancytopenia',
    titleAr: 'فشل نخاع العظم وقلة خلايا الدم الشاملة'
  },
  'topic-heme-10': {
    titleEn: '10. Leukocytes, Differential Count, and Immune Functions',
    titleAr: 'كريات الدم البيضاء والمناعة والتفريق العددي'
  },
  'topic-heme-11': {
    titleEn: '11. Leukemia: Acute and Chronic Diagnostic Patterns',
    titleAr: 'اللوكيميا الحادة والمزمنة ومبادئ التشخيص'
  },
  'topic-heme-12': {
    titleEn: '12. Hemostasis, Platelets, and Coagulation Cascade',
    titleAr: 'الإرقاء والتخثر والصفائح الدموية'
  },
  'topic-heme-13': {
    titleEn: '13. ABO/Rh Blood Groups, Transfusion, and Lymphoid Histology',
    titleAr: 'فصائل الدم ونقل الدم والأنسجة اللمفاوية'
  },
  'pt-parasito-01-foundations': {
    titleEn: '01. Foundations of Medical Parasitology, Taxonomy & Transmission Routes',
    titleAr: 'أساسيات علم الطفيليات وتصنيف الديدان وطرق الانتقال'
  },
  'pt-parasito-02-nematodes-intestinal': {
    titleEn: '02. Intestinal Nematodes Diagnostic Atlas (Ascaris, Trichuris, Enterobius, Strongyloides)',
    titleAr: 'الديدان الأسطوانية المعوية — أطلس التشخيص المخبري'
  },
  'pt-parasito-03-nematodes-filaria': {
    titleEn: '03. Tissue & Blood Nematodes: Loa loa (African Eye Worm) & Chrysops Vector',
    titleAr: 'الديدان الخيطية الدموية والنسيجية — Loa loa وذباب Chrysops'
  },
  'pt-parasito-04-cestodes': {
    titleEn: '04. Cestodes (Tapeworms): Taenia, Hymenolepis, Diphyllobothrium & Echinococcus',
    titleAr: 'الديدان الشريطية — مقارنة الرؤوس والقطع الحبلى والبيوض'
  },
  'pt-parasito-05-trematodes': {
    titleEn: '05. Trematodes (Flukes): Fasciola, Schistosoma mansoni/haematobium & Heterophyes',
    titleAr: 'المثقوبات — Fasciola و Schistosoma و Heterophyes'
  },
  'pt-parasito-06-practical-spotter': {
    titleEn: '06. Practical Exam Spotter Guide: Rapid Differential Tables & Key Clues',
    titleAr: 'دليل امتحان العملي السريع — جداول المقارنة وعلامات التشخيص الفارقة'
  },
  'pt-parasito-07-one-day-plan': {
    titleEn: '07. One-Day Parasitology Master Revision Plan & Self-Assessment Checklist',
    titleAr: 'خطة مذاكرة الطفيليات العملية في يوم واحد وقائمة التحقق'
  },
  'pt-parasito-08-mcq-viva': {
    titleEn: '08. Comprehensive Parasitology Assessment: 22 High-Yield MCQs & Rapid Viva',
    titleAr: 'اختبار شامل للطفيليات العملية — 22 سؤال MCQ و Rapid Viva'
  }
};

function inferBlockAndSubjectForTopic(topic: TopicArticle): {
  blockId: string;
  subjectId: string;
} {
  if (topic.blockId && topic.subjectId) {
    return { blockId: topic.blockId, subjectId: topic.subjectId };
  }
  const idLower = topic.id.toLowerCase();
  const titleCombined = `${topic.title} ${topic.subtitle || ''} ${topic.author || ''}`.toLowerCase();

  if (idLower.startsWith('topic-heme') || titleCombined.includes('hematology') || titleCombined.includes('anemia') || titleCombined.includes('leukemia')) {
    return { blockId: 'block-hematology', subjectId: 'subj-hematology' };
  }
  if (idLower.startsWith('pt-parasito') || titleCombined.includes('parasitol') || titleCombined.includes('helminth') || titleCombined.includes('nematode') || titleCombined.includes('cestode') || titleCombined.includes('trematode')) {
    return { blockId: 'block-infectious', subjectId: 'subj-parasitology' };
  }
  if (topic.category === 'Medical') {
    return { blockId: 'block-clinical-medicine', subjectId: 'subj-cardiology' };
  }
  return { blockId: 'block-informatics', subjectId: 'subj-medical-ai' };
}

function splitBilingualHeading(rawHeading?: string): { headingEn: string; headingAr: string } {
  const clean = (rawHeading || '').trim();
  if (!clean) {
    return { headingEn: 'Section Overview', headingAr: 'نظرة عامة على القسم' };
  }
  if (clean.includes('—')) {
    const [left, right] = clean.split('—').map((s) => s.trim());
    const leftHasLatin = /[A-Za-z]/.test(left);
    const rightHasArabic = /[\u0600-\u06FF]/.test(right);
    if (leftHasLatin && rightHasArabic) {
      return { headingEn: left, headingAr: right };
    }
    if (/[\u0600-\u06FF]/.test(left) && /[A-Za-z]/.test(right)) {
      return { headingEn: right, headingAr: left };
    }
  }
  const hasArabic = /[\u0600-\u06FF]/.test(clean);
  const hasEnglish = /[A-Za-z]{3,}/.test(clean);
  if (hasEnglish && !hasArabic) {
    return { headingEn: clean, headingAr: clean };
  }
  if (hasArabic && !hasEnglish) {
    return { headingEn: clean, headingAr: clean };
  }
  return { headingEn: clean, headingAr: clean };
}

/**
 * Builds contextual inline ContentBlocks for a topic so images, links, notes, and attachments
 * appear in their relevant section during reading/editing rather than all dumped at the bottom.
 */
export function buildContextualContentBlocksForTopic(topic: TopicArticle): TopicSection[] {
  const sections = topic.sections || [];
  if (sections.length === 0) return [];

  // Check if all sections already have explicit contentBlocks
  const alreadyPopulated = sections.every(
    (s) => Array.isArray(s.contentBlocks) && s.contentBlocks.length > 0
  );
  if (alreadyPopulated) {
    return sections.map((s) => {
      const { headingEn, headingAr } = splitBilingualHeading(s.heading);
      return {
        ...s,
        headingEn: s.headingEn || headingEn,
        headingAr: s.headingAr || headingAr
      };
    });
  }

  // Match topic-level images to their most relevant section by keyword or distribute evenly
  const usedImageIds = new Set<string>();
  const imagesBySectionIndex = new Map<number, TopicImageItem[]>();

  for (const img of topic.images || []) {
    const capLower = (img.caption || '').toLowerCase();
    let bestSecIdx = -1;
    let bestScore = 0;

    sections.forEach((sec, idx) => {
      const secText = `${sec.heading || ''} ${(sec.paragraphs || []).join(' ')}`.toLowerCase();
      const keywords = capLower
        .split(/[^a-z0-9\u0600-\u06FF]+/)
        .filter((w) => w.length >= 4);
      let score = 0;
      for (const kw of keywords) {
        if (secText.includes(kw)) score += 1;
      }
      if (score > bestScore) {
        bestScore = score;
        bestSecIdx = idx;
      }
    });

    if (bestSecIdx === -1) {
      bestSecIdx = Math.min(sections.length - 1, usedImageIds.size % sections.length);
    }
    const current = imagesBySectionIndex.get(bestSecIdx) || [];
    current.push(img);
    imagesBySectionIndex.set(bestSecIdx, current);
    usedImageIds.add(img.id);
  }

  return sections.map((sec, secIdx) => {
    const { headingEn, headingAr } = splitBilingualHeading(sec.heading);
    if (Array.isArray(sec.contentBlocks) && sec.contentBlocks.length > 0) {
      return {
        ...sec,
        headingEn: sec.headingEn || headingEn,
        headingAr: sec.headingAr || headingAr
      };
    }

    const blocks: TopicContentBlock[] = [];
    let orderCounter = 1;

    for (const para of sec.paragraphs || []) {
      const trimmed = para.trim();
      if (!trimmed) continue;

      const isHighYieldNote =
        /^(Remember:|Important trap:|MCQ trap:|Exam clues:|High-yield|تمييز مهم:|لا تخلط بين|ملاحظة هامة)/i.test(
          trimmed
        ) ||
        (sec.heading || '').toLowerCase().includes('exam') ||
        (sec.heading || '').includes('امتحانية');

      if (isHighYieldNote) {
        blocks.push({
          id: `${sec.id}-blk-${orderCounter}`,
          type: 'clinical_note',
          order: orderCounter++,
          titleEn: 'High-Yield Clinical & Exam Correlation',
          titleAr: 'ملاحظة سريرية وامتحانية هامة',
          text: trimmed,
          noteSeverity: 'high-yield'
        });
      } else {
        blocks.push({
          id: `${sec.id}-blk-${orderCounter}`,
          type: 'paragraph',
          order: orderCounter++,
          text: trimmed
        });
      }
    }

    // Insert matched inline images right inside this section
    const sectionImages = imagesBySectionIndex.get(secIdx) || [];
    for (const img of sectionImages) {
      blocks.push({
        id: `${sec.id}-img-${img.id}`,
        type: 'image',
        order: orderCounter++,
        mediaUrl: img.url,
        captionEn: img.caption,
        captionAr: img.caption
      });
    }

    // Attach external links & attachments to the final section if not already placed inline
    if (secIdx === sections.length - 1) {
      for (const lnk of topic.links || []) {
        blocks.push({
          id: `${sec.id}-lnk-${lnk.id}`,
          type: 'video_link',
          order: orderCounter++,
          titleEn: lnk.title,
          titleAr: lnk.description || lnk.title,
          externalUrl: lnk.url,
          text: lnk.description || lnk.title
        });
      }
      for (const att of topic.attachments || []) {
        blocks.push({
          id: `${sec.id}-att-${att.id}`,
          type: 'attachment',
          order: orderCounter++,
          titleEn: att.fileName,
          titleAr: att.fileType,
          mediaFileName: att.fileName,
          mediaMimeType: att.fileType,
          mediaUrl: att.contentDataUrlOrText,
          text: att.fileSizeLabel
        });
      }
    }

    return {
      ...sec,
      headingEn: sec.headingEn || headingEn,
      headingAr: sec.headingAr || headingAr,
      contentBlocks: blocks
    };
  });
}

/**
 * Synchronizes rich `contentBlocks` back to legacy `paragraphs`, `images`, `links`, and `attachments`
 * so backward compatibility with existing verification scripts and OTA bundles is 100% preserved.
 */
export function syncContentBlocksToLegacyTopicFields(
  sections: TopicSection[],
  existingImages: TopicImageItem[] = [],
  existingLinks: TopicLinkItem[] = [],
  existingAttachments: TopicAttachmentItem[] = []
): {
  sections: TopicSection[];
  images: TopicImageItem[];
  links: TopicLinkItem[];
  attachments: TopicAttachmentItem[];
} {
  const collectedImages: TopicImageItem[] = [];
  const collectedLinks: TopicLinkItem[] = [];
  const collectedAttachments: TopicAttachmentItem[] = [];
  const seenImgUrls = new Set<string>();
  const seenLinkUrls = new Set<string>();
  const seenAttachmentNames = new Set<string>();

  const normalizedSections: TopicSection[] = sections.map((sec, idx) => {
    const blocks = Array.isArray(sec.contentBlocks)
      ? [...sec.contentBlocks].sort((a, b) => a.order - b.order)
      : [];

    if (blocks.length === 0) {
      return {
        ...sec,
        heading: sec.heading || sec.headingEn || sec.headingAr || `Section ${idx + 1}`,
        paragraphs:
          sec.paragraphs && sec.paragraphs.length > 0 ? sec.paragraphs : ['']
      };
    }

    const derivedParagraphs: string[] = [];

    for (const blk of blocks) {
      if (blk.type === 'heading') {
        const hText = [blk.titleEn, blk.titleAr].filter(Boolean).join(' — ');
        if (hText) derivedParagraphs.push(hText);
      } else if (blk.type === 'paragraph' || blk.type === 'clinical_note') {
        const pText = (blk.text || blk.textAr || '').trim();
        if (pText) derivedParagraphs.push(pText);
      } else if (blk.type === 'table' && blk.tableHeaders && blk.tableHeaders.length > 0) {
        const headerLine = blk.tableHeaders.join(' | ');
        const rowLines = (blk.tableRows || []).map((r) => r.join(' | ')).join('\n');
        derivedParagraphs.push(`${blk.titleEn || 'Table'}:\n${headerLine}\n${rowLines}`);
      } else if (blk.type === 'question' && blk.inlineQuestion) {
        derivedParagraphs.push(
          `Q: ${blk.inlineQuestion.questionEn} — Answer: ${blk.inlineQuestion.correctOptionKeys.join(', ')}`
        );
      } else if (blk.type === 'image' && blk.mediaUrl) {
        if (!seenImgUrls.has(blk.mediaUrl)) {
          seenImgUrls.add(blk.mediaUrl);
          collectedImages.push({
            id: blk.id,
            url: blk.mediaUrl,
            caption: blk.captionEn || blk.captionAr || blk.titleEn || 'Illustration'
          });
        }
      } else if (blk.type === 'video_link' && blk.externalUrl) {
        if (!seenLinkUrls.has(blk.externalUrl)) {
          seenLinkUrls.add(blk.externalUrl);
          collectedLinks.push({
            id: blk.id,
            title: blk.titleEn || blk.titleAr || blk.externalUrl,
            url: blk.externalUrl,
            description: blk.text || blk.titleAr
          });
        }
      } else if (blk.type === 'attachment' && blk.mediaFileName) {
        if (!seenAttachmentNames.has(blk.mediaFileName)) {
          seenAttachmentNames.add(blk.mediaFileName);
          collectedAttachments.push({
            id: blk.id,
            fileName: blk.mediaFileName,
            fileType: blk.mediaMimeType || 'FILE',
            fileSizeLabel: blk.text || 'Attachment',
            contentDataUrlOrText: blk.mediaUrl || ''
          });
        }
      }
    }

    // Preserve original paragraphs if derivedParagraphs is empty
    const finalParagraphs =
      derivedParagraphs.length > 0
        ? derivedParagraphs
        : sec.paragraphs && sec.paragraphs.length > 0
          ? sec.paragraphs
          : [sec.headingEn || sec.heading || 'Content'];

    return {
      ...sec,
      heading: sec.heading || sec.headingEn || sec.headingAr || `Section ${idx + 1}`,
      paragraphs: finalParagraphs,
      contentBlocks: blocks
    };
  });

  // Merge with any existing images/links/attachments so nothing is ever lost
  for (const img of existingImages) {
    if (!seenImgUrls.has(img.url)) {
      seenImgUrls.add(img.url);
      collectedImages.push(img);
    }
  }
  for (const lnk of existingLinks) {
    if (!seenLinkUrls.has(lnk.url)) {
      seenLinkUrls.add(lnk.url);
      collectedLinks.push(lnk);
    }
  }
  for (const att of existingAttachments) {
    if (!seenAttachmentNames.has(att.fileName)) {
      seenAttachmentNames.add(att.fileName);
      collectedAttachments.push(att);
    }
  }

  return {
    sections: normalizedSections,
    images: collectedImages,
    links: collectedLinks,
    attachments: collectedAttachments
  };
}

export function enrichTopicWithHierarchyAndContentBlocks(
  topic: TopicArticle,
  allTopics: TopicArticle[] = []
): TopicArticle {
  const curated = CURATED_TOPIC_ENGLISH_TITLES[topic.id];
  const { blockId, subjectId } = inferBlockAndSubjectForTopic(topic);

  let titleEn = topic.titleEn || curated?.titleEn || '';
  let titleAr = topic.titleAr || curated?.titleAr || '';

  if (!titleEn || !titleAr) {
    const rawTitle = (topic.title || '').trim();
    const rawSub = (topic.subtitle || '').trim();
    const titleHasArabic = /[\u0600-\u06FF]/.test(rawTitle);
    const subHasEnglish = /[A-Za-z]{3,}/.test(rawSub);

    if (titleHasArabic && subHasEnglish) {
      titleEn = titleEn || rawSub;
      titleAr = titleAr || rawTitle;
    } else if (!titleHasArabic && /[A-Za-z]/.test(rawTitle)) {
      titleEn = titleEn || rawTitle;
      titleAr = titleAr || (/[\u0600-\u06FF]/.test(rawSub) ? rawSub : rawTitle);
    } else {
      titleEn = titleEn || rawSub || rawTitle;
      titleAr = titleAr || rawTitle;
    }
  }

  // Compute related topics within the same subject if not already specified
  const relatedTopicIds =
    topic.relatedTopicIds && topic.relatedTopicIds.length > 0
      ? topic.relatedTopicIds
      : allTopics
          .filter((other) => {
            if (other.id === topic.id) return false;
            const otherHierarchy = inferBlockAndSubjectForTopic(other);
            return otherHierarchy.subjectId === subjectId;
          })
          .slice(0, 4)
          .map((t) => t.id);

  const enrichedSections = buildContextualContentBlocksForTopic(topic);

  return {
    ...topic,
    titleEn,
    titleAr,
    blockId,
    subjectId,
    relatedTopicIds,
    sections: enrichedSections
  };
}

export function enrichAllTopicsWithHierarchy(topics: TopicArticle[]): TopicArticle[] {
  return topics.map((t) => enrichTopicWithHierarchyAndContentBlocks(t, topics));
}

export function loadMedicalBlocks(): MedicalBlock[] {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return [...INITIAL_MEDICAL_BLOCKS];
    }
    const raw = window.localStorage.getItem(LEARNING_STORAGE_KEYS.BLOCKS);
    if (!raw) return [...INITIAL_MEDICAL_BLOCKS];
    const parsed = JSON.parse(raw) as MedicalBlock[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return [...INITIAL_MEDICAL_BLOCKS];
    }
    const existingIds = new Set(parsed.map((b) => b.id));
    const missingSeeds = INITIAL_MEDICAL_BLOCKS.filter((b) => !existingIds.has(b.id));
    return [...parsed, ...missingSeeds].sort((a, b) => a.order - b.order);
  } catch {
    return [...INITIAL_MEDICAL_BLOCKS];
  }
}

export function saveMedicalBlocks(blocks: MedicalBlock[]): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(LEARNING_STORAGE_KEYS.BLOCKS, JSON.stringify(blocks));
    }
  } catch {
    // ignore storage quota errors
  }
}

export function loadMedicalSubjects(): MedicalSubject[] {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return [...INITIAL_MEDICAL_SUBJECTS];
    }
    const raw = window.localStorage.getItem(LEARNING_STORAGE_KEYS.SUBJECTS);
    if (!raw) return [...INITIAL_MEDICAL_SUBJECTS];
    const parsed = JSON.parse(raw) as MedicalSubject[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return [...INITIAL_MEDICAL_SUBJECTS];
    }
    const existingIds = new Set(parsed.map((s) => s.id));
    const missingSeeds = INITIAL_MEDICAL_SUBJECTS.filter((s) => !existingIds.has(s.id));
    return [...parsed, ...missingSeeds].sort((a, b) => a.order - b.order);
  } catch {
    return [...INITIAL_MEDICAL_SUBJECTS];
  }
}

export function saveMedicalSubjects(subjects: MedicalSubject[]): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(LEARNING_STORAGE_KEYS.SUBJECTS, JSON.stringify(subjects));
    }
  } catch {
    // ignore
  }
}

export function loadRecentLearningItems(): RecentLearningItem[] {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    const raw = window.localStorage.getItem(LEARNING_STORAGE_KEYS.RECENT_LEARNING);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function recordRecentLearningItem(
  item: Omit<RecentLearningItem, 'id' | 'accessedAt'>
): RecentLearningItem[] {
  const current = loadRecentLearningItems();
  const filtered = current.filter(
    (entry) => !(entry.entityType === item.entityType && entry.entityId === item.entityId)
  );
  const nextItem: RecentLearningItem = {
    ...item,
    id: `rec-${item.entityType}-${item.entityId}`,
    accessedAt: new Date().toISOString()
  };
  const updated = [nextItem, ...filtered].slice(0, 25);
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(
        LEARNING_STORAGE_KEYS.RECENT_LEARNING,
        JSON.stringify(updated)
      );
    }
  } catch {
    // ignore
  }
  return updated;
}

export function loadStudiedTermsLog(): StudiedTermLogEntry[] {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    const raw = window.localStorage.getItem(LEARNING_STORAGE_KEYS.STUDIED_TERMS_LOG);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function recordStudiedTermEvent(
  entry: Omit<StudiedTermLogEntry, 'id' | 'studiedAt'>
): StudiedTermLogEntry[] {
  const current = loadStudiedTermsLog();
  const nextEntry: StudiedTermLogEntry = {
    ...entry,
    id: `study-${entry.termId}-${Date.now()}`,
    studiedAt: new Date().toISOString()
  };
  // Deduplicate rapid consecutive views of the same term while keeping history
  const deduplicated = current.filter(
    (item) => !(item.termId === entry.termId && item.action === entry.action && item.topicId === entry.topicId)
  );
  const updated = [nextEntry, ...deduplicated].slice(0, 200);
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(
        LEARNING_STORAGE_KEYS.STUDIED_TERMS_LOG,
        JSON.stringify(updated)
      );
    }
  } catch {
    // ignore
  }
  return updated;
}
