package org.umed2.dictengine;

import android.Manifest;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.media.AudioAttributes;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.ParcelFileDescriptor;
import android.provider.MediaStore;
import android.provider.Settings;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.util.Base64;
import android.view.View;
import android.view.accessibility.AccessibilityManager;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
import android.webkit.URLUtil;
import android.webkit.WebSettings;
import android.webkit.WebView;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.NonNull;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;

public class MainActivity extends BridgeActivity {

    private static final int REQ_RECORD_AUDIO_CODE = 7101;
    private static final int REQ_VOICE_SEARCH_CODE = 7102;
    private static final String KEYSTORE_ALIAS = "UMEDT_BOT_TOKEN_KEY_V1";
    private static final String ANDROID_KEYSTORE = "AndroidKeyStore";
    private static final String AES_GCM_TRANSFORMATION = "AES/GCM/NoPadding";

    private TextToSpeech nativeTts;
    private volatile boolean nativeTtsReady = false;
    private volatile boolean nativeTtsTriedGoogleFallback = false;
    private volatile boolean nativeBridgeAttached = false;
    private volatile String pendingTtsText = null;
    private volatile String pendingTtsLang = null;
    private volatile String pendingTtsKey = null;

    private ActivityResultLauncher<Intent> voiceSearchLauncher;
    private SpeechRecognizer nativeSpeechRecognizer;
    private volatile String pendingVoiceLang = null;
    private volatile boolean voiceRecognizerActive = false;

    @Override
    protected void load() {
        // CRITICAL: Register JS interfaces BEFORE super.load() invokes webView.loadUrl()
        // so Android WebView injects window.UMEDAndroidBridge and window.UMEDNativeDownloader
        // into the initial JavaScript context on first launch (without needing a reload).
        try {
            View rawView = findViewById(com.getcapacitor.android.R.id.webview);
            if (rawView instanceof WebView) {
                attachNativeBridgeToWebView((WebView) rawView);
            }
        } catch (Exception ignored) {
        }
        super.load();
        attachNativeDownloadBridge();
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        voiceSearchLauncher = registerForActivityResult(
                new ActivityResultContracts.StartActivityForResult(),
                result -> {
                    voiceRecognizerActive = false;
                    try {
                        Intent data = result.getData();
                        if (result.getResultCode() == RESULT_OK && data != null) {
                            ArrayList<String> matches = data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
                            if (matches != null && !matches.isEmpty() && matches.get(0) != null && !matches.get(0).trim().isEmpty()) {
                                String spokenText = matches.get(0).trim();
                                dispatchJsEvent("umed-voice-search-result", "{\"text\":" + JSONObject.quote(spokenText) + "}");
                                return;
                            }
                        }
                        dispatchJsEvent("umed-voice-search-error", "{\"code\":\"cancelled\"}");
                    } catch (Exception e) {
                        dispatchJsEvent("umed-voice-search-error", "{\"code\":\"error\",\"message\":" + JSONObject.quote("تعذر معالجة الصوت الملتقط. حاول مرة أخرى.") + "}");
                    }
                }
        );
        applySafeSystemBarInsets();
        attachNativeDownloadBridge();
        initNativeTts(false);

        // Restore the clipboard foreground monitor whenever UMEDT is launched.
        // This keeps copy-to-translate independent from the WebView lifecycle.
        UMEDTClipboardMonitorService.startMonitorIfEnabled(getApplicationContext());
    }

    @Override
    public void onStart() {
        super.onStart();
        attachNativeDownloadBridge();
    }

    @Override
    public void onDestroy() {
        try {
            destroyNativeSpeechRecognizer();
        } catch (Exception ignored) {
        }
        try {
            if (nativeTts != null) {
                nativeTts.stop();
                nativeTts.shutdown();
                nativeTts = null;
                nativeTtsReady = false;
            }
        } catch (Exception ignored) {
        }
        super.onDestroy();
    }

