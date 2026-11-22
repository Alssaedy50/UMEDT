package org.umed2.dictengine;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentValues;
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
import android.speech.RecognizerIntent;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.util.Base64;
import android.view.View;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
import android.webkit.URLUtil;
import android.webkit.WebSettings;
import android.webkit.WebView;

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
    private volatile String pendingTtsText = null;
    private volatile String pendingTtsLang = null;
    private volatile String pendingTtsKey = null;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        applySafeSystemBarInsets();
        attachNativeDownloadBridge();
        initNativeTts();
    }

    @Override
    public void onStart() {
        super.onStart();
        attachNativeDownloadBridge();
    }

    @Override
    public void onDestroy() {
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

    private void initNativeTts() {
        if (nativeTts != null) {
            return;
        }
        try {
            nativeTts = new TextToSpeech(getApplicationContext(), status -> {
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
                    String queuedText = pendingTtsText;
                    String queuedLang = pendingTtsLang;
                    String queuedKey = pendingTtsKey;
                    pendingTtsText = null;
                    pendingTtsLang = null;
                    pendingTtsKey = null;
                    if (queuedText != null && !queuedText.trim().isEmpty()) {
                        speakInternal(queuedText, queuedLang, queuedKey);
                    }
                } else {
                    nativeTtsReady = false;
                }
            });
        } catch (Exception ignored) {
            nativeTtsReady = false;
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
                if (targetLocale.getLanguage().equalsIgnoreCase("ar")) {
                    nativeTts.setLanguage(new Locale("ar"));
                } else {
                    nativeTts.setLanguage(Locale.US);
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

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_VOICE_SEARCH_CODE) {
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

    private void attachNativeDownloadBridge() {
        try {
            if (this.bridge == null || this.bridge.getWebView() == null) {
                return;
            }
            WebView webView = this.bridge.getWebView();
            webView.getSettings().setJavaScriptEnabled(true);
            webView.getSettings().setAllowFileAccess(true);
            webView.getSettings().setDomStorageEnabled(true);
            webView.getSettings().setDatabaseEnabled(true);
            webView.getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
            webView.getSettings().setMediaPlaybackRequiresUserGesture(false);

            UMEDNativeDownloader bridgeInstance = new UMEDNativeDownloader();
            try {
                webView.removeJavascriptInterface("UMEDNativeDownloader");
                webView.removeJavascriptInterface("UMEDAndroidBridge");
            } catch (Exception ignored) {
            }
            webView.addJavascriptInterface(bridgeInstance, "UMEDNativeDownloader");
            webView.addJavascriptInterface(bridgeInstance, "UMEDAndroidBridge");

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
                MainActivity.this.runOnUiThread(MainActivity.this::initNativeTts);
            }
            return true;
        }

        @JavascriptInterface
        public String speakText(String text, String lang, String key) {
            JSONObject res = new JSONObject();
            try {
                if (text == null || text.trim().isEmpty()) {
                    res.put("ok", false);
                    res.put("error", "النص فارغ");
                    return res.toString();
                }
                if (nativeTts == null) {
                    pendingTtsText = text.trim();
                    pendingTtsLang = lang;
                    pendingTtsKey = key;
                    MainActivity.this.runOnUiThread(MainActivity.this::initNativeTts);
                    res.put("ok", true);
                    res.put("queued", true);
                    return res.toString();
                }
                if (!nativeTtsReady) {
                    pendingTtsText = text.trim();
                    pendingTtsLang = lang;
                    pendingTtsKey = key;
                    res.put("ok", true);
                    res.put("queued", true);
                    return res.toString();
                }
                boolean started = speakInternal(text, lang, key);
                res.put("ok", started);
                if (!started) {
                    res.put("error", "تعذر تشغيل النطق الصوتي عبر Android TTS");
                }
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
                Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, resolvedLang);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, resolvedLang);
                intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
                intent.putExtra(
                        RecognizerIntent.EXTRA_PROMPT,
                        resolvedLang.toLowerCase(Locale.ROOT).startsWith("ar")
                                ? "انطق الكلمة أو المصطلح بالعربية..."
                                : "Speak the English word or medical term..."
                );

                List<?> activities = getPackageManager().queryIntentActivities(intent, 0);
                if (activities == null || activities.isEmpty()) {
                    res.put("ok", false);
                    res.put("error", "خدمة التعرف على الصوت غير مثبّتة على هذا الجهاز");
                    return res.toString();
                }

                MainActivity.this.runOnUiThread(() -> {
                    try {
                        startActivityForResult(intent, REQ_VOICE_SEARCH_CODE);
                    } catch (Exception e) {
                        dispatchJsEvent("umed-voice-search-error", "{\"code\":\"launch_failed\"}");
                    }
                });
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
    }
}

