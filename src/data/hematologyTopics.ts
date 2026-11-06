import { TopicArticle } from '../types/lexicon';

export const HEMATOLOGY_TOPICS: TopicArticle[] = [
  {
    id: 'topic-heme-01',
    title: 'مدخل إلى علم الدم وتكوّن خلايا الدم',
    titleEn: 'Introduction to Hematology and Hematopoiesis',
    titleAr: 'مدخل إلى علم الدم وتكوّن خلايا الدم',
    subtitle: 'Introduction to Hematology and Hematopoiesis',
    category: 'Medical',
    blockId: 'block-hematology',
    subjectId: 'subj-hematology',
    author: 'UMEDT Study Series · Hematology',
    publishedAt: 'نوفمبر 2026',
    readingTimeMinutes: 8,
    favorite: false,
    sections: [
      {
        id: 'topic-heme-01-s1',
        heading: '1. مكونات الدم ووظائفها',
        headingEn: '1. Blood Components and Functions',
        headingAr: '1. مكونات الدم ووظائفها',
        paragraphs: [
          'Blood consists of plasma and formed elements. Plasma carries water, electrolytes, nutrients, hormones, and plasma proteins; formed elements include erythrocytes (RBCs), leukocytes (WBCs), and platelets. اربط كل عنصر بوظيفته: RBCs لنقل الغازات، WBCs للدفاع المناعي، والصفائح مع عوامل التخثر لإيقاف النزف.'
        ]
      },
      {
        id: 'topic-heme-01-s2',
        heading: '2. Hematopoiesis ومواقعها',
        headingEn: '2. Hematopoiesis and Anatomical Sites',
        headingAr: '2. تكوّن الدم ومواقعه التشريحية',
        paragraphs: [
          'Hematopoiesis is the continuous production of blood cells from hematopoietic stem cells (HSCs). During fetal life, the major sites change from yolk sac to liver and then bone marrow. After birth, active marrow is progressively concentrated in the axial skeleton, especially vertebrae, sternum, ribs, and pelvis. Extramedullary hematopoiesis means blood-cell production outside marrow, classically in liver or spleen when marrow demand is high or marrow function is impaired.'
        ]
      },
      {
        id: 'topic-heme-01-s3',
        heading: '3. تنظيم تكوّن الخلايا',
        headingEn: '3. Regulation of Hematopoiesis',
        headingAr: '3. تنظيم تكوّن خلايا الدم',
        paragraphs: [
          'HSCs differentiate into myeloid and lymphoid lineages. Erythropoietin (EPO), produced mainly by the kidneys in response to tissue hypoxia, stimulates erythroid production. Thrombopoietin supports megakaryocyte and platelet production; colony-stimulating factors regulate granulocyte and monocyte lineages. Iron, vitamin B12, folate, protein, and healthy marrow stroma are essential.'
        ]
      },
      {
        id: 'topic-heme-01-s4',
        heading: '4. نقاط امتحانية',
        headingEn: '4. High-Yield Exam Correlations',
        headingAr: '4. نقاط امتحانية عالية الأهمية',
        paragraphs: [
          'Remember: EPO → kidney; HSC → all blood-cell lineages; extramedullary hematopoiesis → outside bone marrow. The classic fetal sequence is yolk sac → liver (major fetal site) → bone marrow. Do not confuse the site of maturation of T lymphocytes (thymus) with the site of production of their precursors (bone marrow).'
        ]
      }
    ],
    images: [],
    links: [],
    attachments: []
  },
  {
    id: 'topic-heme-02',
    title: 'قراءة CBC ومؤشرات كريات الدم الحمراء',
    titleEn: 'Complete Blood Count (CBC), RBC Indices, and Peripheral Smear',
    titleAr: 'قراءة تعداد الدم الكامل ومؤشرات الكريات الحمر واللطاخة المحيطية',
    subtitle: 'Complete Blood Count, RBC Indices, and Peripheral Smear',
    category: 'Medical',
    blockId: 'block-hematology',
    subjectId: 'subj-hematology',
    author: 'UMEDT Study Series · Hematology',
    publishedAt: 'نوفمبر 2026',
    readingTimeMinutes: 9,
    favorite: false,
    sections: [
      {
        id: 'topic-heme-02-s1',
        heading: '1. قراءة CBC بطريقة منظمة',
        headingEn: '1. Systematic Approach to Interpreting CBC',
        headingAr: '1. قراءة تعداد الدم الكامل بطريقة منظمة',
        paragraphs: [
          'Start with hemoglobin (Hb) and hematocrit (Hct) to assess anemia, then RBC count and red-cell indices. Review WBC count with differential, and platelet count. Always interpret values using age-, sex-, pregnancy-, and laboratory-specific reference ranges; a single numerical range is not universal.'
        ]
      },
      {
        id: 'topic-heme-02-s2',
        heading: '2. أهم RBC indices',
        headingEn: '2. Key Red Blood Cell Indices (MCV, MCH, MCHC, RDW)',
        headingAr: '2. أهم مؤشرات كريات الدم الحمراء',
        paragraphs: [
          'MCV (mean corpuscular volume) describes average RBC size: microcytic, normocytic, or macrocytic. MCH (mean corpuscular hemoglobin) is the average amount of hemoglobin per RBC, while MCHC (mean corpuscular hemoglobin concentration) reflects hemoglobin concentration within packed RBCs. RDW measures variation in RBC size (anisocytosis). Low MCV and low MCH are common in iron deficiency and thalassemia; increased MCV suggests macrocytosis.'
        ]
      },
      {
        id: 'topic-heme-02-s3',
        heading: '3. Peripheral blood smear',
        headingEn: '3. Peripheral Blood Smear Morphology',
        headingAr: '3. مورفولوجيا لطاخة الدم المحيطية',
        paragraphs: [
          'A smear adds morphology that automated indices cannot fully describe. Microcytes are small cells; hypochromia means increased central pallor; target cells may occur in thalassemia and liver disease; spherocytes occur in hereditary spherocytosis or immune hemolysis; schistocytes suggest mechanical fragmentation; sickle cells indicate HbS-related disease. Reticulocytes indicate marrow response.'
        ]
      },
      {
        id: 'topic-heme-02-s4',
        heading: '4. كيف تقترب من سؤال الحالة؟',
        headingEn: '4. Clinical Case Approach',
        headingAr: '4. كيف تقترب من سؤال الحالة السريرية؟',
        paragraphs: [
          'First classify anemia by MCV. Then inspect reticulocyte count: a low/inappropriately normal count suggests reduced production; a high count suggests blood loss or hemolysis if marrow response is intact. Next use ferritin, iron studies, bilirubin, LDH, haptoglobin, and smear according to the suspected mechanism. MCQ trap: MCH is an amount per cell; MCHC is a concentration.'
        ]
      },
      {
        id: 'topic-heme-02-s5',
        heading: '5. Quick check',
        headingEn: '5. Quick Clinical Correlation Check',
        headingAr: '5. مراجعة سريرية سريعة',
        paragraphs: [
          'A patient has low Hb, low MCV, low MCH, and high RDW: iron deficiency is likely, but confirm with iron studies. A patient has low MCV with a relatively preserved/high RBC count and normal iron stores: consider thalassemia trait.'
        ]
      }
    ],
    images: [],
    links: [],
    attachments: []
  },
  {
    id: 'topic-heme-03',
    title: 'تصنيف فقر الدم وخوارزمية التشخيص',
    titleEn: 'Anemia: Classification and Diagnostic Algorithm',
    titleAr: 'تصنيف فقر الدم وخوارزمية التشخيص',
    subtitle: 'Anemia: Classification and Diagnostic Approach',
    category: 'Medical',
    blockId: 'block-hematology',
    subjectId: 'subj-hematology',
    author: 'UMEDT Study Series · Hematology',
    publishedAt: 'نوفمبر 2026',
    readingTimeMinutes: 8,
    favorite: false,
    sections: [
      {
        id: 'topic-heme-03-s1',
        heading: '1. تعريف وآليات Anemia',
        headingEn: '1. Definition and Pathophysiological Mechanisms of Anemia',
        headingAr: '1. تعريف وآليات فقر الدم',
        paragraphs: [
          'Anemia is a reduction in hemoglobin concentration below the appropriate reference range for age and sex. The three broad mechanisms are decreased RBC production, increased RBC destruction (hemolysis), and blood loss. These mechanisms guide the differential diagnosis more reliably than memorizing long lists in isolation.'
        ]
      },
      {
        id: 'topic-heme-03-s2',
        heading: '2. التصنيف حسب MCV',
        headingEn: '2. Morphological Classification by MCV',
        headingAr: '2. التصنيف الشكلي حسب متوسط حجم الكرية (MCV)',
        paragraphs: [
          'Microcytic anemia: iron deficiency, thalassemia, and some anemia of inflammation or sideroblastic disorders. Normocytic anemia: acute blood loss, hemolysis, chronic kidney disease, early iron deficiency, or marrow failure. Macrocytic anemia: vitamin B12 or folate deficiency, alcohol/liver disease, hypothyroidism, medications, and marrow disorders. Macrocytosis is not synonymous with megaloblastic anemia.'
        ]
      },
      {
        id: 'topic-heme-03-s3',
        heading: '3. Reticulocyte count يحدد استجابة النخاع',
        headingEn: '3. Reticulocyte Count as a Marker of Bone Marrow Response',
        headingAr: '3. تعداد الشبكيات لتقييم استجابة نخاع العظم',
        paragraphs: [
          'Reticulocytes are young RBCs recently released from marrow. A high reticulocyte response supports hemolysis or blood loss; a low response suggests inadequate production. Interpret the count in context of anemia severity and, clinically, use a corrected reticulocyte index when appropriate.'
        ]
      },
      {
        id: 'topic-heme-03-s4',
        heading: '4. خطة حل الحالة',
        headingEn: '4. Step-by-Step Diagnostic Algorithm',
        headingAr: '4. خطة حل الحالة خطوة بخطوة',
        paragraphs: [
          'Step 1: confirm low Hb using the correct reference range. Step 2: classify by MCV. Step 3: assess reticulocyte response. Step 4: use smear and targeted tests (ferritin/iron profile, B12/folate, renal function, hemolysis markers, or marrow studies). Step 5: identify the cause, not just the anemia label. A common exam error is diagnosing IDA from microcytosis alone without checking iron status.'
        ]
      },
      {
        id: 'topic-heme-03-s5',
        heading: '5. High-yield distinction',
        headingEn: '5. High-Yield Diagnostic Distinctions',
        headingAr: '5. فروقات تشخيصية عالية الأهمية',
        paragraphs: [
          'Low reticulocytes + pancytopenia raises concern for marrow failure or infiltration. High reticulocytes + raised unconjugated bilirubin supports hemolysis. Microcytosis with low ferritin strongly supports iron deficiency.'
        ]
      }
    ],
    images: [],
    links: [],
    attachments: []
  },
  {
    id: 'topic-heme-04',
    title: 'فقر الدم بعوز الحديد',
    titleEn: 'Iron Deficiency Anemia (IDA)',
    titleAr: 'فقر الدم بعوز الحديد',
    subtitle: 'Iron Deficiency Anemia (IDA)',
    category: 'Medical',
    blockId: 'block-hematology',
    subjectId: 'subj-hematology',
    author: 'UMEDT Study Series · Hematology',
    publishedAt: 'نوفمبر 2026',
    readingTimeMinutes: 10,
    favorite: false,
    sections: [
      {
        id: 'topic-heme-04-s1',
        heading: '1. Iron absorption and regulation',
        headingEn: '1. Iron Absorption and Hepcidin Regulation',
        headingAr: '1. امتصاص الحديد وتنظيم الهيبسيدين',
        paragraphs: [
          'Iron is absorbed mainly in the duodenum and proximal jejunum. Non-heme iron absorption is enhanced by vitamin C and reduced by substances such as tea tannins. DMT1 transports ferrous iron (Fe2+) into enterocytes; ferritin stores iron; ferroportin exports it; transferrin transports circulating iron. Hepcidin, produced by the liver, inhibits ferroportin and reduces intestinal iron absorption and iron release from stores.'
        ]
      },
      {
        id: 'topic-heme-04-s2',
        heading: '2. Causes and clinical manifestations',
        headingEn: '2. Etiology and Clinical Manifestations',
        headingAr: '2. الأسباب والتظاهرات السريرية',
        paragraphs: [
          'Common causes include inadequate intake, increased requirements during growth, malabsorption, and chronic blood loss. Findings may include pallor, fatigue, poor concentration, pica, glossitis, koilonychia, and tachycardia. Symptoms depend on severity and chronicity; absence of classic signs does not exclude IDA.'
        ]
      },
      {
        id: 'topic-heme-04-s3',
        heading: '3. Laboratory pattern',
        headingEn: '3. Laboratory Profile and Acute-Phase Considerations',
        headingAr: '3. النمط المخبري وتأثير تفاعلات الطور الحاد',
        paragraphs: [
          'Typical IDA: low Hb, low MCV, low MCH, low serum iron, low ferritin, increased TIBC, and reduced transferrin saturation. The smear is often microcytic and hypochromic, sometimes with anisopoikilocytosis. Important trap: ferritin is an acute-phase reactant and may be normal or elevated during inflammation despite depleted iron stores.'
        ]
      },
      {
        id: 'topic-heme-04-s4',
        heading: '4. Treatment principles',
        headingEn: '4. Therapeutic Principles and Follow-Up',
        headingAr: '4. مبادئ العلاج والمتابعة المخبرية',
        paragraphs: [
          'Treat the underlying cause and replace iron according to the applicable age-specific guideline. Oral iron is commonly first-line when absorption and tolerance are adequate; parenteral iron is reserved for selected situations. Transfusion is not routine treatment for uncomplicated IDA and is reserved for selected severe or unstable cases. Follow-up should demonstrate a hematologic response and eventual replenishment of stores.'
        ]
      },
      {
        id: 'topic-heme-04-s5',
        heading: '5. IDA exam clues',
        headingEn: '5. High-Yield Exam Clues',
        headingAr: '5. مفاتيح الامتحان السريرية',
        paragraphs: [
          'Low ferritin + high TIBC = classic iron deficiency pattern. Main absorption site = duodenum/proximal jejunum. Vitamin C increases non-heme iron absorption. Tea may reduce absorption. Never equate every microcytic anemia with IDA.'
        ]
      }
    ],
    images: [],
    links: [],
    attachments: []
  },
  {
    id: 'topic-heme-05',
    title: 'الثلاسيميا واضطرابات الهيموغلوبين',
    titleEn: 'Thalassemia Syndromes and Hemoglobinopathies',
    titleAr: 'متلازمات الثلاسيميا واعتلالات الهيموغلوبين',
    subtitle: 'Thalassemia and Hemoglobinopathies',
    category: 'Medical',
    blockId: 'block-hematology',
    subjectId: 'subj-hematology',
    author: 'UMEDT Study Series · Hematology',
    publishedAt: 'نوفمبر 2026',
    readingTimeMinutes: 10,
    favorite: false,
    sections: [
      {
        id: 'topic-heme-05-s1',
        heading: '1. أساسيات Hemoglobin',
        headingEn: '1. Normal Hemoglobin Structure and Globin Chains',
        headingAr: '1. بنية الهيموغلوبين الطبيعي وسلاسل الغلوبين',
        paragraphs: [
          'Adult HbA is composed of two alpha and two beta chains (α2β2). Thalassemia is a quantitative defect: reduced or absent globin-chain synthesis. This differs from many structural hemoglobin variants, in which the globin chain is produced but has an altered amino-acid sequence.'
        ]
      },
      {
        id: 'topic-heme-05-s2',
        heading: '2. Beta-thalassemia',
        headingEn: '2. Beta-Thalassemia Pathophysiology',
        headingAr: '2. الفيزيولوجيا المرضية لثلاسيميا بيتا',
        paragraphs: [
          'Reduced beta-chain synthesis causes excess unmatched alpha chains, ineffective erythropoiesis, and hemolysis. Beta-thalassemia major often becomes clinically apparent after fetal hemoglobin (HbF) declines in infancy. Severe anemia, growth failure, hepatosplenomegaly, marrow expansion, and skeletal changes may occur. Hemoglobin analysis typically shows markedly increased HbF; HbA may be very low or absent in severe disease.'
        ]
      },
      {
        id: 'topic-heme-05-s3',
        heading: '3. Alpha-thalassemia gene dosage',
        headingEn: '3. Alpha-Thalassemia Gene Deletions',
        headingAr: '3. ثلاسيميا ألفا وعدد الجينات المتأثرة',
        paragraphs: [
          "Humans normally have four alpha-globin genes. One affected gene: silent carrier; two: alpha-thalassemia trait; three: HbH disease (β4 tetramers); four: Hb Bart's (γ4 tetramers), associated with severe fetal disease. Alpha-thalassemia trait can resemble IDA on CBC because both can cause microcytosis, so iron studies and hemoglobin analysis/genetic testing may be needed."
        ]
      },
      {
        id: 'topic-heme-05-s4',
        heading: '4. مقارنة IDA وThalassemia trait',
        headingEn: '4. Differentiating IDA from Thalassemia Trait',
        headingAr: '4. التفريق بين عوز الحديد وحامل الثلاسيميا',
        paragraphs: [
          'Both may show low MCV and MCH. IDA usually has low ferritin and often increased RDW; thalassemia trait commonly has normal iron stores and a relatively preserved or increased RBC count. These are clues, not absolute rules. Do not prescribe iron for thalassemia unless iron deficiency is also demonstrated.'
        ]
      },
      {
        id: 'topic-heme-05-s5',
        heading: '5. Complications and management concepts',
        headingEn: '5. Iron Overload and Management Principles',
        headingAr: '5. فرط الحديد ومبادئ التدبير العلاجي',
        paragraphs: [
          'Transfusion-dependent thalassemia may require regular RBC transfusions and iron chelation to prevent iron overload in the heart, liver, and endocrine organs. Selected patients may be candidates for hematopoietic stem-cell transplantation. The treatment plan is specialist-led and depends on genotype, severity, and complications.'
        ]
      }
    ],
    images: [],
    links: [],
    attachments: []
  },
  {
    id: 'topic-heme-06',
    title: 'فقر الدم المنجلي والأزمات الحادة',
    titleEn: 'Sickle Cell Disease (SCD) and Acute Crises',
    titleAr: 'فقر الدم المنجلي والأزمات الحادة',
    subtitle: 'Sickle Cell Disease and Acute Crises',
    category: 'Medical',
    blockId: 'block-hematology',
    subjectId: 'subj-hematology',
    author: 'UMEDT Study Series · Hematology',
    publishedAt: 'نوفمبر 2026',
    readingTimeMinutes: 10,
    favorite: false,
    sections: [
      {
        id: 'topic-heme-06-s1',
        heading: '1. Molecular pathophysiology',
        headingEn: '1. Molecular Pathophysiology of HbS Polymerization',
        headingAr: '1. الآلية الجزيئية لتبلمر الهيموغلوبين المنجلي (HbS)',
        paragraphs: [
          'Sickle cell disease results from a beta-globin mutation in which glutamic acid is replaced by valine at position 6, producing HbS. When deoxygenated, HbS polymerizes; RBCs become rigid and sickle-shaped. Repeated sickling causes chronic hemolysis, vaso-occlusion, ischemia, and progressive organ injury.'
        ]
      },
      {
        id: 'topic-heme-06-s2',
        heading: '2. Triggers and manifestations',
        headingEn: '2. Precipitating Triggers and Clinical Features',
        headingAr: '2. العوامل المحرضة والتظاهرات السريرية',
        paragraphs: [
          'Hypoxia, dehydration, infection, cold exposure, and physiologic stress can promote sickling. Clinical features include chronic hemolytic anemia, jaundice, painful vaso-occlusive episodes, dactylitis in infants, acute chest syndrome, stroke, avascular necrosis, pigment gallstones, and renal concentrating defects. Repeated splenic infarction can lead to functional asplenia.'
        ]
      },
      {
        id: 'topic-heme-06-s3',
        heading: '3. التفريق بين الأزمات',
        headingEn: '3. Differentiating Acute Hematologic Crises',
        headingAr: '3. التفريق بين الأزمات الدموية الحادة',
        paragraphs: [
          'Hemolytic crisis: increased RBC destruction, usually with increased reticulocytes. Aplastic crisis, classically due to Parvovirus B19: sudden fall in Hb with markedly reduced reticulocytes. Sequestration crisis: sudden pooling of blood in spleen or liver, acute organ enlargement, severe anemia, and possible shock; reticulocytes are often increased. The reticulocyte count is a key discriminator.'
        ]
      },
      {
        id: 'topic-heme-06-s4',
        heading: '4. Infection risk and prevention',
        headingEn: '4. Functional Asplenia and Infection Prophylaxis',
        headingAr: '4. انعدام الطحال الوظيفي والوقاية من العدوى',
        paragraphs: [
          'Functional asplenia increases susceptibility to encapsulated bacteria, especially Streptococcus pneumoniae and Haemophilus influenzae type b. Prevention includes recommended vaccination, penicillin prophylaxis in appropriate children, hydration, and prompt assessment of fever. Hydroxyurea increases HbF and reduces vaso-occlusive complications; monitoring is required because myelosuppression can occur.'
        ]
      },
      {
        id: 'topic-heme-06-s5',
        heading: '5. Exam clues',
        headingEn: '5. High-Yield Exam Clues',
        headingAr: '5. مفاتيح امتحانية عالية الأهمية',
        paragraphs: [
          'HbS polymerizes when deoxygenated. Aplastic crisis → Parvovirus B19 + low reticulocytes. Functional asplenia → encapsulated organisms. Hydroxyurea → increased HbF. Acute chest syndrome and stroke are serious complications requiring urgent specialist management.'
        ]
      }
    ],
    images: [],
    links: [],
    attachments: []
  },
  {
    id: 'topic-heme-07',
    title: 'فقر الدم ضخم الأرومات ونقص B12 والفولات',
    titleEn: 'Megaloblastic Anemia: Vitamin B12 and Folate Deficiency',
    titleAr: 'فقر الدم ضخم الأرومات وعوز فيتامين B12 والفولات',
    subtitle: 'Megaloblastic Anemia: Vitamin B12 and Folate',
    category: 'Medical',
    blockId: 'block-hematology',
    subjectId: 'subj-hematology',
    author: 'UMEDT Study Series · Hematology',
    publishedAt: 'نوفمبر 2026',
    readingTimeMinutes: 8,
    favorite: false,
    sections: [
      {
        id: 'topic-heme-07-s1',
        heading: '1. Mechanism and morphology',
        headingEn: '1. Impaired DNA Synthesis and Smear Morphology',
        headingAr: '1. خلل تصنيع الـ DNA والمظهر الخلوي',
        paragraphs: [
          'Megaloblastic anemia results from impaired DNA synthesis, most commonly due to vitamin B12 or folate deficiency. Nuclear maturation lags behind cytoplasmic maturation, producing macro-ovalocytes in blood and nuclear-cytoplasmic asynchrony in marrow. Hypersegmented neutrophils are a classic peripheral smear clue; giant metamyelocytes may be seen in marrow.'
        ]
      },
      {
        id: 'topic-heme-07-s2',
        heading: '2. Folate versus Vitamin B12',
        headingEn: '2. Absorption Sites: Folate vs. Vitamin B12',
        headingAr: '2. مواقع الامتصاص والأسباب: الفولات مقابل فيتامين B12',
        paragraphs: [
          'Folate is absorbed mainly in the proximal small intestine. Vitamin B12 binds intrinsic factor and is absorbed in the terminal ileum. Folate deficiency may result from poor intake, malabsorption, increased demand, or certain medications. B12 deficiency may result from inadequate intake, intrinsic-factor problems, or terminal ileal disease/resection.'
        ]
      },
      {
        id: 'topic-heme-07-s3',
        heading: '3. Neurological distinction',
        headingEn: '3. Neurological Manifestations in B12 Deficiency',
        headingAr: '3. التظاهرات العصبية المميزة لعوز B12',
        paragraphs: [
          'Vitamin B12 deficiency can cause peripheral neuropathy and other neurologic abnormalities; isolated folate deficiency does not typically produce the same neurologic syndrome. Both can cause macrocytosis and megaloblastic blood-film changes.'
        ]
      },
      {
        id: 'topic-heme-07-s4',
        heading: '4. Clinical safety point',
        headingEn: '4. Critical Clinical Safety Rule',
        headingAr: '4. تنبيه سريري حرج قبل إعطاء حمض الفوليك',
        paragraphs: [
          'Replace the deficient vitamin and treat the underlying cause. Do not give folic acid alone when B12 deficiency is possible: the anemia may improve while B12-related neurological injury continues. Reticulocytosis after effective replacement is an expected marrow response.'
        ]
      },
      {
        id: 'topic-heme-07-s5',
        heading: '5. MCQ anchors',
        headingEn: '5. MCQ Anchors',
        headingAr: '5. ركائز الأسئلة الامتحانية',
        paragraphs: [
          'B12 absorption → intrinsic factor + terminal ileum. Folate absorption → proximal small intestine. Hypersegmented neutrophils → megaloblastic anemia. Neurologic manifestations → think B12 deficiency.'
        ]
      }
    ],
    images: [],
    links: [],
    attachments: []
  },
  {
    id: 'topic-heme-08',
    title: 'فقر الدم الانحلالي والاختبارات المخبرية',
    titleEn: 'Hemolytic Anemia and Laboratory Workup',
    titleAr: 'فقر الدم الانحلالي والاختبارات المخبرية التشخيصية',
    subtitle: 'Hemolytic Anemia and Hemolysis Workup',
    category: 'Medical',
    blockId: 'block-hematology',
    subjectId: 'subj-hematology',
    author: 'UMEDT Study Series · Hematology',
    publishedAt: 'نوفمبر 2026',
    readingTimeMinutes: 9,
    favorite: false,
    sections: [
      {
        id: 'topic-heme-08-s1',
        heading: '1. Definition and classification',
        headingEn: '1. Definition and Classification of Hemolysis',
        headingAr: '1. تعريف وتصنيف انحلال الدم',
        paragraphs: [
          'Hemolytic anemia occurs when RBC destruction exceeds marrow replacement. Normal RBC lifespan is approximately 120 days. Hemolysis may be intravascular (within blood vessels) or extravascular (mainly macrophages in spleen and liver). Causes may be intrinsic to RBCs (membrane, enzyme, hemoglobin defects) or extrinsic (immune, infection, drugs, or mechanical injury).'
        ]
      },
      {
        id: 'topic-heme-08-s2',
        heading: '2. Laboratory pattern',
        headingEn: '2. Biochemical & Hematologic Markers of Hemolysis',
        headingAr: '2. الواسمات الكيميائية والدموية للانحلال',
        paragraphs: [
          'Typical findings include increased reticulocytes, increased unconjugated bilirubin, increased LDH, and reduced haptoglobin; urine findings depend on whether intravascular hemolysis is present. The blood film may show polychromasia and characteristic abnormal forms. A direct antiglobulin test (DAT/Direct Coombs) supports immune-mediated hemolysis when positive, but must be interpreted with the clinical picture.'
        ]
      },
      {
        id: 'topic-heme-08-s3',
        heading: '3. Intravascular versus extravascular',
        headingEn: '3. Intravascular vs. Extravascular Hemolysis',
        headingAr: '3. الانحلال داخل الأوعية مقابل الانحلال خارج الأوعية',
        paragraphs: [
          'Intravascular hemolysis may cause hemoglobinemia, hemoglobinuria, and marked haptoglobin consumption. Extravascular hemolysis is mediated by macrophages in spleen/liver and may cause splenomegaly and jaundice. These patterns overlap; do not treat one laboratory marker as diagnostic alone.'
        ]
      },
      {
        id: 'topic-heme-08-s4',
        heading: '4. Important causes',
        headingEn: '4. Major Intrinsic and Extrinsic Causes',
        headingAr: '4. أهم الأسباب الذاتية والخارجية',
        paragraphs: [
          'Intrinsic causes include hereditary spherocytosis, G6PD deficiency, pyruvate kinase deficiency, sickle cell disease, and thalassemia. Extrinsic causes include autoimmune hemolytic anemia, infections, drugs, and microangiopathic processes. The smear and targeted tests help identify the mechanism.'
        ]
      },
      {
        id: 'topic-heme-08-s5',
        heading: '5. MCQ reasoning',
        headingEn: '5. Clinical & Exam Reasoning',
        headingAr: '5. الاستدلال الامتحاني والسريري',
        paragraphs: [
          'High reticulocytes + high unconjugated bilirubin supports hemolysis. Low reticulocytes in an acutely anemic patient suggests impaired production or aplastic crisis rather than a typical compensatory hemolytic response. DAT positivity points toward immune-mediated destruction.'
        ]
      }
    ],
    images: [],
    links: [],
    attachments: []
  },
  {
    id: 'topic-heme-09',
    title: 'فشل نخاع العظم وقلة خلايا الدم الشاملة',
    titleEn: 'Bone Marrow Failure, Aplastic Anemia, and Pancytopenia',
    titleAr: 'فشل نخاع العظم وفقر الدم اللاتنسجي وقلة الكريات الشاملة',
    subtitle: 'Bone Marrow Failure, Aplastic Anemia, and Pancytopenia',
    category: 'Medical',
    blockId: 'block-hematology',
    subjectId: 'subj-hematology',
    author: 'UMEDT Study Series · Hematology',
    publishedAt: 'نوفمبر 2026',
    readingTimeMinutes: 8,
    favorite: false,
    sections: [
      {
        id: 'topic-heme-09-s1',
        heading: '1. Definitions',
        headingEn: '1. Core Definitions: Pancytopenia vs. Aplastic Anemia',
        headingAr: '1. تعاريف أساسية: قلة الكريات الشاملة وفقر الدم اللاتنسجي',
        paragraphs: [
          'Pancytopenia means reduction in all three major blood-cell lines: RBCs, WBCs, and platelets. Aplastic anemia is a bone-marrow failure syndrome commonly producing pancytopenia with a hypocellular marrow. Pure red cell aplasia selectively reduces erythroid precursors, causing anemia and reticulocytopenia while other lineages may be relatively preserved.'
        ]
      },
      {
        id: 'topic-heme-09-s2',
        heading: '2. Causes and clues',
        headingEn: '2. Acquired and Inherited Causes',
        headingAr: '2. الأسباب المكتسبة والوراثية',
        paragraphs: [
          'Acquired marrow suppression may follow drugs, toxins, radiation, infections, or immune-mediated injury; some cases are idiopathic. Inherited marrow-failure syndromes include Fanconi anemia and other congenital disorders, sometimes associated with physical abnormalities. Parvovirus B19 can transiently suppress erythropoiesis and precipitate aplastic crisis, especially in chronic hemolytic disease.'
        ]
      },
      {
        id: 'topic-heme-09-s3',
        heading: '3. Diagnostic approach',
        headingEn: '3. Diagnostic Evaluation of Pancytopenia',
        headingAr: '3. المقاربة التشخيصية لقلة الكريات الشاملة',
        paragraphs: [
          'Repeat CBC and peripheral smear, review medications/exposures and infection history, assess reticulocytes, and investigate nutritional, infectious, immune, and marrow causes. Bone marrow examination may be required. Pancytopenia is a finding, not a final diagnosis.'
        ]
      },
      {
        id: 'topic-heme-09-s4',
        heading: '4. Differentiating pure red cell aplasia',
        headingEn: '4. Differentiating Pure Red Cell Aplasia (PRCA)',
        headingAr: '4. تمييز عدم تنسج الكريات الحمر النقي',
        paragraphs: [
          'Pure red cell aplasia typically presents with anemia and very low reticulocytes, with markedly reduced erythroid precursors in marrow. In uncomplicated non-immune aplasia, bilirubin is not expected to rise from hemolysis. Compare this with hemolytic anemia, where reticulocytes usually rise if marrow reserve is adequate.'
        ]
      },
      {
        id: 'topic-heme-09-s5',
        heading: '5. Exam anchors',
        headingEn: '5. Exam Anchors',
        headingAr: '5. ركائز الامتحان',
        paragraphs: [
          'Pancytopenia = low RBCs + WBCs + platelets. Aplastic anemia = marrow failure and hypocellularity. Pure red cell aplasia = selective erythroid precursor loss + low reticulocytes.'
        ]
      }
    ],
    images: [],
    links: [],
    attachments: []
  },
  {
    id: 'topic-heme-10',
    title: 'كريات الدم البيضاء والمناعة والتفريق العددي',
    titleEn: 'Leukocytes, Differential Count, and Immune Functions',
    titleAr: 'كريات الدم البيضاء والصيغة التفريقية والوظائف المناعية',
    subtitle: 'Leukocytes, Differential Count, and Immune Functions',
    category: 'Medical',
    blockId: 'block-hematology',
    subjectId: 'subj-hematology',
    author: 'UMEDT Study Series · Hematology',
    publishedAt: 'نوفمبر 2026',
    readingTimeMinutes: 9,
    favorite: false,
    sections: [
      {
        id: 'topic-heme-10-s1',
        heading: '1. Leukocyte overview',
        headingEn: '1. Overview of Circulating Leukocytes',
        headingAr: '1. نظرة عامة على كريات الدم البيضاء الجائلة',
        paragraphs: [
          'Leukocytes protect against infection and participate in inflammation and adaptive immunity. The main circulating types are neutrophils, lymphocytes, monocytes, eosinophils, and basophils. Differential count reports the proportion or absolute number of each type; absolute counts are often more clinically informative than percentages alone.'
        ]
      },
      {
        id: 'topic-heme-10-s2',
        heading: '2. Granulocytes',
        headingEn: '2. Granulocytes: Neutrophils, Eosinophils, and Basophils',
        headingAr: '2. المحببات: العدلات والحمضات والقعدات',
        paragraphs: [
          'Neutrophils are usually the most abundant circulating leukocytes and are central to acute bacterial defense and phagocytosis. Eosinophils participate in responses to helminths and allergic disease; their granules contain major basic protein. Basophils contain histamine and heparin and participate in IgE-associated immediate hypersensitivity.'
        ]
      },
      {
        id: 'topic-heme-10-s3',
        heading: '3. Monocytes and lymphocytes',
        headingEn: '3. Monocytes, Tissue Macrophages, and Lymphocytes',
        headingAr: '3. الوحيدات والبلعميات النسيجية واللمفاويات',
        paragraphs: [
          'Monocytes circulate in blood and can differentiate into macrophages in tissues. Tissue-specific macrophages include Kupffer cells in liver, microglia in CNS, and osteoclasts in bone. B lymphocytes can differentiate into antibody-secreting plasma cells; T lymphocytes mediate cellular immunity and mature in the thymus.'
        ]
      },
      {
        id: 'topic-heme-10-s4',
        heading: '4. WBC count patterns',
        headingEn: '4. Clinical Patterns of Leukocytosis and Leukopenia',
        headingAr: '4. الأنماط السريرية لارتفاع وانخفاض الكريات البيض',
        paragraphs: [
          'Neutrophilia may occur in bacterial infection, inflammation, stress, or corticosteroid exposure. Neutropenia may occur with viral infections, drugs, marrow suppression, or severe sepsis. Eosinophilia suggests parasitic infection or allergic/drug-related disease in the right context. A left shift means increased immature neutrophil forms, especially band cells.'
        ]
      },
      {
        id: 'topic-heme-10-s5',
        heading: '5. Exam clues',
        headingEn: '5. High-Yield Exam Clues',
        headingAr: '5. مفاتيح امتحانية',
        paragraphs: [
          'Most abundant WBC → neutrophil. Helminth defense → eosinophil/major basic protein. Histamine → basophil/mast-cell pathway. Monocyte in tissue → macrophage. Left shift → increased immature neutrophils.'
        ]
      }
    ],
    images: [],
    links: [],
    attachments: []
  },
  {
    id: 'topic-heme-11',
    title: 'اللوكيميا الحادة والمزمنة ومبادئ التشخيص',
    titleEn: 'Leukemia: Acute and Chronic Diagnostic Patterns',
    titleAr: 'ابيضاض الدم (اللوكيميا) الحاد والمزمن ومبادئ التشخيص',
    subtitle: 'Leukemia: Acute and Chronic Patterns',
    category: 'Medical',
    blockId: 'block-hematology',
    subjectId: 'subj-hematology',
    author: 'UMEDT Study Series · Hematology',
    publishedAt: 'نوفمبر 2026',
    readingTimeMinutes: 10,
    favorite: false,
    sections: [
      {
        id: 'topic-heme-11-s1',
        heading: '1. Definition and classification',
        headingEn: '1. Definition and Broad Classification',
        headingAr: '1. التعريف والتصنيف العام للوكيميا',
        paragraphs: [
          'Leukemia is a clonal malignant proliferation of hematopoietic cells involving bone marrow and often peripheral blood. Broad classification is myeloid versus lymphoid, and acute versus chronic. Acute leukemias are characterized by accumulation of immature blasts and typically present rapidly; chronic leukemias often involve more mature-appearing cells and may evolve more slowly.'
        ]
      },
      {
        id: 'topic-heme-11-s2',
        heading: '2. Acute leukemia',
        headingEn: '2. Clinical and Marrow Features of Acute Leukemia',
        headingAr: '2. المظاهر السريرية والنخاعية للوكيميا الحادة',
        paragraphs: [
          'Acute leukemia replaces normal marrow, causing anemia, thrombocytopenia, and neutropenia or dysfunctional leukocytes. Common clinical manifestations include fatigue/pallor, infections/fever, bruising/bleeding, bone pain, and sometimes organ infiltration. Diagnosis requires blood and marrow evaluation with morphology, immunophenotyping, cytogenetic, and molecular studies.'
        ]
      },
      {
        id: 'topic-heme-11-s3',
        heading: '3. AML versus ALL',
        headingEn: '3. Distinguishing AML from ALL',
        headingAr: '3. التفريق بين ابيضاض الدم النقوي الحاد (AML) واللمفاوي الحاد (ALL)',
        paragraphs: [
          'Acute myeloid leukemia (AML) arises from myeloid precursors; acute lymphoblastic leukemia (ALL) arises from lymphoid precursors and is common in childhood. Myeloperoxidase positivity supports myeloid lineage; lymphoid lineage is established by immunophenotypic markers. Do not diagnose lineage from age or one symptom alone.'
        ]
      },
      {
        id: 'topic-heme-11-s4',
        heading: '4. Chronic leukemia concepts',
        headingEn: '4. Chronic Myeloid Leukemia (CML) and CLL',
        headingAr: '4. اللوكيميا النقوية المزمنة (CML) واللمفاوية المزمنة (CLL)',
        paragraphs: [
          'Chronic myeloid leukemia (CML) is associated with the BCR::ABL1 fusion (Philadelphia chromosome) and proliferation of granulocytic cells. In chronic phase, cells may be relatively mature; progression to accelerated/blast phase produces more immature and dysfunctional cells. Chronic lymphocytic leukemia (CLL) involves clonal mature B lymphocytes and is usually a disease of older adults.'
        ]
      },
      {
        id: 'topic-heme-11-s5',
        heading: '5. Exam reasoning',
        headingEn: '5. High-Yield Exam Reasoning',
        headingAr: '5. الاستدلال الامتحاني',
        paragraphs: [
          'Blasts + marrow failure symptoms suggest acute leukemia. Auer rods and MPO support AML. BCR::ABL1/Philadelphia chromosome suggests CML. ALL is a major childhood acute leukemia. A high WBC count does not guarantee effective immunity; leukemic cells may be functionally defective.'
        ]
      }
    ],
    images: [],
    links: [],
    attachments: []
  },
  {
    id: 'topic-heme-12',
    title: 'الإرقاء والتخثر والصفائح الدموية',
    titleEn: 'Hemostasis, Platelets, and Coagulation Cascade',
    titleAr: 'الإرقاء والصفائح الدموية وشلال التخثر',
    subtitle: 'Hemostasis, Platelets, and Coagulation',
    category: 'Medical',
    blockId: 'block-hematology',
    subjectId: 'subj-hematology',
    author: 'UMEDT Study Series · Hematology',
    publishedAt: 'نوفمبر 2026',
    readingTimeMinutes: 9,
    favorite: false,
    sections: [
      {
        id: 'topic-heme-12-s1',
        heading: '1. Primary hemostasis',
        headingEn: '1. Primary Hemostasis: Platelet Plug Formation',
        headingAr: '1. الإرقاء الأولي وتكوين السدادة الصفيحية',
        paragraphs: [
          'Vascular injury causes vasoconstriction and exposes subendothelial collagen. Platelets adhere through von Willebrand factor (vWF) and platelet GPIb, become activated, and aggregate through GPIIb/IIIa binding fibrinogen. This forms the initial platelet plug. Disorders of platelet number or function commonly cause mucocutaneous bleeding.'
        ]
      },
      {
        id: 'topic-heme-12-s2',
        heading: '2. Secondary hemostasis',
        headingEn: '2. Secondary Hemostasis: Coagulation Pathways (PT/INR & aPTT)',
        headingAr: '2. الإرقاء الثانوي ومسارات التخثر',
        paragraphs: [
          'Coagulation factors generate thrombin, which converts fibrinogen to fibrin. Fibrin stabilizes the platelet plug. The intrinsic and extrinsic pathways converge on factor X and the common pathway. PT/INR assesses the extrinsic/common pathway (especially factor VII and common factors); aPTT assesses intrinsic/common pathway factors. Interpret tests with medication and clinical context.'
        ]
      },
      {
        id: 'topic-heme-12-s3',
        heading: '3. Platelets and clinical patterns',
        headingEn: '3. Bleeding Patterns: Platelet vs. Coagulation Factor Defects',
        headingAr: '3. أنماط النزف: اضطرابات الصفائح مقابل عوامل التخثر',
        paragraphs: [
          'Thrombocytopenia or platelet dysfunction often causes petechiae, purpura, epistaxis, gum bleeding, or heavy menstrual bleeding. Coagulation-factor deficiencies more often cause deep tissue bleeding, hemarthrosis, or delayed bleeding. These are useful patterns, not absolute rules.'
        ]
      },
      {
        id: 'topic-heme-12-s4',
        heading: '4. Fibrinolysis and DIC',
        headingEn: '4. Fibrinolysis and Disseminated Intravascular Coagulation (DIC)',
        headingAr: '4. انحلال الفبرين والتخثر المنتشر داخل الأوعية (DIC)',
        paragraphs: [
          'Plasmin breaks down fibrin during fibrinolysis; D-dimer reflects breakdown of cross-linked fibrin. Disseminated intravascular coagulation (DIC) is systemic activation of coagulation with consumption of platelets and factors, causing both thrombosis and bleeding. Typical tests may show low platelets, prolonged PT/aPTT, low fibrinogen, and elevated D-dimer, depending on timing and cause.'
        ]
      },
      {
        id: 'topic-heme-12-s5',
        heading: '5. High-yield comparisons',
        headingEn: '5. High-Yield Comparisons',
        headingAr: '5. مقارنات امتحانية مركزة',
        paragraphs: [
          'vWF: platelet adhesion; GPIIb/IIIa: platelet aggregation; thrombin: fibrinogen → fibrin; plasmin: fibrin breakdown. PT/INR: extrinsic/common. aPTT: intrinsic/common. DIC: consumption coagulopathy with simultaneous clotting and bleeding.'
        ]
      }
    ],
    images: [],
    links: [],
    attachments: []
  },
  {
    id: 'topic-heme-13',
    title: 'فصائل الدم ونقل الدم والأنسجة اللمفاوية',
    titleEn: 'ABO/Rh Blood Groups, Transfusion Medicine, and Lymphoid Histology',
    titleAr: 'فصائل الدم ABO/Rh ونقل الدم وهستولوجيا الأعضاء اللمفاوية',
    subtitle: 'ABO/Rh Blood Groups, Transfusion, and Lymphoid Histology',
    category: 'Medical',
    blockId: 'block-hematology',
    subjectId: 'subj-hematology',
    author: 'UMEDT Study Series · Hematology',
    publishedAt: 'نوفمبر 2026',
    readingTimeMinutes: 11,
    favorite: false,
    sections: [
      {
        id: 'topic-heme-13-s1',
        heading: '1. ABO and Rh basics',
        headingEn: '1. ABO and RhD Antigen-Antibody Systems',
        headingAr: '1. أساسيات نظامي ABO و RhD',
        paragraphs: [
          'ABO blood groups depend on A and/or B antigens on RBC membranes and naturally occurring plasma antibodies. Group A has A antigen and anti-B; group B has B antigen and anti-A; group AB has both antigens and neither anti-A nor anti-B; group O has neither antigen and has both antibodies. RhD status depends on the D antigen; anti-D is generally an immune antibody formed after exposure.'
        ]
      },
      {
        id: 'topic-heme-13-s2',
        heading: '2. Transfusion safety',
        headingEn: '2. Compatibility Testing and Transfusion Safety',
        headingAr: '2. اختبارات التوافق وسلامة نقل الدم',
        paragraphs: [
          'ABO-incompatible RBC transfusion can cause severe acute intravascular hemolysis. Compatibility testing includes blood grouping, antibody screening, and crossmatching according to clinical policy. Emergency transfusion decisions follow local protocols and must account for pregnancy, prior antibodies, and component type; do not rely on simplified universal-donor slogans without context.'
        ]
      },
      {
        id: 'topic-heme-13-s3',
        heading: '3. Primary and secondary lymphoid organs',
        headingEn: '3. Primary vs. Secondary Lymphoid Organs',
        headingAr: '3. الأعضاء اللمفاوية الأولية والثانوية',
        paragraphs: [
          'Primary lymphoid organs are sites of lymphocyte development/maturation: bone marrow for B-cell development and thymus for T-cell maturation. Secondary lymphoid organs include lymph nodes, spleen, and mucosa-associated lymphoid tissue (MALT), where immune responses are initiated.'
        ]
      },
      {
        id: 'topic-heme-13-s4',
        heading: '4. Histology: lymph node, spleen, thymus',
        headingEn: '4. Histological Architecture: Lymph Node, Spleen, and Thymus',
        headingAr: '4. البنية النسيجية للعقدة اللمفاوية والطحال والغدة الزعترية',
        paragraphs: [
          'Lymph node: cortex contains B-cell follicles; paracortex is T-cell rich; medulla contains cords and sinuses. Spleen: white pulp is lymphoid tissue around central arterioles; PALS is T-cell rich; red pulp contains splenic cords (cords of Billroth) and sinusoids and filters blood. Thymus has cortex and medulla; Hassall corpuscles are characteristic of the medulla, and the thymus is not organized into typical lymphoid follicles.'
        ]
      },
      {
        id: 'topic-heme-13-s5',
        heading: '5. MALT and Peyer\'s patches',
        headingEn: '5. MALT, GALT, BALT, and Peyer\'s Patches',
        headingAr: '5. النسيج اللمفاوي المخاطي ولويحات باير',
        paragraphs: [
          "MALT is lymphoid tissue associated with mucosal surfaces. GALT is in the gastrointestinal tract, BALT in the respiratory tract. Peyer's patches are aggregated lymphoid nodules in the ileum. Lymph follicles may be primary or secondary; a secondary follicle has a germinal center."
        ]
      },
      {
        id: 'topic-heme-13-s6',
        heading: '6. Histology MCQ anchors',
        headingEn: '6. Histology MCQ Anchors',
        headingAr: '6. ركائز أسئلة الهستولوجيا',
        paragraphs: [
          "T-cell maturation → thymus. T-cell zone of spleen → PALS. Spleen red pulp → cords of Billroth and sinusoids. Hassall corpuscles → thymic medulla. Peyer's patches → ileum. GALT → gastrointestinal mucosa."
        ]
      }
    ],
    images: [],
    links: [],
    attachments: []
  }
];