    private void initNativeTts(final boolean forceGoogleEngine) {
        if (nativeTts != null && nativeTtsReady && !forceGoogleEngine) {
            return;
        }
        try {
            if (nativeTts != null) {
                try {
                    nativeTts.stop();
                    nativeTts.shutdown();
                } catch (Exception ignored) {
                }
                nativeTts = null;
                nativeTtsReady = false;
            }
            TextToSpeech.OnInitListener listener = status -> {
                if (status == TextToSpeech.SUCCESS && nativeTts != null) {
                    nativeTtsReady = true;
                    try {
                        nativeTts.setAudioAttributes(
                                new AudioAttributes.Builder()
                                        .setUsage(AudioAttributes.USAGE_MEDIA)
                                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                                        .build()
                        );
                        nativeTts.setSpeechRate(0.92f);
                        nativeTts.setPitch(1.0f);
                        nativeTts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                            @Override
                            public void onStart(String utteranceId) {
                                dispatchJsEvent("umed-native-tts-start", "{\"key\":" + JSONObject.quote(utteranceId != null ? utteranceId : "") + "}");
                            }

                            @Override
                            public void onDone(String utteranceId) {
                                dispatchJsEvent("umed-native-tts-end", "{\"key\":" + JSONObject.quote(utteranceId != null ? utteranceId : "") + "}");
                            }

                            @Override
                            public void onError(String utteranceId) {
                                dispatchJsEvent("umed-native-tts-end", "{\"key\":" + JSONObject.quote(utteranceId != null ? utteranceId : "") + ",\"error\":true}");
                            }

                            @Override
                            public void onError(String utteranceId, int errorCode) {
                                dispatchJsEvent("umed-native-tts-end", "{\"key\":" + JSONObject.quote(utteranceId != null ? utteranceId : "") + ",\"error\":true}");
                            }
                        });
                    } catch (Exception ignored) {
                    }
                    final String queuedText = pendingTtsText;
                    final String queuedLang = pendingTtsLang;
                    final String queuedKey = pendingTtsKey;
                    pendingTtsText = null;
                    pendingTtsLang = null;
                    pendingTtsKey = null;
                    if (queuedText != null && !queuedText.trim().isEmpty()) {
                        speakInternal(queuedText, queuedLang, queuedKey);
                    }
                } else {
                    nativeTtsReady = false;
                    if (nativeTts != null) {
                        try {
                            nativeTts.shutdown();
                        } catch (Exception ignored) {
                        }
                        nativeTts = null;
                    }
                    if (!forceGoogleEngine && !nativeTtsTriedGoogleFallback) {
                        nativeTtsTriedGoogleFallback = true;
                        runOnUiThread(() -> initNativeTts(true));
                    }
                }
            };
            if (forceGoogleEngine) {
                nativeTts = new TextToSpeech(getApplicationContext(), listener, "com.google.android.tts");
            } else {
                nativeTts = new TextToSpeech(getApplicationContext(), listener);
            }
        } catch (Exception ignored) {
            nativeTtsReady = false;
            nativeTts = null;
            if (!forceGoogleEngine && !nativeTtsTriedGoogleFallback) {
                nativeTtsTriedGoogleFallback = true;
                runOnUiThread(() -> initNativeTts(true));
            }
        }
    }

    private boolean speakInternal(String text, String lang, String key) {
        if (nativeTts == null || !nativeTtsReady || text == null || text.trim().isEmpty()) {
            return false;
        }
        try {
            Locale targetLocale = resolveLocale(lang);
            int langRes = nativeTts.setLanguage(targetLocale);
            if (langRes == TextToSpeech.LANG_MISSING_DATA || langRes == TextToSpeech.LANG_NOT_SUPPORTED) {
                int fallbackRes = targetLocale.getLanguage().equalsIgnoreCase("ar")
                        ? nativeTts.setLanguage(new Locale("ar"))
                        : nativeTts.setLanguage(Locale.ENGLISH);
                if (fallbackRes == TextToSpeech.LANG_MISSING_DATA || fallbackRes == TextToSpeech.LANG_NOT_SUPPORTED) {
                    nativeTts.setLanguage(Locale.getDefault());
                }
            }
            nativeTts.setSpeechRate(0.92f);
            nativeTts.setPitch(1.0f);
            String utteranceId = (key != null && !key.trim().isEmpty())
                    ? key.trim()
                    : ("umedt-tts-" + System.currentTimeMillis());
            Bundle params = new Bundle();
            params.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, 1.0f);
            int speakStatus = nativeTts.speak(text.trim(), TextToSpeech.QUEUE_FLUSH, params, utteranceId);
            if (speakStatus != TextToSpeech.SUCCESS && !nativeTtsTriedGoogleFallback) {
                nativeTtsTriedGoogleFallback = true;
                pendingTtsText = text.trim();
                pendingTtsLang = lang;
                pendingTtsKey = key;
                runOnUiThread(() -> initNativeTts(true));
                return true;
            }
            return speakStatus == TextToSpeech.SUCCESS;
        } catch (Exception ignored) {
            return false;
        }
    }

    private Locale resolveLocale(String lang) {
        if (lang == null || lang.trim().isEmpty()) {
            return Locale.US;
        }
        String normalized = lang.trim().replace('_', '-');
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                Locale parsed = Locale.forLanguageTag(normalized);
                if (parsed != null && parsed.getLanguage() != null && !parsed.getLanguage().isEmpty()) {
                    return parsed;
                }
            }
        } catch (Exception ignored) {
        }
        if (normalized.toLowerCase(Locale.ROOT).startsWith("ar")) {
            return new Locale("ar", "SA");
        }
        return Locale.US;
    }

    private void dispatchJsEvent(final String eventName, final String detailJson) {
        runOnUiThread(() -> {
            try {
                if (this.bridge != null && this.bridge.getWebView() != null) {
                    String script = "window.dispatchEvent(new CustomEvent(" + JSONObject.quote(eventName) + ", { detail: " + detailJson + " }));";
                    this.bridge.getWebView().evaluateJavascript(script, null);
                }
            } catch (Exception ignored) {
            }
        });
    }

    private void destroyNativeSpeechRecognizer() {
        voiceRecognizerActive = false;
        if (nativeSpeechRecognizer != null) {
            try {
                nativeSpeechRecognizer.cancel();
            } catch (Exception ignored) {
            }
            try {
                nativeSpeechRecognizer.destroy();
            } catch (Exception ignored) {
            }
            nativeSpeechRecognizer = null;
        }
    }

    private Intent buildVoiceRecognizerIntent(final String resolvedLang) {
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, resolvedLang);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, resolvedLang);
        intent.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getPackageName());
        intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3);
        intent.putExtra(
                RecognizerIntent.EXTRA_PROMPT,
                resolvedLang.toLowerCase(Locale.ROOT).startsWith("ar")
                        ? "انطق الكلمة أو المصطلح بالعربية..."
                        : "Speak the English word or medical term..."
        );
        return intent;
    }

    private void launchVoiceIntentFallback(final String resolvedLang) {
        runOnUiThread(() -> {
            try {
                destroyNativeSpeechRecognizer();
                Intent intent = buildVoiceRecognizerIntent(resolvedLang);
                voiceRecognizerActive = true;
                dispatchJsEvent("umed-voice-search-started", "{\"engine\":\"intent_dialog\",\"lang\":" + JSONObject.quote(resolvedLang) + "}");
                if (voiceSearchLauncher != null) {
                    voiceSearchLauncher.launch(intent);
                } else {
                    startActivityForResult(intent, REQ_VOICE_SEARCH_CODE);
                }
            } catch (ActivityNotFoundException e) {
                voiceRecognizerActive = false;
                dispatchJsEvent(
                        "umed-voice-search-error",
                        "{\"code\":\"not_available\",\"message\":" + JSONObject.quote("لا توجد خدمة تعرّف على الصوت مفعّلة على هذا الجهاز. فعّل تطبيق Google أو خدمات الكلام من إعدادات الهاتف.") + "}"
                );
            } catch (Exception e) {
                voiceRecognizerActive = false;
                dispatchJsEvent(
                        "umed-voice-search-error",
                        "{\"code\":\"launch_failed\",\"message\":" + JSONObject.quote("تعذر فتح خدمة الإدخال الصوتي على هذا الجهاز.") + "}"
                );
            }
        });
    }

    private void launchNativeVoiceSearchOnUi(final String resolvedLang) {
        runOnUiThread(() -> {
            try {
                if (nativeTts != null) {
                    try {
                        nativeTts.stop();
                    } catch (Exception ignored) {
                    }
                }
                destroyNativeSpeechRecognizer();

                if (SpeechRecognizer.isRecognitionAvailable(MainActivity.this)) {
                    final SpeechRecognizer recognizer = SpeechRecognizer.createSpeechRecognizer(MainActivity.this);
                    if (recognizer != null) {
                        nativeSpeechRecognizer = recognizer;
                        recognizer.setRecognitionListener(new RecognitionListener() {
                            @Override
                            public void onReadyForSpeech(Bundle params) {
                                voiceRecognizerActive = true;
                                dispatchJsEvent("umed-voice-search-started", "{\"engine\":\"native_in_app\",\"lang\":" + JSONObject.quote(resolvedLang) + "}");
                            }

                            @Override
                            public void onBeginningOfSpeech() {
                                voiceRecognizerActive = true;
                            }

                            @Override
                            public void onRmsChanged(float rmsdB) {
                            }

                            @Override
                            public void onBufferReceived(byte[] buffer) {
                            }

                            @Override
                            public void onEndOfSpeech() {
                            }

                            @Override
                            public void onError(int error) {
                                destroyNativeSpeechRecognizer();
                                if (error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT) {
                                    dispatchJsEvent(
                                            "umed-voice-search-error",
                                            "{\"code\":\"no_speech\",\"message\":" + JSONObject.quote("لم يتم التقاط أي صوت. اضغط زر الميكروفون وتحدث بوضوح.") + "}"
                                    );
                                    return;
                                }
                                if (error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS) {
                                    dispatchJsEvent(
                                            "umed-voice-search-error",
                                            "{\"code\":\"permission_denied\",\"message\":" + JSONObject.quote("يرجى السماح بصلاحية الميكروفون من إعدادات التطبيق لاستخدام الإدخال الصوتي.") + "}"
                                    );
                                    return;
                                }
                                if (error == SpeechRecognizer.ERROR_NETWORK || error == SpeechRecognizer.ERROR_NETWORK_TIMEOUT) {
                                    dispatchJsEvent(
                                            "umed-voice-search-error",
                                            "{\"code\":\"network\",\"message\":" + JSONObject.quote("تعذر التعرف على الصوت. تحقق من اتصال الإنترنت أو حزمة الصوت الأوفلاين على هاتفك.") + "}"
                                    );
                                    return;
                                }
                                // Fallback to system RecognizerIntent dialog for client/busy/audio/server errors
                                launchVoiceIntentFallback(resolvedLang);
                            }

                            @Override
                            public void onResults(Bundle results) {
                                destroyNativeSpeechRecognizer();
                                if (results != null) {
                                    ArrayList<String> matches = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                                    if (matches != null && !matches.isEmpty() && matches.get(0) != null && !matches.get(0).trim().isEmpty()) {
                                        String spokenText = matches.get(0).trim();
                                        dispatchJsEvent("umed-voice-search-result", "{\"text\":" + JSONObject.quote(spokenText) + "}");
                                        return;
                                    }
                                }
                                dispatchJsEvent(
                                        "umed-voice-search-error",
                                        "{\"code\":\"no_speech\",\"message\":" + JSONObject.quote("لم يتم التقاط كلمة واضحة. حاول مرة أخرى.") + "}"
                                );
                            }

                            @Override
                            public void onPartialResults(Bundle partialResults) {
                                if (partialResults != null) {
                                    ArrayList<String> partials = partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                                    if (partials != null && !partials.isEmpty() && partials.get(0) != null && !partials.get(0).trim().isEmpty()) {
                                        dispatchJsEvent("umed-voice-search-partial", "{\"text\":" + JSONObject.quote(partials.get(0).trim()) + "}");
                                    }
                                }
                            }

                            @Override
                            public void onEvent(int eventType, Bundle params) {
                            }
                        });

                        Intent listenIntent = buildVoiceRecognizerIntent(resolvedLang);
                        voiceRecognizerActive = true;
                        dispatchJsEvent("umed-voice-search-started", "{\"engine\":\"native_in_app\",\"lang\":" + JSONObject.quote(resolvedLang) + "}");
                        recognizer.startListening(listenIntent);
                        return;
                    }
                }
            } catch (Exception ignored) {
                destroyNativeSpeechRecognizer();
            }
            launchVoiceIntentFallback(resolvedLang);
        });
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_RECORD_AUDIO_CODE) {
            String langToResume = pendingVoiceLang;
            pendingVoiceLang = null;
            boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            if (langToResume != null) {
                if (granted) {
                    launchNativeVoiceSearchOnUi(langToResume);
                } else {
                    dispatchJsEvent(
                            "umed-voice-search-error",
                            "{\"code\":\"permission_denied\",\"message\":" + JSONObject.quote("تم رفض صلاحية الميكروفون. فعّل إذن الميكروفون من إعدادات التطبيق لاستخدام البحث الصوتي.") + "}"
                    );
                }
            }
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_VOICE_SEARCH_CODE) {
            voiceRecognizerActive = false;
            try {
                if (resultCode == RESULT_OK && data != null) {
                    ArrayList<String> matches = data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
                    if (matches != null && !matches.isEmpty() && matches.get(0) != null && !matches.get(0).trim().isEmpty()) {
                        String spokenText = matches.get(0).trim();
                        dispatchJsEvent("umed-voice-search-result", "{\"text\":" + JSONObject.quote(spokenText) + "}");
                        return;
                    }
                }
                dispatchJsEvent("umed-voice-search-error", "{\"code\":\"cancelled\"}");
            } catch (Exception e) {
                dispatchJsEvent("umed-voice-search-error", "{\"code\":\"error\"}");
            }
        }
    }

    private void applySafeSystemBarInsets() {
        try {
            WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
            getWindow().setStatusBarColor(Color.parseColor("#020617"));
            getWindow().setNavigationBarColor(Color.parseColor("#020617"));
            WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
            if (controller != null) {
                controller.setAppearanceLightStatusBars(false);
                controller.setAppearanceLightNavigationBars(false);
            }
            View contentView = findViewById(android.R.id.content);
            if (contentView != null) {
                contentView.setBackgroundColor(Color.parseColor("#020617"));
                ViewCompat.setOnApplyWindowInsetsListener(contentView, (v, windowInsets) -> {
                    Insets sysBars = windowInsets.getInsets(
                            WindowInsetsCompat.Type.systemBars()
                                    | WindowInsetsCompat.Type.displayCutout()
                                    | WindowInsetsCompat.Type.ime()
                    );
                    v.setPadding(sysBars.left, sysBars.top, sysBars.right, sysBars.bottom);
                    return WindowInsetsCompat.CONSUMED;
                });
                ViewCompat.requestApplyInsets(contentView);
            }
        } catch (Exception ignored) {
        }
    }

    private void attachNativeBridgeToWebView(WebView webView) {
        if (webView == null) {
            return;
        }
        try {
            webView.getSettings().setJavaScriptEnabled(true);
            webView.getSettings().setAllowFileAccess(true);
            webView.getSettings().setDomStorageEnabled(true);
            webView.getSettings().setDatabaseEnabled(true);
            webView.getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
            webView.getSettings().setMediaPlaybackRequiresUserGesture(false);

            if (!nativeBridgeAttached) {
                UMEDNativeDownloader bridgeInstance = new UMEDNativeDownloader();
                webView.addJavascriptInterface(bridgeInstance, "UMEDNativeDownloader");
                webView.addJavascriptInterface(bridgeInstance, "UMEDAndroidBridge");
                nativeBridgeAttached = true;
            }
        } catch (Exception ignored) {
        }
    }

    private void attachNativeDownloadBridge() {
        try {
            if (this.bridge == null || this.bridge.getWebView() == null) {
                return;
            }
            WebView webView = this.bridge.getWebView();
            attachNativeBridgeToWebView(webView);

            webView.setDownloadListener(new DownloadListener() {
                @Override
                public void onDownloadStart(String url, String userAgent, String contentDisposition, String mimetype, long contentLength) {
                    try {
                        if (url != null && url.startsWith("data:")) {
                            int commaIndex = url.indexOf(',');
                            if (commaIndex != -1) {
                                String header = url.substring(5, commaIndex);
                                String dataPart = url.substring(commaIndex + 1);
                                String resolvedMime = mimetype != null && !mimetype.isEmpty() ? mimetype : "application/octet-stream";
                                if (header.contains(";")) {
                                    resolvedMime = header.substring(0, header.indexOf(';'));
                                }
                                String fileName = URLUtil.guessFileName(url, contentDisposition, resolvedMime);
                                String base64Payload;
                                if (header.contains("base64")) {
                                    base64Payload = Uri.decode(dataPart);
                                } else {
                                    byte[] rawBytes = Uri.decode(dataPart).getBytes("UTF-8");
                                    base64Payload = Base64.encodeToString(rawBytes, Base64.NO_WRAP);
                                }
                                new UMEDNativeDownloader().saveBase64FileToDownloads(fileName, base64Payload, resolvedMime);
                            }
                        }
                    } catch (Exception ignored) {
                    }
                }
            });
        } catch (Exception ignored) {
        }
    }

    private String sanitizeFileName(String rawName) {
        if (rawName == null || rawName.trim().isEmpty()) {
            return "umedt-export-" + System.currentTimeMillis() + ".json";
        }
        String cleaned = rawName.trim().replaceAll("[\\\\/:*?\"<>|]", "_");
        return cleaned.isEmpty() ? "umedt-export.json" : cleaned;
    }

    private File getAppMirrorUmedtDir() {
        File base = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        if (base == null) {
            base = getFilesDir();
        }
        File dir = new File(base, "UMEDT");
        if (!dir.exists()) {
            //noinspection ResultOfMethodCallIgnored
            dir.mkdirs();
        }
        return dir;
    }

    public class UMEDNativeDownloader {

        @JavascriptInterface
        public boolean isAvailable() {
            return true;
        }

        @JavascriptInterface
        public float getSystemFontScale() {
            try {
                return MainActivity.this.getResources().getConfiguration().fontScale;
            } catch (Exception ignored) {
                return 1.0f;
            }
        }

        @JavascriptInterface
        public void setUseSystemFontScale(final boolean useSystemFont) {
            try {
                MainActivity.this.runOnUiThread(() -> {
                    try {
                        if (MainActivity.this.bridge != null && MainActivity.this.bridge.getWebView() != null) {
                            WebSettings settings = MainActivity.this.bridge.getWebView().getSettings();
                            if (useSystemFont) {
                                float sysScale = MainActivity.this.getResources().getConfiguration().fontScale;
                                int zoom = Math.max(75, Math.min(130, Math.round(sysScale * 100f)));
                                settings.setTextZoom(zoom);
                            } else {
                                settings.setTextZoom(100);
                            }
                        }
                    } catch (Exception ignored) {
                    }
                });
            } catch (Exception ignored) {
            }
        }

        @JavascriptInterface
        public boolean hasMicrophonePermission() {
            return ContextCompat.checkSelfPermission(
                    MainActivity.this,
                    Manifest.permission.RECORD_AUDIO
            ) == PackageManager.PERMISSION_GRANTED;
        }

        @JavascriptInterface
        public boolean requestMicrophonePermission() {
            if (hasMicrophonePermission()) {
                return true;
            }
            ActivityCompat.requestPermissions(
                    MainActivity.this,
                    new String[]{Manifest.permission.RECORD_AUDIO},
                    REQ_RECORD_AUDIO_CODE
            );
            return false;
        }

        @JavascriptInterface
        public boolean isTtsAvailable() {
            if (nativeTts == null) {
                MainActivity.this.runOnUiThread(() -> initNativeTts(false));
            }
            return true;
        }

        @JavascriptInterface
        public String speakText(final String text, final String lang, final String key) {
            JSONObject res = new JSONObject();
            try {
                if (text == null || text.trim().isEmpty()) {
                    res.put("ok", false);
                    res.put("error", "النص فارغ");
                    return res.toString();
                }
                final String trimmedText = text.trim();
                if (nativeTts == null || !nativeTtsReady) {
                    pendingTtsText = trimmedText;
                    pendingTtsLang = lang;
                    pendingTtsKey = key;
                    if (nativeTts == null) {
                        MainActivity.this.runOnUiThread(() -> initNativeTts(false));
                    }
                    res.put("ok", true);
                    res.put("queued", true);
                    return res.toString();
                }
                MainActivity.this.runOnUiThread(() -> {
                    boolean started = speakInternal(trimmedText, lang, key);
                    if (!started) {
                        dispatchJsEvent(
                                "umed-native-tts-end",
                                "{\"key\":" + JSONObject.quote(key != null ? key : "") + ",\"error\":true}"
                        );
                    }
                });
                res.put("ok", true);
            } catch (Exception e) {
                try {
                    res.put("ok", false);
                    res.put("error", e.getMessage() != null ? e.getMessage() : "خطأ في محرك النطق");
                } catch (Exception ignored) {
                }
            }
            return res.toString();
        }

        @JavascriptInterface
        public void stopSpeaking() {
            try {
                pendingTtsText = null;
                pendingTtsLang = null;
                pendingTtsKey = null;
                if (nativeTts != null) {
                    nativeTts.stop();
                }
            } catch (Exception ignored) {
            }
        }

        @JavascriptInterface
        public boolean isVoiceSearchAvailable() {
            try {
                if (SpeechRecognizer.isRecognitionAvailable(MainActivity.this)) {
                    return true;
                }
                Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                List<?> activities = getPackageManager().queryIntentActivities(intent, 0);
                return activities != null && !activities.isEmpty();
            } catch (Exception ignored) {
                return false;
            }
        }

        @JavascriptInterface
        public String startVoiceSearch(final String lang) {
            JSONObject res = new JSONObject();
            try {
                final String resolvedLang = (lang != null && !lang.trim().isEmpty()) ? lang.trim() : "en-US";
                if (!hasMicrophonePermission()) {
                    pendingVoiceLang = resolvedLang;
                    MainActivity.this.runOnUiThread(() -> ActivityCompat.requestPermissions(
                            MainActivity.this,
                            new String[]{Manifest.permission.RECORD_AUDIO},
                            REQ_RECORD_AUDIO_CODE
                    ));
                    res.put("ok", false);
                    res.put("permissionRequested", true);
                    res.put("message", "يرجى الموافقة على صلاحية الميكروفون لبدء البحث الصوتي...");
                    return res.toString();
                }

                launchNativeVoiceSearchOnUi(resolvedLang);
                res.put("ok", true);
            } catch (Exception e) {
                try {
                    res.put("ok", false);
                    res.put("error", e.getMessage() != null ? e.getMessage() : "تعذر بدء الإدخال الصوتي");
                } catch (Exception ignored) {
                }
            }
            return res.toString();
        }

        @JavascriptInterface
        public void stopVoiceSearch() {
            pendingVoiceLang = null;
            MainActivity.this.runOnUiThread(MainActivity.this::destroyNativeSpeechRecognizer);
        }

        @JavascriptInterface
        public String saveBase64FileToDownloads(String filename, String base64Data, String mimeType) {
            JSONObject result = new JSONObject();
            try {
                String safeName = sanitizeFileName(filename);
                String safeMime = (mimeType == null || mimeType.trim().isEmpty())
                        ? "application/octet-stream"
                        : mimeType.split(";")[0].trim();

                if (base64Data == null || base64Data.isEmpty()) {
                    result.put("ok", false);
                    result.put("verified", false);
                    result.put("error", "محتوى الملف فارغ");
                    return result.toString();
                }

                String cleanBase64 = base64Data;
                int commaIdx = cleanBase64.indexOf(',');
                byte[] bytes;
                if (cleanBase64.startsWith("data:") && commaIdx != -1) {
                    String dataHeader = cleanBase64.substring(5, commaIdx);
                    String payloadPart = cleanBase64.substring(commaIdx + 1);
                    if (dataHeader.contains("base64")) {
                        bytes = Base64.decode(payloadPart, Base64.DEFAULT);
                    } else {
                        bytes = Uri.decode(payloadPart).getBytes(StandardCharsets.UTF_8);
                    }
                } else {
                    bytes = Base64.decode(cleanBase64, Base64.DEFAULT);
                }
                if (bytes == null || bytes.length == 0) {
                    result.put("ok", false);
                    result.put("verified", false);
                    result.put("error", "فشل فك ترميز بيانات الملف");
                    return result.toString();
                }

                // 1. Always write a verified local mirror file inside app external files dir for reliable FileProvider open/share
                File mirrorDir = getAppMirrorUmedtDir();
                File mirrorFile = new File(mirrorDir, safeName);
                try (FileOutputStream mirrorFos = new FileOutputStream(mirrorFile)) {
                    mirrorFos.write(bytes);
                    mirrorFos.flush();
                    mirrorFos.getFD().sync();
                }

                String publicDisplayPath = "Download/UMEDT/" + safeName;
                String savedUriString = "";
                long verifiedSize = 0;

                // 2. Save into public Phone Storage: Download/UMEDT/<safeName>
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentResolver resolver = getContentResolver();
                    // Delete any prior un-pending duplicate with the exact same name in Download/UMEDT to avoid (1) suffixes if possible
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.MediaColumns.DISPLAY_NAME, safeName);
                    values.put(MediaStore.MediaColumns.MIME_TYPE, safeMime);
                    values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/UMEDT");
                    values.put(MediaStore.MediaColumns.IS_PENDING, 1);

                    Uri collection = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
                    Uri itemUri = resolver.insert(collection, values);
                    if (itemUri != null) {
                        try (OutputStream os = resolver.openOutputStream(itemUri)) {
                            if (os != null) {
                                os.write(bytes);
                                os.flush();
                            }
                        }
                        ContentValues completeValues = new ContentValues();
                        completeValues.put(MediaStore.MediaColumns.IS_PENDING, 0);
                        resolver.update(itemUri, completeValues, null, null);

                        try (ParcelFileDescriptor pfd = resolver.openFileDescriptor(itemUri, "r")) {
                            if (pfd != null) {
                                verifiedSize = pfd.getStatSize();
                            }
                        }
                        if (verifiedSize <= 0) {
                            verifiedSize = bytes.length;
                        }
                        savedUriString = itemUri.toString();
                    }
                } else {
                    File publicDownloads = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                    File umedtPublicDir = new File(publicDownloads, "UMEDT");
                    if (!umedtPublicDir.exists()) {
                        //noinspection ResultOfMethodCallIgnored
                        umedtPublicDir.mkdirs();
                    }
                    File destFile = new File(umedtPublicDir, safeName);
                    try (FileOutputStream fos = new FileOutputStream(destFile)) {
                        fos.write(bytes);
                        fos.flush();
                        fos.getFD().sync();
                    }
                    if (destFile.exists() && destFile.length() > 0) {
                        verifiedSize = destFile.length();
                        MediaScannerConnection.scanFile(
                                getApplicationContext(),
                                new String[]{destFile.getAbsolutePath()},
                                new String[]{safeMime},
                                null
                        );
                        Uri providerUri = FileProvider.getUriForFile(
                                getApplicationContext(),
                                getPackageName() + ".fileprovider",
                                destFile
                        );
                        savedUriString = providerUri.toString();
                    }
                }

                // Fallback verification check against mirrorFile if public MediaStore had any restriction
                if (verifiedSize <= 0 && mirrorFile.exists() && mirrorFile.length() == bytes.length) {
                    verifiedSize = mirrorFile.length();
                    Uri providerUri = FileProvider.getUriForFile(
                            getApplicationContext(),
                            getPackageName() + ".fileprovider",
                            mirrorFile
                    );
                    savedUriString = providerUri.toString();
                }

                boolean isVerified = verifiedSize > 0;
                result.put("ok", isVerified);
                result.put("verified", isVerified);
                result.put("filename", safeName);
                result.put("savedPath", publicDisplayPath);
                result.put("uri", savedUriString);
                result.put("sizeBytes", verifiedSize);
                if (!isVerified) {
                    result.put("error", "لم يتم التأكد من حفظ الملف في الذاكرة");
                }
            } catch (Exception e) {
                try {
                    result.put("ok", false);
                    result.put("verified", false);
                    result.put("error", e.getMessage() != null ? e.getMessage() : "خطأ أثناء حفظ الملف");
                } catch (Exception ignored) {
                }
            }
            return result.toString();
        }

        @JavascriptInterface
        public String openDownloadedFile(String filename, String mimeType) {
            JSONObject res = new JSONObject();
            try {
                String safeName = sanitizeFileName(filename);
                String safeMime = (mimeType == null || mimeType.trim().isEmpty())
                        ? "*/*"
                        : mimeType.split(";")[0].trim();

                File mirrorFile = new File(getAppMirrorUmedtDir(), safeName);
                if (!mirrorFile.exists()) {
                    File pubFile = new File(
                            new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "UMEDT"),
                            safeName
                    );
                    if (pubFile.exists()) {
                        mirrorFile = pubFile;
                    }
                }

                if (!mirrorFile.exists()) {
                    res.put("ok", false);
                    res.put("error", "الملف غير موجود في Download/UMEDT");
                    return res.toString();
                }

                Uri contentUri = FileProvider.getUriForFile(
                        getApplicationContext(),
                        getPackageName() + ".fileprovider",
                        mirrorFile
                );

                Intent viewIntent = new Intent(Intent.ACTION_VIEW);
                viewIntent.setDataAndType(contentUri, safeMime);
                viewIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                Intent chooser = Intent.createChooser(viewIntent, "فتح الملف: " + safeName);
                chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(chooser);

                res.put("ok", true);
            } catch (Exception e) {
                try {
                    res.put("ok", false);
                    res.put("error", e.getMessage() != null ? e.getMessage() : "تعذر فتح الملف");
                } catch (Exception ignored) {
                }
            }
            return res.toString();
        }

        @JavascriptInterface
        public String shareDownloadedFile(String filename, String mimeType, String title) {
            JSONObject res = new JSONObject();
            try {
                String safeName = sanitizeFileName(filename);
                String safeMime = (mimeType == null || mimeType.trim().isEmpty())
                        ? "application/octet-stream"
                        : mimeType.split(";")[0].trim();

                File mirrorFile = new File(getAppMirrorUmedtDir(), safeName);
                if (!mirrorFile.exists()) {
                    File pubFile = new File(
                            new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "UMEDT"),
                            safeName
                    );
                    if (pubFile.exists()) {
                        mirrorFile = pubFile;
                    }
                }

                if (!mirrorFile.exists()) {
                    res.put("ok", false);
                    res.put("error", "الملف غير موجود للمشاركة");
                    return res.toString();
                }

                Uri contentUri = FileProvider.getUriForFile(
                        getApplicationContext(),
                        getPackageName() + ".fileprovider",
                        mirrorFile
                );

                Intent shareIntent = new Intent(Intent.ACTION_SEND);
                shareIntent.setType(safeMime);
                shareIntent.putExtra(Intent.EXTRA_STREAM, contentUri);
                shareIntent.putExtra(Intent.EXTRA_SUBJECT, title != null && !title.isEmpty() ? title : safeName);
                shareIntent.putExtra(Intent.EXTRA_TEXT, "ملف مستخرج من تطبيق UMEDT: " + safeName + " (Download/UMEDT/" + safeName + ")");
                shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

                Intent chooser = Intent.createChooser(shareIntent, "مشاركة الملف: " + safeName);
                chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(chooser);

                res.put("ok", true);
            } catch (Exception e) {
                try {
                    res.put("ok", false);
                    res.put("error", e.getMessage() != null ? e.getMessage() : "تعذر مشاركة الملف");
                } catch (Exception ignored) {
                }
            }
            return res.toString();
        }

        @JavascriptInterface
        public String fetchRemoteUrlBase64(String urlString) {
            JSONObject res = new JSONObject();
            HttpURLConnection conn = null;
            try {
                if (urlString == null || (!urlString.startsWith("https://") && !urlString.startsWith("http://"))) {
                    res.put("ok", false);
                    res.put("status", 400);
                    res.put("error", "رابط غير صالح");
                    return res.toString();
                }

                String currentUrl = urlString.trim();
                int statusCode = 0;
                String statusMsg = "";
                for (int hop = 0; hop < 6; hop++) {
                    URL url = new URL(currentUrl);
                    conn = (HttpURLConnection) url.openConnection();
                    conn.setInstanceFollowRedirects(false);
                    conn.setConnectTimeout(20000);
                    conn.setReadTimeout(25000);
                    conn.setRequestProperty("User-Agent", "UMEDT-Android/2.4.0");
                    conn.setRequestProperty("Accept", "image/*, application/pdf, audio/*, video/*, text/plain, application/json, application/octet-stream, */*");
                    statusCode = conn.getResponseCode();
                    statusMsg = conn.getResponseMessage() != null ? conn.getResponseMessage() : "";
                    if (statusCode == HttpURLConnection.HTTP_MOVED_PERM
                            || statusCode == HttpURLConnection.HTTP_MOVED_TEMP
                            || statusCode == HttpURLConnection.HTTP_SEE_OTHER
                            || statusCode == 307
                            || statusCode == 308) {
                        String loc = conn.getHeaderField("Location");
                        conn.disconnect();
                        conn = null;
                        if (loc == null || loc.trim().isEmpty()) {
                            break;
                        }
                        currentUrl = new URL(url, loc.trim()).toString();
                        continue;
                    }
                    break;
                }

                if (conn == null) {
                    res.put("ok", false);
                    res.put("status", 502);
                    res.put("error", "تعذر تتبع رابط التحويل");
                    return res.toString();
                }

                final int MAX_BYTES = 25 * 1024 * 1024;
                int contentLength = conn.getContentLength();
                if (contentLength > MAX_BYTES) {
                    res.put("ok", false);
                    res.put("status", 413);
                    res.put("error", "حجم الملف يتجاوز الحد الأقصى المسموح (25 MB)");
                    return res.toString();
                }

                InputStream is = statusCode >= 400 ? conn.getErrorStream() : conn.getInputStream();
                ByteArrayOutputStream buffer = new ByteArrayOutputStream();
                if (is != null) {
                    byte[] chunk = new byte[16384];
                    int total = 0;
                    int read;
                    while ((read = is.read(chunk)) != -1) {
                        total += read;
                        if (total > MAX_BYTES) {
                            is.close();
                            res.put("ok", false);
                            res.put("status", 413);
                            res.put("error", "حجم الملف يتجاوز الحد الأقصى المسموح (25 MB)");
                            return res.toString();
                        }
                        buffer.write(chunk, 0, read);
                    }
                    is.close();
                }

                byte[] payload = buffer.toByteArray();
                String contentType = conn.getContentType() != null ? conn.getContentType() : "application/octet-stream";
                res.put("ok", statusCode >= 200 && statusCode < 300);
                res.put("status", statusCode);
                res.put("statusText", statusMsg);
                res.put("contentType", contentType);
                res.put("base64", Base64.encodeToString(payload, Base64.NO_WRAP));
                return res.toString();
            } catch (Exception e) {
                try {
                    res.put("ok", false);
                    res.put("status", 0);
                    res.put("error", e.getMessage() != null ? e.getMessage() : "تعذر جلب البيانات من الشبكة");
                } catch (Exception ignored) {
                }
                return res.toString();
            } finally {
                if (conn != null) {
                    conn.disconnect();
                }
            }
        }

        @JavascriptInterface
        public String listDownloadedFiles() {
            JSONArray arr = new JSONArray();
            try {
                File dir = getAppMirrorUmedtDir();
                File[] files = dir.listFiles();
                if (files != null) {
                    for (File f : files) {
                        if (f.isFile() && f.length() > 0) {
                            JSONObject item = new JSONObject();
                            item.put("filename", f.getName());
                            item.put("savedPath", "Download/UMEDT/" + f.getName());
                            item.put("sizeBytes", f.length());
                            item.put("sizeKB", Math.max(1, Math.round(f.length() / 1024.0)));
                            item.put("timestamp", f.lastModified());
                            arr.put(item);
                        }
                    }
                }
            } catch (Exception ignored) {
            }
            return arr.toString();
        }

        private SecretKey getOrCreateKeystoreSecretKey() throws Exception {
            KeyStore keyStore = KeyStore.getInstance(ANDROID_KEYSTORE);
            keyStore.load(null);
            if (!keyStore.containsAlias(KEYSTORE_ALIAS)) {
                KeyGenerator keyGenerator = KeyGenerator.getInstance(
                        KeyProperties.KEY_ALGORITHM_AES,
                        ANDROID_KEYSTORE
                );
                KeyGenParameterSpec spec = new KeyGenParameterSpec.Builder(
                        KEYSTORE_ALIAS,
                        KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
                )
                        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                        .setKeySize(256)
                        .build();
                keyGenerator.init(spec);
                return keyGenerator.generateKey();
            }
            return ((KeyStore.SecretKeyEntry) keyStore.getEntry(KEYSTORE_ALIAS, null)).getSecretKey();
        }

        @JavascriptInterface
        public String encryptSecretWithKeystore(String plainText) {
            JSONObject res = new JSONObject();
            try {
                if (plainText == null || plainText.isEmpty()) {
                    res.put("ok", true);
                    res.put("cipherText", "");
                    return res.toString();
                }
                SecretKey secretKey = getOrCreateKeystoreSecretKey();
                Cipher cipher = Cipher.getInstance(AES_GCM_TRANSFORMATION);
                cipher.init(Cipher.ENCRYPT_MODE, secretKey);
                byte[] iv = cipher.getIV();
                byte[] encryptedBytes = cipher.doFinal(plainText.getBytes(StandardCharsets.UTF_8));
                String ivBase64 = Base64.encodeToString(iv, Base64.NO_WRAP);
                String ctBase64 = Base64.encodeToString(encryptedBytes, Base64.NO_WRAP);
                res.put("ok", true);
                res.put("cipherText", "aks_v1:" + ivBase64 + ":" + ctBase64);
            } catch (Exception e) {
                try {
                    res.put("ok", false);
                    res.put("error", "Keystore encryption error");
                } catch (Exception ignored) {
                }
            }
            return res.toString();
        }

        @JavascriptInterface
        public String decryptSecretWithKeystore(String encryptedPayload) {
            JSONObject res = new JSONObject();
            try {
                if (encryptedPayload == null || encryptedPayload.isEmpty()) {
                    res.put("ok", true);
                    res.put("plainText", "");
                    return res.toString();
                }
                if (!encryptedPayload.startsWith("aks_v1:")) {
                    res.put("ok", false);
                    res.put("error", "Invalid Keystore envelope");
                    return res.toString();
                }
                String[] parts = encryptedPayload.split(":", 3);
                if (parts.length != 3) {
                    res.put("ok", false);
                    res.put("error", "Malformed Keystore payload");
                    return res.toString();
                }
                byte[] iv = Base64.decode(parts[1], Base64.NO_WRAP);
                byte[] cipherBytes = Base64.decode(parts[2], Base64.NO_WRAP);
                SecretKey secretKey = getOrCreateKeystoreSecretKey();
                Cipher cipher = Cipher.getInstance(AES_GCM_TRANSFORMATION);
                GCMParameterSpec spec = new GCMParameterSpec(128, iv);
                cipher.init(Cipher.DECRYPT_MODE, secretKey, spec);
                byte[] plainBytes = cipher.doFinal(cipherBytes);
                res.put("ok", true);
                res.put("plainText", new String(plainBytes, StandardCharsets.UTF_8));
            } catch (Exception e) {
                try {
                    res.put("ok", false);
                    res.put("error", "Keystore decryption error");
                } catch (Exception ignored) {
                }
            }
            return res.toString();
        }

        @JavascriptInterface
        public String openExternalUrl(String urlString, String mimeType) {
            JSONObject res = new JSONObject();
            try {
                if (urlString == null || urlString.trim().isEmpty()) {
                    res.put("ok", false);
                    res.put("error", "الرابط فارغ");
                    return res.toString();
                }
                String trimmedUrl = urlString.trim();
                String lowerUrl = trimmedUrl.toLowerCase(Locale.ROOT);
                boolean isWebUrl = lowerUrl.startsWith("http://") || lowerUrl.startsWith("https://");

                if (isWebUrl) {
                    Uri uri = Uri.parse(trimmedUrl);
                    Intent viewIntent = new Intent(Intent.ACTION_VIEW, uri);
                    viewIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    Intent chooser = Intent.createChooser(viewIntent, "فتح الرابط في المتصفح");
                    chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(chooser);
                    res.put("ok", true);
                    return res.toString();
                }

                if (lowerUrl.startsWith("data:")) {
                    int commaIdx = trimmedUrl.indexOf(',');
                    String dataHeader = commaIdx != -1 ? trimmedUrl.substring(5, commaIdx) : "";
                    String detectedMime = dataHeader.contains(";")
                            ? dataHeader.substring(0, dataHeader.indexOf(';')).trim()
                            : (!dataHeader.isEmpty() ? dataHeader.trim() : "application/octet-stream");
                    String targetMime = (mimeType != null && mimeType.contains("/") && !mimeType.contains(" "))
                            ? mimeType.split(";")[0].trim()
                            : detectedMime;
                    String ext = targetMime.contains("svg") ? ".svg"
                            : targetMime.contains("png") ? ".png"
                            : targetMime.contains("jpeg") ? ".jpg"
                            : targetMime.contains("pdf") ? ".pdf"
                            : targetMime.contains("json") ? ".json"
                            : targetMime.contains("text/plain") ? ".txt"
                            : ".bin";
                    String tempName = "umedt-external-" + System.currentTimeMillis() + ext;
                    String saveResRaw = saveBase64FileToDownloads(tempName, trimmedUrl, targetMime);
                    JSONObject saveObj = new JSONObject(saveResRaw);
                    if (saveObj.optBoolean("ok", false)) {
                        return openDownloadedFile(tempName, targetMime);
                    }
                    res.put("ok", false);
                    res.put("error", saveObj.optString("error", "تعذر فتح البيانات خارجياً"));
                    return res.toString();
                }

                Uri uri = Uri.parse(trimmedUrl);
                Intent viewIntent = new Intent(Intent.ACTION_VIEW);
                if (mimeType != null && !mimeType.trim().isEmpty() && mimeType.contains("/") && !mimeType.contains(" ")) {
                    viewIntent.setDataAndType(uri, mimeType.split(";")[0].trim());
                } else {
                    viewIntent.setData(uri);
                }
                viewIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                Intent chooser = Intent.createChooser(viewIntent, "فتح في تطبيق خارجي");
                chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(chooser);
                res.put("ok", true);
            } catch (Exception e) {
                try {
                    res.put("ok", false);
                    res.put("error", e.getMessage() != null ? e.getMessage() : "تعذر فتح الرابط خارجياً");
                } catch (Exception ignored) {
                }
            }
            return res.toString();
        }

        @JavascriptInterface
        public boolean updateDictionaryTerms(String json) {
            try {
                JSONArray input = new JSONArray(json == null ? "[]" : json);
                JSONArray compact = new JSONArray();
                for (int i = 0; i < input.length(); i++) {
                    JSONObject source = input.optJSONObject(i);
                    if (source == null) continue;
                    String term = source.optString("term", "").trim();
                    if (term.isEmpty()) continue;
                    JSONObject item = new JSONObject();
                    item.put("term", term);
                    item.put("translation", source.optString("translation", ""));
                    item.put("phonetic", source.optString("phonetic", ""));
                    item.put("pos", source.optString("pos", ""));
                    item.put("category", source.optString("category", "Medical"));
                    item.put("umdCode", source.optString("umdCode", ""));
                    item.put("definitionAr", source.optString("definitionAr", ""));
                    item.put("definitionEn", source.optString("definitionEn", ""));
                    item.put("exampleEn", source.optString("exampleEn", ""));
                    item.put("exampleAr", source.optString("exampleAr", ""));

                    JSONArray aliases = new JSONArray();
                    JSONArray directAliases = source.optJSONArray("aliases");
                    if (directAliases != null) {
                        for (int j = 0; j < directAliases.length(); j++) {
                            String alias = directAliases.optString(j, "").trim();
                            if (!alias.isEmpty()) aliases.put(alias);
                        }
                    }
                    JSONObject relations = source.optJSONObject("relations");
                    JSONArray synonyms = relations == null ? null : relations.optJSONArray("synonyms");
                    if (synonyms != null) {
                        for (int j = 0; j < synonyms.length(); j++) {
                            String alias = synonyms.optString(j, "").trim();
                            if (!alias.isEmpty()) aliases.put(alias);
                        }
                    }
                    item.put("aliases", aliases);
                    compact.put(item);
                }
                UMEDTDictionaryPopupEngine.saveDictionaryTermsJson(MainActivity.this, compact.toString());
                UMEDTClipboardMonitorService.startMonitorIfEnabled(MainActivity.this);
                return true;
            } catch (Exception ignored) { return false; }
        }

        @JavascriptInterface
        public int getSyncedDictionaryCount() {
            return UMEDTDictionaryPopupEngine.getSyncedTermsCount(MainActivity.this);
        }


        @JavascriptInterface
        public void openUmedtOverlaySettings() {
            try {
                Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                        Uri.parse("package:" + getPackageName()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(intent);
            } catch (Exception ignored) { }
        }

        @JavascriptInterface
        public boolean canUmedtDrawOverlays() {
            return UMEDTDictionaryPopupEngine.canDrawOverlays(MainActivity.this);
        }

        @JavascriptInterface
        public boolean isClipboardMonitorEnabled() {
            return UMEDTDictionaryPopupEngine.isClipboardMonitorEnabled(MainActivity.this);
        }

        @JavascriptInterface
        public boolean setClipboardMonitorEnabled(boolean enabled) {
            UMEDTDictionaryPopupEngine.setClipboardMonitorEnabled(MainActivity.this, enabled);
            if (enabled) {
                UMEDTClipboardMonitorService.startMonitorIfEnabled(MainActivity.this);
            } else {
                UMEDTClipboardMonitorService.stopMonitor(MainActivity.this);
            }
            return enabled;
        }

        @JavascriptInterface
        public boolean testFloatingTranslationCard(String queryOrTermJson) {
            try {
                JSONObject matched = null;
                if (queryOrTermJson != null && queryOrTermJson.trim().startsWith("{")) {
                    matched = new JSONObject(queryOrTermJson.trim());
                } else if (queryOrTermJson != null && !queryOrTermJson.trim().isEmpty()) {
                    matched = UMEDTDictionaryPopupEngine.findTerm(MainActivity.this, queryOrTermJson.trim());
                }
                if (matched == null) {
                    matched = UMEDTDictionaryPopupEngine.peekClipboardMatchedTerm(MainActivity.this);
                }
                if (matched == null) {
                    matched = new JSONObject();
                    matched.put("term", "Thrombocytopenia");
                    matched.put("translation", "نقص الصفيحات الدموية");
                    matched.put("phonetic", "/ˌθrɒmboʊˌsaɪtoʊˈpiːniə/");
                    matched.put("category", "Hematology");
                    matched.put("pos", "Noun");
                    matched.put("definitionAr", "انخفاض غير طبيعي في عدد الصفيحات الدموية في الدم مما يزيد قابلية النزف.");
                    matched.put("definitionEn", "Abnormally low level of platelets in the circulating blood.");
                }
                UMEDTDictionaryPopupEngine.showFloatingCard(getApplicationContext(), matched, true);
                return true;
            } catch (Exception ignored) {
                return false;
            }
        }

        @JavascriptInterface
        public boolean checkClipboardAndShowCardNow() {
            JSONObject matched = UMEDTDictionaryPopupEngine.inspectClipboardAndShowIfMatched(MainActivity.this, true);
            return matched != null;
        }

        @JavascriptInterface
        public boolean isUmedtAccessibilityEnabled() {
            if (UMEDTAutoTranslateAccessibilityService.isServiceConnected()) {
                return true;
            }
            try {
                AccessibilityManager am =
                        (AccessibilityManager) MainActivity.this.getSystemService(Context.ACCESSIBILITY_SERVICE);
                if (am != null) {
                    List<AccessibilityServiceInfo> enabledServices =
                            am.getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_ALL_MASK);
                    String pkg = getPackageName();
                    for (AccessibilityServiceInfo info : enabledServices) {
                        if (info != null && info.getId() != null && info.getId().contains(pkg)) {
                            return true;
                        }
                    }
                }
                String enabledStr = Settings.Secure.getString(
                        getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
                String expected = new ComponentName(MainActivity.this, UMEDTAutoTranslateAccessibilityService.class)
                        .flattenToString();
                return enabledStr != null && (enabledStr.contains(expected)
                        || enabledStr.contains(getPackageName() + "/.UMEDTAutoTranslateAccessibilityService")
                        || enabledStr.contains("UMEDTAutoTranslateAccessibilityService"));
            } catch (Exception ignored) {
                return false;
            }
        }

        @JavascriptInterface
        public void openUmedtAccessibilitySettings() {
            try {
                Intent intent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                String component = new ComponentName(MainActivity.this, UMEDTAutoTranslateAccessibilityService.class)
                        .flattenToString();
                Bundle bundle = new Bundle();
                bundle.putString(":settings:fragment_args_key", component);
                intent.putExtra(":settings:fragment_args_key", component);
                intent.putExtra(":settings:show_fragment_args", bundle);
                startActivity(intent);
            } catch (Exception e) {
                try {
                    Intent fallback = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
                    fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(fallback);
                } catch (Exception ignored) {
                }
            }
        }

        @JavascriptInterface
        public boolean isAutoTranslateOnSelectEnabled() {
            return UMEDTDictionaryPopupEngine.isAutoTranslateOnSelectEnabled(MainActivity.this);
        }

        @JavascriptInterface
        public boolean setAutoTranslateOnSelectEnabled(boolean enabled) {
            UMEDTDictionaryPopupEngine.setAutoTranslateOnSelectEnabled(MainActivity.this, enabled);
            return enabled;
        }

    }
}

