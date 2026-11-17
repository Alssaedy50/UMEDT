import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import {
  APP_VERSION,
  BUNDLED_DATA_VERSION,
  DB_SCHEMA_VERSION,
  buildAndSignReleaseBundle,
  generatePublisherSigningKeyPair
} from './src/services/dataPlatformService';
import {
  INITIAL_TERMS,
  INITIAL_LINKED_SENTENCES,
  DictionaryTerm
} from './src/data/medicalLexiconData';
import { INITIAL_TOPICS } from './src/data/topicsSeedData';
import { autoEnrichAllTermsRelations } from './src/engine/knowledgeLinker';
import {
  buildCanonicalCloudSeedSnapshot,
  saveUnifiedCloudMirror,
  mergeRecordsIntoCloudSnapshot,
  UnifiedCloudStoreSnapshot
} from './src/services/cloudLibrarySyncService';
import type { DataPackagePayload, PublishedReleaseBundle } from './src/types/lexicon';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // ==========================================================================
  // 1. Layer 3 Optional Gemini AI Clinical Structural Translation
  // ==========================================================================
  app.post('/api/translate-clinical', async (req, res) => {
    try {
      const { maskedText, placeholders } = req.body as {
        maskedText?: string;
        placeholders?: Array<{ placeholder: string; meaningAr: string; resolvedEn: string }>;
      };

      if (!maskedText || !maskedText.trim()) {
        res.status(400).json({ error: 'النص المموّه مطلوب للترجمة.' });
        return;
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        res.status(503).json({
          error:
            'مفتاح GEMINI_API_KEY غير مضبوط في بيئة الخادم — يعمل المحرك حالياً عبر القواعد والقوالب المحلية.'
        });
        return;
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build'
          }
        }
      });

      const placeholderContext = Array.isArray(placeholders)
        ? placeholders
            .map((p) => `${p.placeholder} = ${p.meaningAr} (${p.resolvedEn})`)
            .join('\n')
        : '';

      const systemInstruction = `You are a specialist Arabic Clinical Medical Translator adhering strictly to the WHO Unified Medical Dictionary (UMD / المعجم الطبي الموحد).
Translate the structural English clinical grammar into fluent, natural, formal clinical Arabic.
CRITICAL RULE: You MUST keep every placeholder token matching [MED_XXX] or [MORPH_XXX] (such as [MED_001], [MED_002], [MORPH_001], etc.) EXACTLY intact in its proper grammatical position in the Arabic output without altering, translating, or removing the bracketed token itself.
Return ONLY the translated Arabic text containing the original [MED_XXX] and [MORPH_XXX] tokens, with no markdown or extra commentary.`;

      const prompt = `Masked Clinical Text:
${maskedText}

Reference meanings of masked placeholders (for grammatical gender/number agreement only — DO NOT replace the [MED_XXX] or [MORPH_XXX] tokens yourself):
${placeholderContext || 'None'}`;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          systemInstruction,
          thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH }
        }
      });

      const translatedMaskedAr = (response.text ?? '').trim();
      res.json({ translatedMaskedAr });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'حدث خطأ أثناء الاتصال بمحرك Gemini';
      res.status(500).json({ error: message });
    }
  });

  // ==========================================================================
  // 2. Cloud Medical AI Assistant Server Endpoints (Connection Probe & Extraction)
  // ==========================================================================
  app.post('/api/ai/test-connection', async (_req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        res.status(400).json({
          connected: false,
          model: 'gemini-4-hydrogen',
          message: 'تعذر الاتصال بخدمة الذكاء الاصطناعي السحابية.',
          error: 'GEMINI_API_KEY is not configured on the server.'
        });
        return;
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build'
          }
        }
      });

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents:
          'Respond with exactly the single word "READY" if the clinical assistant service is operational.'
      });

      const text = (response.text ?? '').trim();
      res.json({
        connected: true,
        model: 'gemini-4-hydrogen',
        message: text.includes('READY')
          ? 'تم الاتصال بخدمة Gemini Cloud بنجاح، المساعد الطبي السحابي جاهز للعمل.'
          : 'تم الاتصال بالخدمة بنجاح.'
      });
    } catch (err) {
      const errStr = err instanceof Error ? err.message : String(err);
      res.status(500).json({
        connected: false,
        model: 'gemini-4-hydrogen',
        message: 'تعذر الاتصال بخدمة الذكاء الاصطناعي السحابية.',
        error: errStr
      });
    }
  });

  app.post('/api/ai/extract-medical-data', async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        res.status(400).json({
          error: 'GEMINI_API_KEY is not configured on the server.'
        });
        return;
      }

      const { prompt, mimeType, base64Data } = req.body as {
        prompt?: string;
        mimeType?: string;
        base64Data?: string;
      };

      if (!prompt) {
        res.status(400).json({ error: 'Prompt is required for medical extraction.' });
        return;
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build'
          }
        }
      });

      if (mimeType && base64Data) {
        const response = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: [
            {
              role: 'user',
              parts: [
                {
                  inlineData: {
                    mimeType,
                    data: base64Data
                  }
                },
                {
                  text: prompt
                }
              ]
            }
          ],
          config: {
            responseMimeType: 'application/json'
          }
        });

        res.json({
          success: true,
          modelUsed: 'gemini-4-hydrogen',
          rawResponseText: response.text ?? '{}'
        });
        return;
      }

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          temperature: 0.1,
          thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
          responseMimeType: 'application/json'
        }
      });

      res.json({
        success: true,
        modelUsed: 'gemini-4-hydrogen',
        rawResponseText: response.text ?? '{}'
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'تعذر تحليل البيانات الطبية عبر الخادم'
      });
    }
  });

  // ==========================================================================
  // 3. Telegram Backup Server Proxy (Avoids Browser/Iframe CORS or Adblock Issues)
  // ==========================================================================
  const sanitizeTelegramCredential = (raw?: string): string =>
    String(raw || '')
      .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF\s]/g, '')
      .trim();

  app.post('/api/telegram/test', async (req, res) => {
    try {
      const { botToken, chatId, text } = req.body as {
        botToken?: string;
        chatId?: string;
        text?: string;
      };

      const token = sanitizeTelegramCredential(botToken);
      const targetChatId = sanitizeTelegramCredential(chatId);
      if (!token || !targetChatId) {
        res.status(400).json({
          ok: false,
          message: 'يرجى إدخال رمز البوت (Bot Token) ومعرف المحادثة (Chat ID) أولاً.',
          description: 'يرجى إدخال رمز البوت (Bot Token) ومعرف المحادثة (Chat ID) أولاً.'
        });
        return;
      }

      const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: targetChatId,
          text:
            text ||
            '✅ تم ربط تطبيق المعجم الطبي الموحد (UMEDT) بنجاح مع تليجرام للنسخ الاحتياطي الدوري.'
        })
      });

      const data = (await tgRes.json()) as { ok?: boolean; description?: string };
      res.status(tgRes.ok && data?.ok ? 200 : 400).json({
        ...data,
        ok: Boolean(tgRes.ok && data?.ok),
        message:
          tgRes.ok && data?.ok
            ? 'تم الاتصال وإرسال رسالة التأكيد إلى تليجرام بنجاح.'
            : data?.description || 'فشل الاتصال بتليجرام.'
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'تعذر الاتصال بخوادم تليجرام';
      res.status(500).json({
        ok: false,
        message: msg,
        description: msg
      });
    }
  });

  app.post('/api/telegram/send-backup', async (req, res) => {
    try {
      const { botToken, chatId, filename, jsonString, jsonContent, caption } = req.body as {
        botToken?: string;
        chatId?: string;
        filename?: string;
        jsonString?: string;
        jsonContent?: string;
        caption?: string;
      };

      const token = sanitizeTelegramCredential(botToken);
      const targetChatId = sanitizeTelegramCredential(chatId);
      const resolvedJson =
        typeof jsonString === 'string' && jsonString.length > 0
          ? jsonString
          : typeof jsonContent === 'string' && jsonContent.length > 0
          ? jsonContent
          : '';

      if (!token || !targetChatId || !resolvedJson) {
        res.status(400).json({
          ok: false,
          message: 'بيانات البوت أو ملف النسخة الاحتياطية غير مكتملة.',
          description: 'بيانات البوت أو ملف النسخة الاحتياطية غير مكتملة.'
        });
        return;
      }

      const safeFilename = (filename || 'UMEDT-Backup.json').trim();
      const fileBytes = Buffer.from(resolvedJson, 'utf8');
      const formData = new FormData();
      formData.append('chat_id', targetChatId);
      const blob = new Blob([fileBytes], { type: 'application/json' });
      formData.append('document', blob, safeFilename);
      if (caption) {
        formData.append('caption', caption);
      }

      const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
        method: 'POST',
        body: formData
      });

      const data = (await tgRes.json()) as { ok?: boolean; description?: string };
      res.status(tgRes.ok && data?.ok ? 200 : 400).json({
        ...data,
        ok: Boolean(tgRes.ok && data?.ok),
        message:
          tgRes.ok && data?.ok
            ? 'تم إرسال ملف النسخة الاحتياطية إلى تليجرام بنجاح.'
            : data?.description || 'تعذر إرسال النسخة الاحتياطية إلى تليجرام.'
      });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'تعذر إرسال النسخة الاحتياطية إلى تليجرام';
      res.status(500).json({
        ok: false,
        message: msg,
        description: msg
      });
    }
  });

  // ==========================================================================
  // 4. Universal HTTP Download Relay (Fixes Android Chrome Iframe Blob Blocking)
  // ==========================================================================
  const downloadRelayStore = new Map<
    string,
    { filename: string; mime: string; buffer: Buffer; createdAt: number }
  >();

  app.post('/api/download/prepare', (req, res) => {
    try {
      const { filename, mime, content, isBase64 } = req.body as {
        filename?: string;
        mime?: string;
        content?: string;
        isBase64?: boolean;
      };
      if (!filename || typeof content !== 'string') {
        res.status(400).json({ error: 'بيانات الملف مطلوبة للتحميل.' });
        return;
      }

      const now = Date.now();
      for (const [k, v] of downloadRelayStore.entries()) {
        if (now - v.createdAt > 15 * 60 * 1000) {
          downloadRelayStore.delete(k);
        }
      }

      const id = `dl_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      const safeName = path.basename(filename.trim()) || 'umed2-package.zip';
      const buffer = isBase64
        ? Buffer.from(content, 'base64')
        : Buffer.from(content, 'utf8');

      downloadRelayStore.set(id, {
        filename: safeName,
        mime: mime || 'application/octet-stream',
        buffer,
        createdAt: now
      });

      res.json({
        success: true,
        id,
        filename: safeName,
        sizeBytes: buffer.length,
        downloadUrl: `/api/download/file/${id}/${encodeURIComponent(safeName)}`
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'تعذر تجهيز رابط التحميل المباشر'
      });
    }
  });

  app.get('/api/download/file/:id/:filename?', (req, res) => {
    const entry = downloadRelayStore.get(req.params.id);
    if (!entry) {
      res.status(404).send('انتهت صلاحية رابط التحميل، يرجى الضغط على زر التحميل مرة أخرى.');
      return;
    }
    res.setHeader('Content-Type', entry.mime || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${entry.filename.replace(/"/g, '')}"`
    );
    res.setHeader('Content-Length', String(entry.buffer.length));
    res.setHeader('Cache-Control', 'no-store');
    res.send(entry.buffer);
  });

  // ==========================================================================
  // 4b. CORS-Safe GitHub Releases / Manifest Relay (/api/remote-fetch)
  // ==========================================================================
  const ALLOWED_REMOTE_HOSTS = new Set([
    'raw.githubusercontent.com',
    'github.com',
    'api.github.com',
    'release-assets.githubusercontent.com',
    'objects.githubusercontent.com',
    'codeload.github.com',
    'www.cdc.gov',
    'cdc.gov'
  ]);

  app.get('/api/remote-fetch', async (req, res) => {
    try {
      const target = typeof req.query.url === 'string' ? req.query.url.trim() : '';
      if (!target) {
        res.status(400).json({ error: 'Missing url parameter' });
        return;
      }
      const parsed = new URL(target);
      if (parsed.protocol !== 'https:' || !ALLOWED_REMOTE_HOSTS.has(parsed.hostname)) {
        res.status(403).json({ error: 'Host not permitted for remote-fetch' });
        return;
      }

      const upstream = await fetch(parsed.toString(), {
        headers: {
          'User-Agent': 'UMEDT-Server/2.4.0',
          Accept: 'application/json, application/octet-stream, */*'
        },
        redirect: 'follow'
      });

      const arrayBuf = await upstream.arrayBuffer();
      if (arrayBuf.byteLength > 25 * 1024 * 1024) {
        res.status(413).json({ error: 'Remote payload exceeds 25 MB safety limit' });
        return;
      }

      res.status(upstream.status);
      res.setHeader(
        'Content-Type',
        upstream.headers.get('content-type') || 'application/octet-stream'
      );
      res.setHeader('Cache-Control', 'no-store');
      res.send(Buffer.from(arrayBuf));
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Remote fetch relay failed'
      });
    }
  });

  // ==========================================================================
  // 5. Stage 7 Live Server-to-App Signed Cloud OTA Release Endpoint
  // ==========================================================================
  let cachedLiveOtaRelease: {
    bundle: PublishedReleaseBundle;
    publicKeyPem: string;
    keyFingerprintSha256: string;
  } | null = null;

  async function getOrCreateLiveOtaRelease() {
    if (cachedLiveOtaRelease) {
      return cachedLiveOtaRelease;
    }

    const keyPair = await generatePublisherSigningKeyPair('ECDSA-P256-SHA256');
    const targetVersion = '2026.10.1-umd';

    const otaBonusTerm: DictionaryTerm = {
      id: 'ota-cmd-2026-10-1',
      term: 'Coronary Microvascular Dysfunction',
      termNormalized: 'coronary microvascular dysfunction',
      translation: 'خلل الوظيفة الوعائية الدقيقة التاجية',
      phonetic: '/ˈkɔːrənɛri ˌmaɪkroʊˈvæskjələr dɪsˈfʌŋkʃən/',
      pos: 'Noun · أمراض القلب والأوعية الدقيقة (OTA v2026.10.1)',
      category: 'Medical',
      umdCode: 'UMD-CMD-2026',
      keepEnglish: true,
      favorite: false,
      collections: ['تحديث سحابي OTA'],
      ingestedAt: 'تحديث هوائي موثّق (Cloud OTA 2026.10.1-umd)',
      definitionAr:
        'اضطراب وظيفي وبنيوي في الأوعية التاجية الدقيقة يؤدي إلى نقص تروية عضلة القلب والذبحة الصدرية (INOCA) رغم خلو الشرايين التاجية الكبيرة من الانسداد في القسطرة، ويرتبط بـ Myocardial Infarction وHeart Failure.',
      definitionEn:
        'Structural and functional abnormalities of the coronary microcirculation leading to myocardial ischemia and angina without obstructive epicardial coronary artery disease.',
      examples: [
        {
          en: 'Coronary flow reserve measurement is essential to diagnose Coronary Microvascular Dysfunction in patients with angina and non-obstructive coronary arteries.',
          ar: 'يُعد قياس احتياطي التدفق التاجي ضرورياً لتشخيص خلل الوظيفة الوعائية الدقيقة التاجية لدى مرضى الذبحة الصدرية دون انسداد تاجي.'
        }
      ],
      relations: {
        synonyms: ['Microvascular Angina', 'INOCA'],
        broader: ['Cardiomyopathy'],
        related: ['Myocardial Infarction', 'Arrhythmia']
      }
    };

    const enrichedTerms = autoEnrichAllTermsRelations([
      otaBonusTerm,
      ...INITIAL_TERMS.filter((t) => t.term.toLowerCase() !== otaBonusTerm.term.toLowerCase())
    ]);
    const syncedSentences = [...INITIAL_LINKED_SENTENCES];
    const topics = [...INITIAL_TOPICS];

    const payload: DataPackagePayload = {
      manifest: {
        packageId: `umed2-pkg-${targetVersion}`,
        dataVersion: targetVersion,
        minAppVersion: APP_VERSION,
        schemaVersion: DB_SCHEMA_VERSION,
        releasedAt: new Date().toISOString(),
        channel: 'stable',
        counts: {
          terms: enrichedTerms.length,
          sentences: syncedSentences.length,
          topics: topics.length,
          affixes: 0,
          abbreviations: 0
        }
      },
      terms: enrichedTerms,
      sentences: syncedSentences,
      topics,
      customAffixes: [],
      customAbbreviations: []
    };

    const bundle = await buildAndSignReleaseBundle({
      payload,
      targetVersion,
      installedDataVersion: BUNDLED_DATA_VERSION,
      channel: 'stable',
      minAppVersion: APP_VERSION,
      schemaVersion: DB_SCHEMA_VERSION,
      cdnBaseUrl: '/api/ota-test',
      packageFormat: 'zip',
      summary:
        'إصدار التحديث السحابي المباشر (2026.10.1-umd) مع مصطلح Coronary Microvascular Dysfunction وتوقيع ECDSA-P256-SHA256 الموثق',
      author: 'UMEDT Cloud OTA Server',
      privateKeyPem: keyPair.privateKeyPem,
      publicKeyPem: keyPair.publicKeyPem,
      signatureAlgorithm: 'ECDSA-P256-SHA256'
    });

    cachedLiveOtaRelease = {
      bundle,
      publicKeyPem: keyPair.publicKeyPem,
      keyFingerprintSha256: keyPair.fingerprintSha256
    };
    return cachedLiveOtaRelease;
  }

  app.get('/api/ota-test/info', async (_req, res) => {
    try {
      const live = await getOrCreateLiveOtaRelease();
      res.setHeader('Cache-Control', 'no-store');
      res.json({
        success: true,
        manifestUrl: '/api/ota-test/manifest.json',
        downloadUrl: `/api/ota-test/${live.bundle.packageFileName}`,
        dataVersion: live.bundle.manifest.dataVersion,
        minAppVersion: live.bundle.manifest.minAppVersion,
        schemaVersion: live.bundle.manifest.schemaVersion,
        publicKeyPem: live.publicKeyPem,
        keyFingerprintSha256: live.keyFingerprintSha256,
        signatureAlgorithm: live.bundle.signatureAlgorithm,
        sha256: live.bundle.sha256,
        packageSizeKb: live.bundle.packageSizeKb,
        counts: live.bundle.manifest.counts
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'تعذر تجهيز حزمة اختبار OTA على الخادم'
      });
    }
  });

  app.get('/api/ota-test/manifest.json', async (_req, res) => {
    try {
      const live = await getOrCreateLiveOtaRelease();
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.send(live.bundle.manifestJsonText);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'تعذر قراءة manifest.json من الخادم'
      });
    }
  });

  app.get('/api/ota-test/:packageFile', async (req, res) => {
    try {
      const live = await getOrCreateLiveOtaRelease();
      if (
        req.params.packageFile !== live.bundle.packageFileName &&
        !req.params.packageFile.endsWith('.zip')
      ) {
        res.status(404).json({ error: 'حزمة التحديث المطلوبة غير موجودة.' });
        return;
      }
      const buffer = Buffer.from(live.bundle.packageBytes);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${live.bundle.packageFileName}"`
      );
      res.setHeader('Content-Length', String(buffer.length));
      res.setHeader('Cache-Control', 'no-store');
      res.send(buffer);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'تعذر تنزيل حزمة التحديث من الخادم'
      });
    }
  });

  // ==========================================================================
  // 6. Unified Cloud Library API (/api/cloud-library)
  //    Supports automatic background sync (push/pull), SHA-256 deduplication,
  //    and optional GitHub Contents API persistence when GITHUB_TOKEN is set.
  // ==========================================================================
  let serverCloudSnapshot: UnifiedCloudStoreSnapshot = buildCanonicalCloudSeedSnapshot();

  app.get('/api/cloud-library', async (req, res) => {
    try {
      res.setHeader('Cache-Control', 'no-store');
      const targetType = typeof req.query.targetType === 'string' ? req.query.targetType : '';
      const targetId = typeof req.query.targetId === 'string' ? req.query.targetId : '';

      if (targetType && targetId) {
        if (targetType === 'block') {
          const blocks = serverCloudSnapshot.blocks.filter((b) => b.id === targetId);
          const subjects = serverCloudSnapshot.subjects.filter((s) => s.blockId === targetId);
          const subjIds = new Set(subjects.map((s) => s.id));
          const topics = serverCloudSnapshot.topics.filter(
            (t) => t.blockId === targetId || (t.subjectId && subjIds.has(t.subjectId))
          );
          const topicIds = new Set(topics.map((t) => t.id));
          const mediaRecords = serverCloudSnapshot.mediaRecords.filter(
            (m) => m.topicId && topicIds.has(m.topicId)
          );
          const books = (serverCloudSnapshot.books || []).filter(
            (bk) =>
              bk.blockId === targetId ||
              (bk.subjectId && subjIds.has(bk.subjectId)) ||
              (bk.topicIds || []).some((tid) => topicIds.has(tid))
          );
          const exams = (serverCloudSnapshot.exams || []).filter(
            (ex) =>
              ex.blockId === targetId ||
              (ex.subjectId && subjIds.has(ex.subjectId)) ||
              (ex.topicIds || []).some((tid) => topicIds.has(tid))
          );
          const quizQuestions = (serverCloudSnapshot.quizQuestions || []).filter(
            (q) =>
              q.blockId === targetId ||
              (q.subjectId && subjIds.has(q.subjectId)) ||
              (q.topicId && topicIds.has(q.topicId))
          );
          res.json({
            version: serverCloudSnapshot.version,
            updatedAt: serverCloudSnapshot.updatedAt,
            blocks,
            subjects,
            topics,
            mediaRecords,
            books,
            exams,
            quizQuestions
          });
          return;
        }
        if (targetType === 'subject') {
          const subjects = serverCloudSnapshot.subjects.filter((s) => s.id === targetId);
          const topics = serverCloudSnapshot.topics.filter((t) => t.subjectId === targetId);
          const topicIds = new Set(topics.map((t) => t.id));
          const mediaRecords = serverCloudSnapshot.mediaRecords.filter(
            (m) => m.topicId && topicIds.has(m.topicId)
          );
          const books = (serverCloudSnapshot.books || []).filter(
            (bk) =>
              bk.subjectId === targetId ||
              (bk.topicIds || []).some((tid) => topicIds.has(tid))
          );
          const exams = (serverCloudSnapshot.exams || []).filter(
            (ex) =>
              ex.subjectId === targetId ||
              (ex.topicIds || []).some((tid) => topicIds.has(tid))
          );
          const quizQuestions = (serverCloudSnapshot.quizQuestions || []).filter(
            (q) => q.subjectId === targetId || (q.topicId && topicIds.has(q.topicId))
          );
          res.json({
            version: serverCloudSnapshot.version,
            updatedAt: serverCloudSnapshot.updatedAt,
            subjects,
            topics,
            mediaRecords,
            books,
            exams,
            quizQuestions
          });
          return;
        }
        if (targetType === 'topic') {
          const topics = serverCloudSnapshot.topics.filter((t) => t.id === targetId);
          const mediaRecords = serverCloudSnapshot.mediaRecords.filter(
            (m) => m.topicId === targetId
          );
          const books = (serverCloudSnapshot.books || []).filter((bk) =>
            (bk.topicIds || []).includes(targetId)
          );
          const exams = (serverCloudSnapshot.exams || []).filter((ex) =>
            (ex.topicIds || []).includes(targetId)
          );
          const quizQuestions = (serverCloudSnapshot.quizQuestions || []).filter(
            (q) => q.topicId === targetId
          );
          res.json({
            version: serverCloudSnapshot.version,
            updatedAt: serverCloudSnapshot.updatedAt,
            topics,
            mediaRecords,
            books,
            exams,
            quizQuestions
          });
          return;
        }
        if (targetType === 'book') {
          const books = (serverCloudSnapshot.books || []).filter((bk) => bk.id === targetId);
          res.json({
            version: serverCloudSnapshot.version,
            updatedAt: serverCloudSnapshot.updatedAt,
            books
          });
          return;
        }
      }

      res.json(serverCloudSnapshot);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'تعذر قراءة بيانات المكتبة السحابية'
      });
    }
  });

  app.post('/api/cloud-library', async (req, res) => {
    try {
      const body = (req.body || {}) as {
        blocks?: UnifiedCloudStoreSnapshot['blocks'];
        subjects?: UnifiedCloudStoreSnapshot['subjects'];
        topics?: UnifiedCloudStoreSnapshot['topics'];
        terms?: UnifiedCloudStoreSnapshot['terms'];
        sentences?: UnifiedCloudStoreSnapshot['sentences'];
        mediaRecords?: UnifiedCloudStoreSnapshot['mediaRecords'];
        books?: UnifiedCloudStoreSnapshot['books'];
        exams?: UnifiedCloudStoreSnapshot['exams'];
        quizQuestions?: UnifiedCloudStoreSnapshot['quizQuestions'];
        mediaAssets?: UnifiedCloudStoreSnapshot['mediaAssets'];
        customAffixes?: UnifiedCloudStoreSnapshot['customAffixes'];
        customAbbreviations?: UnifiedCloudStoreSnapshot['customAbbreviations'];
      };

      const merged = mergeRecordsIntoCloudSnapshot(serverCloudSnapshot, {
        blocks: body.blocks,
        subjects: body.subjects,
        topics: body.topics,
        terms: body.terms,
        sentences: body.sentences,
        mediaRecords: body.mediaRecords,
        books: body.books,
        exams: body.exams,
        quizQuestions: body.quizQuestions,
        mediaAssets: body.mediaAssets,
        customAffixes: body.customAffixes,
        customAbbreviations: body.customAbbreviations
      });

      serverCloudSnapshot = merged.snapshot;
      saveUnifiedCloudMirror(serverCloudSnapshot);

      res.setHeader('Cache-Control', 'no-store');
      res.json({
        success: true,
        appliedCount: merged.appliedCount,
        skippedIdenticalCount: merged.skippedIdenticalCount,
        updatedAt: serverCloudSnapshot.updatedAt
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'تعذر تحديث المكتبة السحابية'
      });
    }
  });

  // ==========================================================================
  // 7. UMEDT-DATA API Contract v1 (/api/v1/*)
  // ==========================================================================
  const resolveServerCollectionByDomain = (domainRaw: string): unknown[] | null => {
    const d = String(domainRaw || '').trim().toLowerCase();
    if (d === 'blocks' || d === 'block') return serverCloudSnapshot.blocks || [];
    if (d === 'subjects' || d === 'subject') return serverCloudSnapshot.subjects || [];
    if (d === 'topics' || d === 'topic') return serverCloudSnapshot.topics || [];
    if (d === 'terms' || d === 'term') return serverCloudSnapshot.terms || [];
    if (d === 'sentences' || d === 'sentence') return serverCloudSnapshot.sentences || [];
    if (
      d === 'customaffixes' ||
      d === 'custom-affixes' ||
      d === 'affixes' ||
      d === 'affix'
    ) {
      return serverCloudSnapshot.customAffixes || [];
    }
    if (
      d === 'customabbreviations' ||
      d === 'custom-abbreviations' ||
      d === 'abbreviations' ||
      d === 'abbreviation' ||
      d === 'abbr'
    ) {
      return serverCloudSnapshot.customAbbreviations || [];
    }
    if (d === 'books' || d === 'book') return serverCloudSnapshot.books || [];
    if (d === 'exams' || d === 'exam') return serverCloudSnapshot.exams || [];
    if (d === 'questions' || d === 'quizquestions' || d === 'question') {
      return serverCloudSnapshot.quizQuestions || [];
    }
    if (
      d === 'media' ||
      d === 'mediaassets' ||
      d === 'media-assets' ||
      d === 'media_assets' ||
      d === 'media-index'
    ) {
      return serverCloudSnapshot.mediaAssets || [];
    }
    const dynamicMatch = (serverCloudSnapshot.dynamicCollections || []).find(
      (col) =>
        col.id.toLowerCase() === d ||
        (col.name || '').toLowerCase() === d ||
        col.contentType.toLowerCase() === d
    );
    return dynamicMatch ? dynamicMatch.items : null;
  };

  const getCanonicalCatalogCollections = () => {
    const hashes = serverCloudSnapshot.collectionHashes || {};
    return [
      { id: 'blocks', domain: 'blocks', name: 'Medical Blocks', contentType: 'block', rendererType: 'block_hub', endpoint: '/api/v1/collections/blocks', count: serverCloudSnapshot.blocks.length, recordCount: serverCloudSnapshot.blocks.length, sha256: hashes.blocks || '' },
      { id: 'subjects', domain: 'subjects', name: 'Medical Subjects', contentType: 'subject', rendererType: 'subject_list', endpoint: '/api/v1/collections/subjects', count: serverCloudSnapshot.subjects.length, recordCount: serverCloudSnapshot.subjects.length, sha256: hashes.subjects || '' },
      { id: 'topics', domain: 'topics', name: 'Study Topics', contentType: 'topic', rendererType: 'topic_article', endpoint: '/api/v1/collections/topics', count: serverCloudSnapshot.topics.length, recordCount: serverCloudSnapshot.topics.length, sha256: hashes.topics || '' },
      { id: 'terms', domain: 'terms', name: 'Medical Lexicon Terms', contentType: 'term', rendererType: 'lexicon_term', endpoint: '/api/v1/collections/terms', count: serverCloudSnapshot.terms.length, recordCount: serverCloudSnapshot.terms.length, sha256: hashes.terms || '' },
      { id: 'sentences', domain: 'sentences', name: 'Clinical Sentences', contentType: 'sentence', rendererType: 'bilingual_sentence', endpoint: '/api/v1/collections/sentences', count: serverCloudSnapshot.sentences.length, recordCount: serverCloudSnapshot.sentences.length, sha256: hashes.sentences || '' },
      { id: 'custom-affixes', domain: 'customAffixes', name: 'Morphological Affixes', contentType: 'affix', rendererType: 'morphology_rule', endpoint: '/api/v1/collections/customAffixes', count: (serverCloudSnapshot.customAffixes || []).length, recordCount: (serverCloudSnapshot.customAffixes || []).length, sha256: hashes['custom-affixes'] || hashes.customAffixes || hashes.affixes || '' },
      { id: 'custom-abbreviations', domain: 'customAbbreviations', name: 'Clinical Abbreviations', contentType: 'abbreviation', rendererType: 'clinical_abbr', endpoint: '/api/v1/collections/customAbbreviations', count: (serverCloudSnapshot.customAbbreviations || []).length, recordCount: (serverCloudSnapshot.customAbbreviations || []).length, sha256: hashes['custom-abbreviations'] || hashes.customAbbreviations || hashes.abbreviations || '' },
      { id: 'books', domain: 'books', name: 'Academic Books', contentType: 'book', rendererType: 'book_pdf_reader', endpoint: '/api/v1/collections/books', count: (serverCloudSnapshot.books || []).length, recordCount: (serverCloudSnapshot.books || []).length, sha256: hashes.books || '' },
      { id: 'questions', domain: 'questions', name: 'Quiz Question Bank', contentType: 'question', rendererType: 'quiz_runner', endpoint: '/api/v1/collections/questions', count: (serverCloudSnapshot.quizQuestions || []).length, recordCount: (serverCloudSnapshot.quizQuestions || []).length, sha256: hashes.questions || '' },
      { id: 'exams', domain: 'exams', name: 'Exam Packages', contentType: 'exam', rendererType: 'exam_blueprint', endpoint: '/api/v1/collections/exams', count: (serverCloudSnapshot.exams || []).length, recordCount: (serverCloudSnapshot.exams || []).length, sha256: hashes.exams || '' },
      { id: 'media-index', domain: 'mediaAssets', name: 'Media Assets Index', contentType: 'media_asset', rendererType: 'media_gallery', endpoint: '/api/v1/collections/mediaAssets', count: (serverCloudSnapshot.mediaAssets || []).length, recordCount: (serverCloudSnapshot.mediaAssets || []).length, sha256: hashes['media-index'] || hashes.mediaAssets || hashes.media || '' },
      ...(serverCloudSnapshot.dynamicCollections || []).map((col) => ({
        id: col.id,
        domain: col.id,
        name: col.name || col.id,
        contentType: col.contentType,
        rendererType: col.rendererType || 'generic_card',
        endpoint: `/api/v1/collections/${encodeURIComponent(col.id)}`,
        count: col.items.length,
        recordCount: col.items.length,
        sha256: col.sha256 || hashes[col.id] || ''
      }))
    ];
  };

  app.get('/api/v1/catalog', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const registry =
      serverCloudSnapshot.contentTypesRegistry &&
      serverCloudSnapshot.contentTypesRegistry.length > 0
        ? serverCloudSnapshot.contentTypesRegistry
        : [
            { contentType: 'block', rendererType: 'block_hub', displayNameAr: 'البلوكات', displayNameEn: 'Blocks', supportsDownload: true, supportsOfflineCache: true },
            { contentType: 'subject', rendererType: 'subject_list', displayNameAr: 'المواد', displayNameEn: 'Subjects', supportsDownload: true, supportsOfflineCache: true },
            { contentType: 'topic', rendererType: 'topic_article', displayNameAr: 'المواضيع', displayNameEn: 'Topics', supportsDownload: true, supportsOfflineCache: true },
            { contentType: 'term', rendererType: 'lexicon_term', displayNameAr: 'المصطلحات', displayNameEn: 'Terms', supportsDownload: true, supportsOfflineCache: true },
            { contentType: 'sentence', rendererType: 'bilingual_sentence', displayNameAr: 'الجمل', displayNameEn: 'Sentences', supportsDownload: true, supportsOfflineCache: true },
            { contentType: 'affix', rendererType: 'morphology_rule', displayNameAr: 'الجذور الصرفية', displayNameEn: 'Affixes', supportsDownload: true, supportsOfflineCache: true },
            { contentType: 'abbreviation', rendererType: 'clinical_abbr', displayNameAr: 'الاختصارات السريرية', displayNameEn: 'Abbreviations', supportsDownload: true, supportsOfflineCache: true },
            { contentType: 'book', rendererType: 'book_pdf_reader', displayNameAr: 'الكتب', displayNameEn: 'Books', supportsDownload: true, supportsOfflineCache: true },
            { contentType: 'question', rendererType: 'quiz_runner', displayNameAr: 'الأسئلة', displayNameEn: 'Questions', supportsDownload: true, supportsOfflineCache: true },
            { contentType: 'exam', rendererType: 'exam_blueprint', displayNameAr: 'الاختبارات', displayNameEn: 'Exams', supportsDownload: true, supportsOfflineCache: true },
            { contentType: 'media_asset', rendererType: 'media_gallery', displayNameAr: 'الوسائط', displayNameEn: 'Media Assets', supportsDownload: true, supportsOfflineCache: true }
          ];

    res.json({
      catalogSchemaVersion: 2,
      schemaVersion: '2.0.0',
      catalogVersion: serverCloudSnapshot.catalogVersion || serverCloudSnapshot.version,
      version: serverCloudSnapshot.catalogVersion || serverCloudSnapshot.version,
      minAppVersion: APP_VERSION,
      updatedAt: serverCloudSnapshot.updatedAt,
      contentTypesRegistry: registry,
      collections: getCanonicalCatalogCollections()
    });
  });

  app.get('/api/v1/manifest', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const channel = req.query.channel === 'beta' ? 'beta' : 'stable';
    const dataVersion = serverCloudSnapshot.catalogVersion || serverCloudSnapshot.version || BUNDLED_DATA_VERSION;
    const extendedCounts = {
      blocks: serverCloudSnapshot.blocks.length,
      subjects: serverCloudSnapshot.subjects.length,
      topics: serverCloudSnapshot.topics.length,
      terms: serverCloudSnapshot.terms.length,
      sentences: serverCloudSnapshot.sentences.length,
      customAffixes: (serverCloudSnapshot.customAffixes || []).length,
      customAbbreviations: (serverCloudSnapshot.customAbbreviations || []).length,
      books: (serverCloudSnapshot.books || []).length,
      questions: (serverCloudSnapshot.quizQuestions || []).length,
      exams: (serverCloudSnapshot.exams || []).length,
      mediaAssets: (serverCloudSnapshot.mediaAssets || []).length
    };
    res.json({
      packageId: `umed2-pkg-${dataVersion}`,
      dataVersion,
      version: dataVersion,
      catalogVersion: dataVersion,
      schemaVersion: DB_SCHEMA_VERSION,
      minAppVersion: APP_VERSION,
      appVersion: APP_VERSION,
      channel,
      packageFormat: 'zip',
      releasedAt: serverCloudSnapshot.updatedAt,
      updatedAt: serverCloudSnapshot.updatedAt,
      collectionHashes: serverCloudSnapshot.collectionHashes || {},
      filesSha256: serverCloudSnapshot.collectionHashes || {},
      counts: {
        terms: extendedCounts.terms,
        sentences: extendedCounts.sentences,
        topics: extendedCounts.topics,
        affixes: extendedCounts.customAffixes,
        abbreviations: extendedCounts.customAbbreviations
      },
      extendedCounts
    });
  });

  app.get('/api/v1/collections', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      updatedAt: serverCloudSnapshot.updatedAt,
      collections: getCanonicalCatalogCollections().map((c) => ({
        domain: c.domain,
        contentType: c.contentType,
        count: c.count,
        sha256: c.sha256,
        endpoint: c.endpoint
      }))
    });
  });

  app.get('/api/v1/collections/:domain', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const items = resolveServerCollectionByDomain(req.params.domain);
    if (!items) {
      res.status(404).json({ error: `Unknown collection domain: ${req.params.domain}` });
      return;
    }

    const blockId = typeof req.query.blockId === 'string' ? req.query.blockId.trim() : '';
    const subjectId = typeof req.query.subjectId === 'string' ? req.query.subjectId.trim() : '';
    const topicId = typeof req.query.topicId === 'string' ? req.query.topicId.trim() : '';
    const linkedEntityType = typeof req.query.linkedEntityType === 'string' ? req.query.linkedEntityType.trim().toLowerCase() : '';
    const linkedEntityId = typeof req.query.linkedEntityId === 'string' ? req.query.linkedEntityId.trim() : '';
    const mediaType = typeof req.query.mediaType === 'string' ? req.query.mediaType.trim().toLowerCase() : '';
    const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';

    const filtered = (items as Array<Record<string, unknown>>).filter((item) => {
      if (blockId && item.blockId !== blockId) return false;
      if (subjectId && item.subjectId !== subjectId) return false;
      if (topicId) {
        const topicIdsArr = Array.isArray(item.topicIds) ? item.topicIds.map(String) : [];
        if (item.topicId !== topicId && !topicIdsArr.includes(topicId)) return false;
      }
      if (linkedEntityType && String(item.linkedEntityType || '').toLowerCase() !== linkedEntityType) {
        return false;
      }
      if (linkedEntityId && String(item.linkedEntityId || '') !== linkedEntityId) {
        return false;
      }
      if (
        mediaType &&
        String(item.mediaType || item.kind || '').toLowerCase() !== mediaType
      ) {
        return false;
      }
      if (q && !JSON.stringify(item).toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });

    const limitParam = Number(req.query.limit);
    const pageParam = Number(req.query.page);
    const hasPagination =
      Number.isFinite(limitParam) && limitParam > 0 && Number.isInteger(limitParam);
    const limit = hasPagination ? limitParam : filtered.length || 50;
    const page = Number.isFinite(pageParam) && pageParam >= 1 ? Math.floor(pageParam) : 1;
    const start = hasPagination ? (page - 1) * limit : 0;
    const pagedItems = hasPagination ? filtered.slice(start, start + limit) : filtered;

    res.json({
      domain: req.params.domain,
      totalCount: filtered.length,
      count: pagedItems.length,
      page,
      limit,
      updatedAt: serverCloudSnapshot.updatedAt,
      items: pagedItems
    });
  });

  app.get('/api/v1/content/:domain/:id', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const items = resolveServerCollectionByDomain(req.params.domain);
    if (!items) {
      res.status(404).json({ error: `Unknown collection domain: ${req.params.domain}` });
      return;
    }
    const found = (items as Array<Record<string, unknown>>).find(
      (item) => String(item.id || '') === req.params.id
    );
    if (!found) {
      res.status(404).json({ error: `Item not found: ${req.params.id}` });
      return;
    }

    const entityId = String(found.id || req.params.id);
    const linkedMedia = (serverCloudSnapshot.mediaAssets || []).filter(
      (ma) =>
        ma.linkedEntityId === entityId ||
        ma.topicId === entityId ||
        ma.subjectId === entityId ||
        ma.blockId === entityId ||
        ma.bookId === entityId
    );
    const relations = {
      subjects: (serverCloudSnapshot.subjects || [])
        .filter((s) => s.blockId === entityId)
        .map((s) => s.id),
      topics: (serverCloudSnapshot.topics || [])
        .filter((t) => t.blockId === entityId || t.subjectId === entityId)
        .map((t) => t.id),
      questions: (serverCloudSnapshot.quizQuestions || [])
        .filter((q) => q.blockId === entityId || q.subjectId === entityId || q.topicId === entityId)
        .map((q) => q.id),
      exams: (serverCloudSnapshot.exams || [])
        .filter(
          (ex) =>
            ex.blockId === entityId ||
            ex.subjectId === entityId ||
            (ex.topicIds || []).includes(entityId)
        )
        .map((ex) => ex.id),
      books: (serverCloudSnapshot.books || [])
        .filter(
          (bk) =>
            bk.blockId === entityId ||
            bk.subjectId === entityId ||
            (bk.topicIds || []).includes(entityId)
        )
        .map((bk) => bk.id)
    };

    res.json({
      domain: req.params.domain,
      id: entityId,
      contentType: String(found.mediaType || found.type || req.params.domain),
      updatedAt: serverCloudSnapshot.updatedAt,
      item: found,
      linkedMedia,
      relations
    });
  });

  app.get('/api/v1/search', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const q = String(req.query.q || '').trim().toLowerCase();
    const domainFilter = String(req.query.domain || '').trim().toLowerCase();
    if (!q) {
      res.json({ query: '', totalMatches: 0, results: [] });
      return;
    }
    const matches: Array<{ domain: string; id: string; title: string }> = [];
    const scan = (domain: string, arr: Array<Record<string, unknown>>) => {
      if (domainFilter && domain.toLowerCase() !== domainFilter) return;
      for (const item of arr) {
        const hay = JSON.stringify(item).toLowerCase();
        if (hay.includes(q)) {
          matches.push({
            domain,
            id: String(item.id || ''),
            title: String(
              item.titleEn ||
                item.titleAr ||
                item.title ||
                item.term ||
                item.en ||
                item.affix ||
                item.abbr ||
                item.questionEn ||
                item.fileName ||
                item.id ||
                ''
            )
          });
        }
      }
    };
    scan('blocks', serverCloudSnapshot.blocks as unknown as Array<Record<string, unknown>>);
    scan('subjects', serverCloudSnapshot.subjects as unknown as Array<Record<string, unknown>>);
    scan('topics', serverCloudSnapshot.topics as unknown as Array<Record<string, unknown>>);
    scan('terms', serverCloudSnapshot.terms as unknown as Array<Record<string, unknown>>);
    scan('sentences', serverCloudSnapshot.sentences as unknown as Array<Record<string, unknown>>);
    scan('customAffixes', (serverCloudSnapshot.customAffixes || []) as unknown as Array<Record<string, unknown>>);
    scan('customAbbreviations', (serverCloudSnapshot.customAbbreviations || []) as unknown as Array<Record<string, unknown>>);
    scan('books', (serverCloudSnapshot.books || []) as unknown as Array<Record<string, unknown>>);
    scan('questions', (serverCloudSnapshot.quizQuestions || []) as unknown as Array<Record<string, unknown>>);
    scan('exams', (serverCloudSnapshot.exams || []) as unknown as Array<Record<string, unknown>>);
    scan('mediaAssets', (serverCloudSnapshot.mediaAssets || []) as unknown as Array<Record<string, unknown>>);
    res.json({
      query: q,
      totalMatches: matches.length,
      results: matches.slice(0, 50)
    });
  });

  const handleSyncPlan = (clientHashes: Record<string, string>) => {
    const serverHashes = serverCloudSnapshot.collectionHashes || {};
    const changedDomains: string[] = [];
    for (const [domain, hash] of Object.entries(serverHashes)) {
      if (clientHashes[domain] !== hash) {
        changedDomains.push(domain);
      }
    }
    return {
      version: serverCloudSnapshot.catalogVersion || serverCloudSnapshot.version,
      catalogVersion: serverCloudSnapshot.catalogVersion || serverCloudSnapshot.version,
      updatedAt: serverCloudSnapshot.updatedAt,
      changedDomains,
      serverHashes,
      upToDate: changedDomains.length === 0
    };
  };

  app.get('/api/v1/sync/plan', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    let clientHashes: Record<string, string> = {};
    const rawHashes = typeof req.query.hashes === 'string' ? req.query.hashes.trim() : '';
    if (rawHashes) {
      if (rawHashes.startsWith('{')) {
        try {
          clientHashes = JSON.parse(rawHashes) as Record<string, string>;
        } catch {
          clientHashes = {};
        }
      } else {
        for (const pair of rawHashes.split(',')) {
          const [k, v] = pair.split(':');
          if (k && v) clientHashes[k.trim()] = v.trim();
        }
      }
    }
    res.json(handleSyncPlan(clientHashes));
  });

  app.post('/api/v1/sync/plan', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const clientHashes = ((req.body && req.body.hashes) || {}) as Record<string, string>;
    res.json(handleSyncPlan(clientHashes));
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr: false,
        watch: null
      },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`UMED-2 Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
