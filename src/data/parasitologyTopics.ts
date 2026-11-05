import { TopicArticle } from '../types/lexicon';

export const PARASITOLOGY_TOPICS: TopicArticle[] = [
  {
    "id": "pt-parasito-01-foundations",
    "title": "أساسيات علم الطفيليات وتصنيف الديدان وطرق الانتقال",
    "subtitle": "General Concepts • Classification • Hosts • Transmission",
    "category": "Medical",
    "author": "UMEDT — Parasitology Practical Course",
    "publishedAt": "November 2026",
    "readingTimeMinutes": 35,
    "favorite": true,
    "sections": [
      {
        "id": "p1-s1",
        "heading": "1. Core definitions — احفظ التعريف الإنجليزي كما هو",
        "paragraphs": [
          "Endoparasites: parasites that live inside the body of their host. أمثلة المقرر: Ascaris lumbricoides, Ancylostoma, Entamoeba histolytica.",
          "Ectoparasites: parasites that live on the outer surface of their host. أمثلة: Fleas, lice (Pediculus), ticks and mites.",
          "Obligate parasites: cannot live or reproduce without their host؛ تعتمد كلياً على العائل. أمثلة تعليمية في المقرر: Plasmodium وTrichinella spiralis.",
          "Facultative parasites: normally free-living or non-parasitic organisms that may become parasitic under certain conditions. مثال مذكور: Acanthamoeba spp.",
          "Accidental parasites: infect an unusual or unnatural host rather than their usual natural host. Temporary parasites: contact the host only for feeding, then leave. Opportunistic parasites: cause disease particularly when host defenses are impaired (immunocompromised host)."
        ]
      },
      {
        "id": "p1-s2",
        "heading": "2. Routes of transmission — اربط الطريق بالمثال",
        "paragraphs": [
          "Direct transmission: انتقال مباشر من شخص إلى آخر بالتلامس أو انتقال الطور المعدي مباشرة.",
          "Vertical transmission: mother-to-child transmission during pregnancy or delivery.",
          "Indirect transmission: عبر وسيط غير حي مثل contaminated food, water, soil أو عبر Vector.",
          "Percutaneous transmission: دخول الطفيل باختراق الجلد مباشرة؛ المثال الأهم في هذا المقرر Schistosoma cercariae، وكذلك filariform L3 of Strongyloides.",
          "تمييز مهم: Vector كائن حي ينقل العامل الممرض؛ أما contaminated water/food/soil فهي vehicles أو مصادر انتقال غير حية."
        ]
      },
      {
        "id": "p1-s3",
        "heading": "3. Helminths taxonomy — خريطة التصنيف",
        "paragraphs": [
          "Helminths in this guide are grouped into two major phyla: Nemathelminthes / Nematoda (roundworms) and Platyhelminthes (flatworms).",
          "Nematoda: Intestinal nematodes مثل Ascaris, Trichuris, Enterobius, Strongyloides؛ وBlood/Tissue nematodes مثل Loa loa.",
          "Platyhelminthes: Class Cestoda (tapeworms) وتشمل Taenia, Hymenolepis, Diphyllobothrium, Echinococcus؛ وClass Trematoda (flukes) وتشمل Fasciola, Schistosoma, Heterophyes.",
          "Spelling correction: الصحيح Trematoda وflukes، وليس flucks. احفظ التصنيف كما يرد في محاضرتك إذا كان الدكتور يستخدم تسمية أقدم."
        ]
      },
      {
        "id": "p1-s4",
        "heading": "4. Practical learning map — ماذا تتعرف عليه في الشريحة؟",
        "paragraphs": [
          "لكل parasite درّب نفسك على ستة مفاتيح: (1) الاسم العلمي، (2) common name، (3) habitat، (4) infective stage / mode of infection، (5) diagnostic stage and specimen، (6) distinctive morphology.",
          "لا تخلط بين Infective stage الذي يدخل الإنسان وبين Diagnostic stage الذي نبحث عنه في العينة. مثال: Strongyloides infective stage = filariform L3؛ أما الشائع في stool diagnosis فهو rhabditiform larva.",
          "في أسئلة الصور ابدأ بالشكل العام ثم العلامة الفارقة: spine, polar plugs, operculum, polar filaments, rostellum/hooks, uterine branches."
        ]
      }
    ],
    "images": [],
    "links": [
      {
        "id": "p1-l1",
        "title": "CDC DPDx — Laboratory Identification of Parasites",
        "url": "https://www.cdc.gov/dpdx/",
        "description": "مرجع صور وتشخيص مخبري للطفيليات."
      },
      {
        "id": "p1-l2",
        "title": "Sketchfab — Helminth 3D model search",
        "url": "https://sketchfab.com/search?type=models&q=helminth%20parasite",
        "description": "ابحث عن نماذج ثلاثية الأبعاد للديدان؛ النماذج مقدمة من ناشرين مستقلين."
      }
    ],
    "attachments": []
  },
  {
    "id": "pt-parasito-02-nematodes-intestinal",
    "title": "الديدان الأسطوانية المعوية — Nematodes Diagnostic Atlas",
    "subtitle": "Ascaris • Trichuris • Enterobius • Strongyloides",
    "category": "Medical",
    "author": "UMEDT — Parasitology Practical Course",
    "publishedAt": "November 2026",
    "readingTimeMinutes": 65,
    "favorite": true,
    "sections": [
      {
        "id": "p2-s1",
        "heading": "1. Ascaris lumbricoides — Roundworm",
        "paragraphs": [
          "Habitat: small intestine. Mode of infection: ingestion of embryonated eggs in contaminated food/water. The infective egg is embryonated; eggs are passed in stool and mature in soil.",
          "Adult morphology: female is larger with a relatively straight posterior end; male is smaller with a curved/coiled posterior end. The anterior end has three lips.",
          "Egg identification: fertilized egg is rounded/oval with a thick shell and mammillated outer coat; unfertilized egg is longer, larger, and has irregular mammillations with granular contents. Decorticated eggs have lost the outer mammillated coat.",
          "Practical spotter: distinguish male vs female by posterior end; distinguish fertilized vs unfertilized egg by shape, shell and contents. Diagnostic specimen is stool for eggs; adult worms may occasionally be passed."
        ]
      },
      {
        "id": "p2-s2",
        "heading": "2. Trichuris trichiura — Whipworm",
        "paragraphs": [
          "Habitat: large intestine, especially caecum and appendix. Infection follows ingestion of embryonated eggs from contaminated food or water.",
          "Adult morphology: whip-shaped worm; long thin anterior portion and thicker posterior portion. Female posterior end is straight; male posterior end is coiled.",
          "Diagnostic egg: barrel/lemon-shaped, thick shell, with two bipolar plugs (polar plugs) — one at each pole. This is the most important image-recognition clue.",
          "Common name mnemonic: Whipworm → whip-like body; bipolar plugs → Trichuris egg."
        ]
      },
      {
        "id": "p2-s3",
        "heading": "3. Enterobius vermicularis — Pinworm",
        "paragraphs": [
          "Habitat: caecum, appendix and ascending colon. Transmission: ingestion of infective eggs from contaminated fingers/surfaces; autoinfection may occur, and retroinfection is described in the course.",
          "Adult female: relatively long, slender body with a long pointed posterior tail; male is smaller with a blunt/coiled posterior end.",
          "Egg: asymmetrical, planoconvex / D-shaped (one side flattened), usually identified by the perianal cellophane-tape test rather than routine stool examination.",
          "Course treatment list: Mebendazole or Piperazine. Use the prescribed lecture reference for exam recall; actual treatment depends on current clinical guidance and patient context."
        ]
      },
      {
        "id": "p2-s4",
        "heading": "4. Strongyloides stercoralis — Threadworm",
        "paragraphs": [
          "Habitat: parasitic adult females live in the small intestine, particularly duodenum and jejunum. Infective stage: filariform larva (L3), which penetrates the skin.",
          "Diagnostic clue: rhabditiform larva is commonly detected in stool. Its rhabditoid esophagus has a short anterior corpus, a postmedian constriction (isthmus), and a posterior bulb.",
          "Do not confuse the two larval forms: Rhabditiform = diagnostic in stool; Filariform L3 = infective and skin-penetrating. Autoinfection can maintain infection and may lead to hyperinfection in immunosuppressed patients.",
          "The supplied guide lists thiabendazole and ivermectin; ivermectin is generally the preferred treatment in current clinical references. Drug choice/dose is outside this practical identification lesson."
        ]
      },
      {
        "id": "p2-s5",
        "heading": "5. Rapid comparison — intestinal nematodes",
        "paragraphs": [
          "Ascaris: embryonated egg ingestion; small intestine; fertilized egg thick/mammillated; unfertilized egg elongated.",
          "Trichuris: embryonated egg ingestion; caecum/appendix; barrel-shaped egg with bipolar plugs; adult whip-shaped.",
          "Enterobius: hand-to-mouth egg ingestion; caecum/colon; D-shaped egg; perianal tape test; pointed female tail.",
          "Strongyloides: skin penetration by L3; duodenum/jejunum; rhabditiform larva in stool; prominent rhabditoid esophagus; autoinfection.",
          "Memory key: Ascaris = mammillated; Trichuris = two plugs; Enterobius = one flat side; Strongyloides = larva in stool."
        ]
      }
    ],
    "images": [
      {
        "id": "p2-img1",
        "url": "https://www.cdc.gov/dpdx/ascariasis/images/5/Ascaris_female.jpg?_=01101",
        "caption": "Adult female Ascaris lumbricoides — CDC DPDx."
      }
    ],
    "links": [
      {
        "id": "p2-l1",
        "title": "CDC DPDx — Ascariasis (images, life cycle and diagnosis)",
        "url": "https://www.cdc.gov/dpdx/ascariasis/",
        "description": "صور البيوض والديدان البالغة ومراحل دورة الحياة."
      },
      {
        "id": "p2-l2",
        "title": "CDC DPDx — Trichuriasis",
        "url": "https://www.cdc.gov/dpdx/trichuriasis/",
        "description": "صور بيضة Trichuris ذات القطبين والديدان البالغة."
      },
      {
        "id": "p2-l3",
        "title": "CDC DPDx — Enterobiasis",
        "url": "https://www.cdc.gov/dpdx/enterobiasis/",
        "description": "صور Enterobius والبيض والاختبار التشخيصي."
      },
      {
        "id": "p2-l4",
        "title": "CDC DPDx — Strongyloidiasis",
        "url": "https://www.cdc.gov/dpdx/strongyloidiasis/",
        "description": "صور Rhabditiform وFilariform larvae ودورة الحياة."
      },
      {
        "id": "p2-l5",
        "title": "Sketchfab — Ascaris 3D model search",
        "url": "https://sketchfab.com/search?type=models&q=Ascaris%20lumbricoides",
        "description": "نتائج نماذج ثلاثية الأبعاد؛ تحقق من اسم النموذج ومصدره قبل الاعتماد عليه."
      }
    ],
    "attachments": []
  },
  {
    "id": "pt-parasito-03-nematodes-filaria",
    "title": "الديدان الخيطية والأنسجة — Loa loa",
    "subtitle": "Subcutaneous Filarial Worms • Microfilaria • Vector",
    "category": "Medical",
    "author": "UMEDT — Parasitology Practical Course",
    "publishedAt": "November 2026",
    "readingTimeMinutes": 30,
    "favorite": false,
    "sections": [
      {
        "id": "p3-s1",
        "heading": "1. Loa loa — African eye worm",
        "paragraphs": [
          "Habitat: subcutaneous tissue; adult worm may migrate across the subconjunctiva. Common name: African eye worm.",
          "Vector: Chrysops fly (day-biting deer fly). Infective stage: third-stage filariform larva (L3) transmitted during the bite and entering through the wound.",
          "Adult female is longer than the male. The course sheet describes female around 2–2.5 cm and male around 1–1.5 cm; CDC DPDx gives larger adult measurements, so prioritize the exact range printed in the practical guide for its spotter question.",
          "Diagnostic morphology: sheathed microfilaria in peripheral blood film; nuclei extend all the way to the tip of the tail. Microfilariae show diurnal periodicity, so blood collection is best around midday (approximately 10 AM–2 PM)."
        ]
      },
      {
        "id": "p3-s2",
        "heading": "2. Practical identification checklist",
        "paragraphs": [
          "If the image is a blood smear containing a sheathed microfilaria with nuclei reaching the tail tip, think Loa loa.",
          "If the question mentions an African eye worm, Calabar swelling, or a Chrysops bite, the intended answer is Loa loa.",
          "Do not confuse the adult habitat with the diagnostic specimen: adults are subcutaneous; microfilariae are identified in peripheral blood."
        ]
      }
    ],
    "images": [
      {
        "id": "p3-img1",
        "url": "https://www.cdc.gov/dpdx/loiasis/images/1/L_loa_whole_HBc.jpg?_=02222",
        "caption": "Loa loa microfilaria in a Giemsa-stained blood smear — CDC DPDx."
      }
    ],
    "links": [
      {
        "id": "p3-l1",
        "title": "CDC DPDx — Loiasis",
        "url": "https://www.cdc.gov/dpdx/loiasis/",
        "description": "صور microfilaria والديدان البالغة، vector ودورة الحياة."
      },
      {
        "id": "p3-l2",
        "title": "Sketchfab — Filarial worm 3D model search",
        "url": "https://sketchfab.com/search?type=models&q=filarial%20worm",
        "description": "بحث عن نماذج ثلاثية الأبعاد للديدان الخيطية."
      }
    ],
    "attachments": []
  },
  {
    "id": "pt-parasito-04-cestodes",
    "title": "الديدان الشريطية — Cestodes Diagnostic Atlas",
    "subtitle": "Taenia solium • Taenia saginata • Hymenolepis nana • Diphyllobothrium • Echinococcus",
    "category": "Medical",
    "author": "UMEDT — Parasitology Practical Course",
    "publishedAt": "November 2026",
    "readingTimeMinutes": 75,
    "favorite": true,
    "sections": [
      {
        "id": "p4-s1",
        "heading": "1. Taenia solium — Pork tapeworm",
        "paragraphs": [
          "Habitat: small intestine, mainly jejunum and ileum. Human intestinal taeniasis follows ingestion of undercooked pork containing cysticerci. Important distinction: ingestion of T. solium eggs can cause cysticercosis; ingestion of cysticerci in pork causes intestinal taeniasis.",
          "Scolex: globular, four suckers, armed rostellum with two rows of hooks. Adult has lateral genital pore. Taenia egg is spherical with a radially striated embryophore and a hexacanth embryo (six hooklets).",
          "Gravid proglottid: central uterine stem with about 7–13 primary lateral branches (often taught as fewer than 12). Mature segments are approximately square and have a lateral genital pore.",
          "Cysticercus cellulosae: fluid-filled thin-walled cyst with an invaginated scolex, suckers and hooks."
        ]
      },
      {
        "id": "p4-s2",
        "heading": "2. Taenia saginata — Beef tapeworm",
        "paragraphs": [
          "Infection: ingestion of raw/undercooked beef containing Cysticercus bovis. Habitat: small intestine. Scolex: quadrate with four suckers; no rostellum and no hooks (unarmed scolex).",
          "Gravid proglottid: uterus has numerous lateral branches, classically 12–30 (more than 12). Mature segments resemble those of T. solium, so the gravid segment is more useful for differentiation.",
          "Taenia spp. eggs are morphologically indistinguishable from one another by routine microscopy. Do not identify T. solium versus T. saginata from the egg alone.",
          "Cysticercus bovis is unarmed: its scolex has suckers but no rostellar hooks. This corrects a contradictory phrase in the supplied handout that mentions chitinized hooks under C. bovis."
        ]
      },
      {
        "id": "p4-s3",
        "heading": "3. H. nana — Dwarf tapeworm",
        "paragraphs": [
          "Egg: oval, with outer hyaline shell and inner embryophore; polar thickenings give rise to polar filaments; contains a hexacanth embryo (six hooklets). Polar filaments are the key practical clue.",
          "Scolex: globular, four suckers, retractile rostellum with a single row of small hooks.",
          "Mature proglottid: broad segment, bilobed ovary and three rounded testes; lateral genital pore. Gravid proglottid is filled with eggs.",
          "Remember: H. nana egg = polar filaments; Taenia egg = radially striated shell and six hooklets but no polar filaments."
        ]
      },
      {
        "id": "p4-s4",
        "heading": "4. Diphyllobothrium latum — Broad fish tapeworm",
        "paragraphs": [
          "Practical structures specified in the course: scolex with two longitudinal sucking grooves called bothria, and an operculated egg.",
          "The egg is oval and operculated; the scolex is elongated rather than globular and bears bothria, not four cup-shaped suckers.",
          "Identification key: operculated egg + bothria → Diphyllobothrium latum."
        ]
      },
      {
        "id": "p4-s5",
        "heading": "5. Echinococcus granulosus — Hydatid cyst",
        "paragraphs": [
          "Adult worm: very small cestode with scolex bearing an armed rostellum (double row of hooks) and usually three segments: immature, mature and a large terminal gravid segment.",
          "Hydatid cyst wall has three layers: pericyst (outer host-derived fibrous layer), ectocyst (laminated acellular layer), and endocyst (inner germinal layer).",
          "The germinal layer forms brood capsules and protoscolices. Protoscolex shows an invaginated scolex with four suckers and a double crown of hooklets.",
          "Spotter words: Hydatid cyst, pericyst, ectocyst, endocyst, brood capsule, protoscolices."
        ]
      },
      {
        "id": "p4-s6",
        "heading": "6. High-yield cestode distinctions",
        "paragraphs": [
          "T. solium: armed scolex + pork + 7–13 uterine branches. T. saginata: unarmed scolex + beef + 12–30 branches.",
          "Taenia egg: spherical, radially striated embryophore, six-hooked embryo; species cannot be distinguished by egg morphology.",
          "H. nana: polar filaments + retractile armed rostellum. D. latum: bothria + operculated egg. E. granulosus: hydatid cyst with three layers and protoscolices.",
          "Exam trap: Taenia solium eggs can cause cysticercosis; do not equate pork-meat cysticercus ingestion with egg ingestion."
        ]
      }
    ],
    "images": [
      {
        "id": "p4-img1",
        "url": "https://www.cdc.gov/dpdx/taeniasis/images/2/Taenia_solium_scolex1.jpg?_=96647",
        "caption": "Taenia solium scolex: four suckers and armed rostellum — CDC DPDx."
      }
    ],
    "links": [
      {
        "id": "p4-l1",
        "title": "CDC DPDx — Taeniasis (Taenia solium and T. saginata)",
        "url": "https://www.cdc.gov/dpdx/taeniasis/",
        "description": "صور السكلِكس والبيض والقطع الحاملة والفرق في uterine branches."
      },
      {
        "id": "p4-l2",
        "title": "CDC DPDx — Hymenolepiasis",
        "url": "https://www.cdc.gov/dpdx/hymenolepiasis/",
        "description": "صور بيضة H. nana ذات polar filaments والقطع البالغة."
      },
      {
        "id": "p4-l3",
        "title": "CDC DPDx — Diphyllobothriasis",
        "url": "https://www.cdc.gov/dpdx/diphyllobothriasis/",
        "description": "صور البيوض ذات operculum والسكلِكس ودورة الحياة."
      },
      {
        "id": "p4-l4",
        "title": "CDC DPDx — Echinococcosis",
        "url": "https://www.cdc.gov/dpdx/echinococcosis/",
        "description": "صور Hydatid cyst وprotoscolices ومعلومات التشخيص."
      },
      {
        "id": "p4-l5",
        "title": "Sketchfab — Taenia scolex 3D model search",
        "url": "https://sketchfab.com/search?type=models&q=Taenia%20scolex",
        "description": "بحث عن مجسمات السكلِكس والديدان الشريطية ثلاثية الأبعاد."
      },
      {
        "id": "p4-l6",
        "title": "Sketchfab — Echinococcus hydatid cyst 3D model search",
        "url": "https://sketchfab.com/search?type=models&q=Echinococcus%20hydatid%20cyst",
        "description": "بحث عن مجسمات Hydatid cyst ثلاثية الأبعاد."
      }
    ],
    "attachments": []
  },
  {
    "id": "pt-parasito-05-trematodes",
    "title": "الديدان المثقوبة — Trematoda Diagnostic Atlas",
    "subtitle": "Fasciola hepatica • Schistosoma mansoni • S. haematobium • Heterophyes heterophyes",
    "category": "Medical",
    "author": "UMEDT — Parasitology Practical Course",
    "publishedAt": "November 2026",
    "readingTimeMinutes": 65,
    "favorite": true,
    "sections": [
      {
        "id": "p5-s1",
        "heading": "1. Fasciola hepatica — Liver fluke",
        "paragraphs": [
          "Adult morphology: large, leaf-shaped, dorsoventrally flattened worm with highly branched intestinal caeca; testes are branched and arranged in tandem; ovary lies to the right of the midline; uterus is coiled anteriorly.",
          "Habitat: bile ducts. Egg: large, oval/ellipsoidal and operculated, approximately 130–150 × 60–90 µm; passed unembryonated in stool.",
          "Infective stage: metacercaria encysted on aquatic vegetation; infection follows ingestion of contaminated water plants such as watercress. The snail is an intermediate host.",
          "Spotter: leaf-like adult + large operculated egg → Fasciola hepatica."
        ]
      },
      {
        "id": "p5-s2",
        "heading": "2. Schistosoma — Blood flukes",
        "paragraphs": [
          "Unlike most trematodes, Schistosoma are dioecious: male and female worms are separate. The male is shorter and broader; the female is longer and slender, residing in the gynecophoral canal of the male.",
          "Infective stage: fork-tailed cercaria penetrates intact skin in freshwater. Diagnostic stage: eggs in stool or urine, depending on species.",
          "S. mansoni egg: oval with a prominent lateral spine; typically found in stool. S. haematobium egg: oval with a terminal spine; classically found in urine.",
          "Adult S. haematobium male in the supplied course images: about 1–1.5 cm, coarse tubercles on the tegument and approximately 3–5 testes; female about 2–2.5 cm with ovary in the posterior third. Retain the course's image labels for the practical spotter."
        ]
      },
      {
        "id": "p5-s3",
        "heading": "3. Heterophyes heterophyes",
        "paragraphs": [
          "Adult worm: small, pyriform (pear-shaped), with a broad rounded posterior part.",
          "Egg: small, oval, operculated, with a small knob at the posterior end (abopercular knob).",
          "Metacercaria is another practical stage shown in the supplied guide. If the image shows a pear-shaped adult or an operculated egg with a posterior knob, identify Heterophyes heterophyes.",
          "Do not confuse its posterior knob with the prominent spine of Schistosoma eggs."
        ]
      },
      {
        "id": "p5-s4",
        "heading": "4. Trematode image-recognition summary",
        "paragraphs": [
          "Fasciola: leaf-like adult; branched internal organs; large operculated egg.",
          "S. mansoni: oval egg + lateral spine + stool specimen. S. haematobium: oval egg + terminal spine + urine specimen.",
          "Heterophyes: pyriform adult; small operculated egg + posterior knob; metacercaria.",
          "Most trematodes are hermaphroditic; Schistosoma is the key exception with separate sexes."
        ]
      }
    ],
    "images": [
      {
        "id": "p5-img1",
        "url": "https://www.cdc.gov/dpdx/fascioliasis/images/2/Fasciola_adult_unstained1.jpg?_=05673",
        "caption": "Adult Fasciola hepatica — leaf-shaped liver fluke, CDC DPDx."
      },
      {
        "id": "p5-img2",
        "url": "https://www.cdc.gov/dpdx/schistosomiasis/images/1/S_mansoni_egg_WI1.jpg?_=96146",
        "caption": "Schistosoma mansoni egg — lateral spine, CDC DPDx."
      },
      {
        "id": "p5-img3",
        "url": "https://www.cdc.gov/dpdx/schistosomiasis/images/2/S_haematobium_egg_HB1.jpg?_=96128",
        "caption": "Schistosoma haematobium egg — terminal spine, CDC DPDx."
      }
    ],
    "links": [
      {
        "id": "p5-l1",
        "title": "CDC DPDx — Fascioliasis",
        "url": "https://www.cdc.gov/dpdx/fascioliasis/",
        "description": "صور adult Fasciola والبيض ودورة الحياة."
      },
      {
        "id": "p5-l2",
        "title": "CDC DPDx — Schistosomiasis",
        "url": "https://www.cdc.gov/dpdx/schistosomiasis/",
        "description": "صور بيوض mansoni وhaematobium والديدان البالغة والتمييز بين الأنواع."
      },
      {
        "id": "p5-l3",
        "title": "Heterophyiasis — CDC DPDx index",
        "url": "https://www.cdc.gov/dpdx/",
        "description": "استخدم فهرس DPDx للبحث عن Heterophyes والمواد التشخيصية المتاحة."
      },
      {
        "id": "p5-l4",
        "title": "Sketchfab — Fasciola hepatica 3D model search",
        "url": "https://sketchfab.com/search?type=models&q=Fasciola%20hepatica",
        "description": "بحث عن نماذج ثلاثية الأبعاد للمثقوبات الكبدية."
      },
      {
        "id": "p5-l5",
        "title": "Sketchfab — Schistosoma 3D model search",
        "url": "https://sketchfab.com/search?type=models&q=Schistosoma",
        "description": "بحث عن مجسمات Schistosoma والبيض."
      }
    ],
    "attachments": []
  },
  {
    "id": "pt-parasito-06-practical-spotter",
    "title": "مفتاح التعرف على صور العملي — Practical Spotter & Differential Diagnosis",
    "subtitle": "Eggs • Scoleces • Proglottids • Larvae • Adult Worms",
    "category": "Medical",
    "author": "UMEDT — Parasitology Practical Course",
    "publishedAt": "November 2026",
    "readingTimeMinutes": 45,
    "favorite": true,
    "sections": [
      {
        "id": "p6-s1",
        "heading": "1. Egg identification — ابدأ بالعلامة الفارقة",
        "paragraphs": [
          "Mammillated thick shell → Ascaris fertilized egg. Elongated granular egg → Ascaris unfertilized egg.",
          "Barrel-shaped egg with bipolar plugs → Trichuris trichiura. D-shaped / planoconvex egg → Enterobius vermicularis.",
          "Rhabditiform larva with visible esophagus → Strongyloides stercoralis. Sheathed microfilaria with nuclei to tail tip → Loa loa.",
          "Radially striated spherical egg with six hooklets → Taenia spp. (egg cannot distinguish T. solium from T. saginata). Oval egg with polar filaments → Hymenolepis nana.",
          "Operculated egg: large → Fasciola hepatica or other large fluke eggs; small oval with posterior knob → Heterophyes. Schistosoma mansoni = lateral spine; S. haematobium = terminal spine."
        ]
      },
      {
        "id": "p6-s2",
        "heading": "2. Scolex and proglottid identification",
        "paragraphs": [
          "Armed scolex (rostellum + two rows of hooks) → T. solium. Unarmed scolex with four suckers and no rostellum → T. saginata.",
          "H. nana: globular scolex, four suckers, retractile rostellum with one row of small hooks.",
          "D. latum: scolex with two bothria (longitudinal grooves), not four cup-shaped suckers.",
          "T. solium gravid proglottid: usually 7–13 uterine branches. T. saginata: 12–30 branches. Count primary lateral uterine branches, not secondary subdivisions."
        ]
      },
      {
        "id": "p6-s3",
        "heading": "3. The 10-second specimen algorithm",
        "paragraphs": [
          "Step 1 — Determine specimen: stool, urine, blood film, tissue, or adult worm. Step 2 — Determine broad group: nematode, cestode, trematode. Step 3 — Find the unique structure: plugs, spine, operculum, polar filaments, rostellum, bothria, uterine branches, or larval esophagus.",
          "Step 4 — Say the complete identification: organism + stage + one diagnostic feature. Example: “Schistosoma mansoni egg — oval with a prominent lateral spine.”",
          "Step 5 — If the image is a Taenia egg, answer Taenia spp. only; do not guess the species from an indistinguishable egg."
        ]
      },
      {
        "id": "p6-s4",
        "heading": "4. Corrections and exam cautions",
        "paragraphs": [
          "Taenia solium uterine branches: CDC reference gives 7–13; T. saginata gives 12–30. This is more precise than the simple <12 / >12 shorthand.",
          "Cysticercus bovis of T. saginata is unarmed; do not label it as having rostellar hooks. Cysticercus cellulosae of T. solium is armed.",
          "Schistosoma mansoni has a lateral spine; S. haematobium has a terminal spine. Both are oval eggs, so spine position and specimen source are the differentiators.",
          "The supplied course guide is the exam scope. When a course-sheet detail conflicts with a verified reference or appears internally inconsistent, the topic flags the discrepancy rather than silently teaching the error."
        ]
      }
    ],
    "images": [],
    "links": [
      {
        "id": "p6-l1",
        "title": "CDC — Morphologic comparison of parasites in stool specimens",
        "url": "https://www.cdc.gov/dpdx/diagnosticprocedures/stool/morphcomp.html",
        "description": "لوحات مقارنة مجهرية للبيض واليرقات والقطع والسكلِكس."
      },
      {
        "id": "p6-l2",
        "title": "CDC DPDx — Diagnostic Procedures",
        "url": "https://www.cdc.gov/dpdx/diagnosticprocedures/",
        "description": "إجراءات تشخيص العينات المخبرية."
      },
      {
        "id": "p6-l3",
        "title": "Sketchfab — Parasite microscopy and anatomy models",
        "url": "https://sketchfab.com/search?type=models&q=parasite%20anatomy",
        "description": "مجسمات ثلاثية الأبعاد للمراجعة البصرية؛ ليست بديلاً عن الصور المجهرية التشخيصية."
      }
    ],
    "attachments": []
  },
  {
    "id": "pt-parasito-07-one-day-plan",
    "title": "خطة مذاكرة الطفيليات العملية في يوم واحد — One-Day Master Plan",
    "subtitle": "8-Hour Focused Revision • Active Recall • Image Spotters",
    "category": "Medical",
    "author": "UMEDT — Parasitology Practical Course",
    "publishedAt": "November 2026",
    "readingTimeMinutes": 20,
    "favorite": true,
    "sections": [
      {
        "id": "p7-s1",
        "heading": "1. جدول اليوم — 8 ساعات دراسة صافية تقريباً",
        "paragraphs": [
          "Block 1 — 40 min: General concepts, routes of transmission and Helminths classification. أغلق الموضوع واكتب التعريفات والتصنيف من الذاكرة.",
          "Block 2 — 90 min: Intestinal nematodes: Ascaris, Trichuris, Enterobius, Strongyloides. خصص نصف الوقت للصور والبيض واليرقات.",
          "Break — 20 min.",
          "Block 3 — 90 min: Cestodes: Taenia solium, T. saginata, H. nana, D. latum, Echinococcus. ارسم السكلِكس وقارن gravid proglottids.",
          "Break — 30 min.",
          "Block 4 — 75 min: Trematodes: Fasciola, S. mansoni, S. haematobium, Heterophyes. ركز على شكل البيضة ومكان spine.",
          "Block 5 — 45 min: Loa loa + transmission vectors + infective versus diagnostic stages.",
          "Block 6 — 60 min: Image spotter drill. افتح كل صورة، أخفِ caption، وسمّ organism/stage/key feature خلال 10–15 ثانية.",
          "Block 7 — 40 min: Final self-test and correction of errors. لا تعد قراءة كل شيء؛ راجع فقط العلامات التي أخطأت فيها."
        ]
      },
      {
        "id": "p7-s2",
        "heading": "2. طريقة المذاكرة داخل كل Topic",
        "paragraphs": [
          "First pass (الفهم): اقرأ Habitat, Mode of infection, Diagnostic stage and morphology. لا تحفظ العلاج قبل أن تتقن التعرف على العينة.",
          "Second pass (الاسترجاع): أخفِ الإجابة واسأل نفسك: What is the infective stage? What specimen? What is the distinguishing feature?",
          "Third pass (visual): ادرس الصور والمجسمات، ثم سمّ الصورة دون قراءة caption.",
          "Final pass (exam): اكتب إجابة نموذجية قصيرة باللغة الإنجليزية، ثم اشرح سببها بالعربية."
        ]
      },
      {
        "id": "p7-s3",
        "heading": "3. قائمة التحقق قبل دخول العملي",
        "paragraphs": [
          "□ أميز fertilized vs unfertilized Ascaris eggs. □ أعرف bipolar plugs في Trichuris. □ أتعرف على D-shaped Enterobius egg. □ أفرق Strongyloides rhabditiform عن filariform.",
          "□ أفرق armed T. solium عن unarmed T. saginata. □ أحفظ Taenia uterine branches. □ أتعرف polar filaments في H. nana وbothria في D. latum. □ أشرح طبقات hydatid cyst.",
          "□ أميز lateral spine عن terminal spine. □ أتعرف leaf-like Fasciola adult وoperculated egg. □ أتعرف pyriform Heterophyes وposterior knob. □ أتذكر Loa loa microfilaria في blood film وChrysops vector."
        ]
      },
      {
        "id": "p7-s4",
        "heading": "4. طريقة تقييم نفسك",
        "paragraphs": [
          "لكل كائن امنح نفسك درجة من 0 إلى 3: (0) لا أعرفه، (1) أعرف الاسم فقط، (2) أعرف الاسم والعلامة الفارقة، (3) أستطيع ذكر habitat/transmission/diagnostic stage والمورفولوجيا.",
          "أي عنصر درجته 0 أو 1 يعود إلى المراجعة فوراً. لا تستهلك وقتاً إضافياً على العناصر التي تتقنها.",
          "هدف اليوم: تمييز صور كل الأطوار المدرجة في الدليل، لا التوسع في طفيليات غير موجودة في نطاق المقرر."
        ]
      }
    ],
    "images": [],
    "links": [
      {
        "id": "p7-l1",
        "title": "CDC DPDx — Parasite Image Gallery and Diagnostic Resources",
        "url": "https://www.cdc.gov/dpdx/",
        "description": "المصدر الأساسي للتدرب على الصور المجهرية."
      },
      {
        "id": "p7-l2",
        "title": "CDC — Stool specimen morphology comparison",
        "url": "https://www.cdc.gov/dpdx/diagnosticprocedures/stool/morphcomp.html",
        "description": "مقارنة نهائية سريعة للبيض واليرقات والقطع."
      }
    ],
    "attachments": []
  }
];
