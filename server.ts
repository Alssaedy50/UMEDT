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
import type { DataPackagePayload, PublishedReleaseBundle } from './src/types/lexicon';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '15mb' }));

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
  app.post('/api/telegram/test', async (req, res) => {
    try {
      const { botToken, chatId, text } = req.body as {
        botToken?: string;
        chatId?: string;
        text?: string;
      };

      const token = (botToken || '').trim();
      const targetChatId = (chatId || '').trim();
      if (!token || !targetChatId) {
        res.status(400).json({
          ok: false,
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
            '✅ تم ربط تطبيق المعجم الطبي الموحد (UMED-2) بنجاح مع تليجرام للنسخ الاحتياطي الدوري.',
          parse_mode: 'HTML'
        })
      });

      const data = (await tgRes.json()) as { ok?: boolean; description?: string };
      res.status(tgRes.ok ? 200 : 400).json(data);
    } catch (err) {
      res.status(500).json({
        ok: false,
        description: err instanceof Error ? err.message : 'تعذر الاتصال بخوادم تليجرام'
      });
    }
  });

  app.post('/api/telegram/send-backup', async (req, res) => {
    try {
      const { botToken, chatId, filename, jsonString, caption } = req.body as {
        botToken?: string;
        chatId?: string;
        filename?: string;
        jsonString?: string;
        caption?: string;
      };

      const token = (botToken || '').trim();
      const targetChatId = (chatId || '').trim();
      if (!token || !targetChatId || typeof jsonString !== 'string') {
        res.status(400).json({
          ok: false,
          description: 'بيانات البوت أو ملف النسخة الاحتياطية غير مكتملة.'
        });
        return;
      }

      const formData = new FormData();
      formData.append('chat_id', targetChatId);
      const blob = new Blob([jsonString], { type: 'application/json' });
      formData.append('document', blob, filename || 'umed2-backup.json');
      if (caption) {
        formData.append('caption', caption);
      }

      const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
        method: 'POST',
        body: formData
      });

      const data = (await tgRes.json()) as { ok?: boolean; description?: string };
      res.status(tgRes.ok ? 200 : 400).json(data);
    } catch (err) {
      res.status(500).json({
        ok: false,
        description: err instanceof Error ? err.message : 'تعذر إرسال النسخة الاحتياطية إلى تليجرام'
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
      author: 'UMED-2 Cloud OTA Server',
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
