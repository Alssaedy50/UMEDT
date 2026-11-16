package org.umed2.dictengine;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.ParcelFileDescriptor;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
import android.webkit.URLUtil;
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

public class MainActivity extends BridgeActivity {

    private static final int REQ_RECORD_AUDIO_CODE = 7101;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        applySafeSystemBarInsets();
        attachNativeDownloadBridge();
    }

    @Override
    public void onStart() {
        super.onStart();
        attachNativeDownloadBridge();
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
            webView.getSettings().setMediaPlaybackRequiresUserGesture(false);

            try {
                webView.removeJavascriptInterface("UMEDNativeDownloader");
            } catch (Exception ignored) {
            }
            webView.addJavascriptInterface(new UMEDNativeDownloader(), "UMEDNativeDownloader");

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
                if (cleanBase64.startsWith("data:") && commaIdx != -1) {
                    cleanBase64 = cleanBase64.substring(commaIdx + 1);
                }

                byte[] bytes = Base64.decode(cleanBase64, Base64.DEFAULT);
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
                    conn.setRequestProperty("Accept", "application/json, application/octet-stream, */*");
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
    }
}

