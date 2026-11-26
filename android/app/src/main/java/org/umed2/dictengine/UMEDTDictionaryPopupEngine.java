package org.umed2.dictengine;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.speech.tts.TextToSpeech;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Shared offline dictionary lookup and floating overlay translation card engine.
 * Works directly from UMEDTAutoTranslateAccessibilityService, UMEDTClipboardMonitorService, and UMEDTPopupCardActivity
 * without opening or loading the main WebView application.
 */
public final class UMEDTDictionaryPopupEngine {
    public static final String PREFS_NAME = "umedt_copy_dictionary";
    public static final String KEY_TERMS_JSON = "terms_json";
    public static final String KEY_TERMS_COUNT = "terms_count";
    public static final String KEY_MONITOR_ENABLED = "clipboard_monitor_enabled";
    public static final String KEY_AUTO_TRANSLATE_ON_SELECT = "auto_translate_on_select";
    public static final String KEY_LAST_SYNC_TS = "last_sync_ts";
    private static final String MIRROR_FILE_NAME = "umedt_copy_dictionary.json";
    private static final String FALLBACK_CORE_JSON = "["
            + "{\"term\":\"Hypertension\",\"translation\":\"ارتفاع ضغط الدم\",\"category\":\"Cardiology\",\"definitionAr\":\"ارتفاع مستمر في ضغط الدم الشرياني يزيد عن 130/80 ملم زئبقي.\"},"
            + "{\"term\":\"Atherosclerosis\",\"translation\":\"تصلب الشرايين العصيدي\",\"category\":\"Cardiology\",\"definitionAr\":\"تراكم اللويحات الدهنية والكوليسترول داخل جدران الشرايين.\"},"
            + "{\"term\":\"Myocardial Infarction\",\"translation\":\"احتشاء عضلة القلب\",\"category\":\"Cardiology\",\"definitionAr\":\"نخر إقفاري في عضلة القلب نتيجة انسداد حاد في الشريان التاجي.\"},"
            + "{\"term\":\"Tachycardia\",\"translation\":\"تسرع القلب\",\"category\":\"Cardiology\",\"definitionAr\":\"زيادة معدل ضربات القلب عن 100 نبضة في الدقيقة أثناء الراحة.\"},"
            + "{\"term\":\"Bradycardia\",\"translation\":\"بطء القلب\",\"category\":\"Cardiology\",\"definitionAr\":\"انخفاض معدل ضربات القلب إلى أقل من 60 نبضة في الدقيقة.\"},"
            + "{\"term\":\"Dyspnea\",\"translation\":\"ضيق التنفس / الزلة التنفسية\",\"category\":\"Pulmonology\",\"definitionAr\":\"إحساس شخصي بصعوبة أو عدم راحة في التنفس.\"},"
            + "{\"term\":\"Anemia\",\"translation\":\"فقر الدم\",\"category\":\"Hematology\",\"definitionAr\":\"انخفاض تركيز الهيموغلوبين أو عدد كريات الدم الحمراء عن المستوى الطبيعي.\"},"
            + "{\"term\":\"Pathophysiology\",\"translation\":\"الفيزيولوجيا المرضية\",\"category\":\"Pathology\",\"definitionAr\":\"دراسة التغيرات الوظيفية والحيوية الناتجة عن المرض.\"}"
            + "]";

    private static final Handler MAIN_HANDLER = new Handler(Looper.getMainLooper());

    private static String cachedRawJson = null;
    private static List<JSONObject> cachedTermsList = new ArrayList<>();
    private static Map<String, JSONObject> exactIndex = new HashMap<>();
    private static Map<String, JSONObject> stemIndex = new HashMap<>();

    private static View activeFloatingView = null;
    private static WindowManager activeWindowManager = null;
    private static final Runnable AUTO_DISMISS_RUNNABLE = UMEDTDictionaryPopupEngine::dismissFloatingCard;

    private static String lastShownTermKey = "";
    private static long lastShownTimestampMs = 0L;
    private static String lastAutoClipboardValue = "";
    private static volatile String ignoreClipboardText = "";

    private static TextToSpeech ttsEngine = null;
    private static boolean ttsReady = false;
    private static String pendingTtsText = null;

    private UMEDTDictionaryPopupEngine() {
    }

    /**
     * Saves synced dictionary terms JSON from WebView into SharedPreferences and a persistent file mirror,
     * then refreshes the in-memory index synchronously so background services can access it immediately.
     */
    public static synchronized int saveDictionaryTermsJson(Context context, String json) {
        if (context == null) return 0;
        String safeJson = (json == null || json.trim().isEmpty()) ? "[]" : json;
        int count = 0;
        try {
            JSONArray arr = new JSONArray(safeJson);
            count = arr.length();
        } catch (Exception ignored) {
            safeJson = "[]";
        }
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit()
                .putString(KEY_TERMS_JSON, safeJson)
                .putString("terms", safeJson)
                .putInt(KEY_TERMS_COUNT, count)
                .putLong(KEY_LAST_SYNC_TS, System.currentTimeMillis())
                .commit();
        if (count > 0) {
            writeMirrorFile(context, safeJson);
        }
        rebuildMemoryIndex(safeJson);
        return count;
    }

    private static void writeMirrorFile(Context context, String json) {
        try {
            File file = new File(context.getFilesDir(), MIRROR_FILE_NAME);
            try (FileOutputStream fos = new FileOutputStream(file, false)) {
                fos.write(json.getBytes(StandardCharsets.UTF_8));
                fos.flush();
            }
        } catch (Exception ignored) {
        }
    }

    private static String readMirrorFile(Context context) {
        try {
            File file = new File(context.getFilesDir(), MIRROR_FILE_NAME);
            if (!file.exists() || file.length() <= 2) return null;
            StringBuilder sb = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(new FileInputStream(file), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    sb.append(line);
                }
            }
            String content = sb.toString().trim();
            return content.isEmpty() ? null : content;
        } catch (Exception ignored) {
            return null;
        }
    }

    public static int getSyncedTermsCount(Context context) {
        if (context == null) return 0;
        ensureIndexLoaded(context);
        return cachedTermsList.size();
    }

    public static boolean isClipboardMonitorEnabled(Context context) {
        if (context == null) return true;
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        return prefs.getBoolean(KEY_MONITOR_ENABLED, true);
    }

    public static void setClipboardMonitorEnabled(Context context, boolean enabled) {
        if (context == null) return;
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().putBoolean(KEY_MONITOR_ENABLED, enabled).commit();
    }

    public static boolean isAutoTranslateOnSelectEnabled(Context context) {
        if (context == null) return false;
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        return prefs.getBoolean(KEY_AUTO_TRANSLATE_ON_SELECT, true);
    }

    public static void setAutoTranslateOnSelectEnabled(Context context, boolean enabled) {
        if (context == null) return;
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().putBoolean(KEY_AUTO_TRANSLATE_ON_SELECT, enabled).commit();
    }

    public static boolean shouldIgnoreText(String rawText) {
        if (rawText == null) return true;
        String trimmed = rawText.trim();
        return trimmed.isEmpty() || trimmed.equals(ignoreClipboardText);
    }

    private static synchronized void ensureIndexLoaded(Context context) {
        if (context == null) return;
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String raw = prefs.getString(KEY_TERMS_JSON, null);
        if (raw == null || raw.equals("[]") || raw.trim().isEmpty()) {
            String legacy = prefs.getString("terms", null);
            if (legacy != null && !legacy.equals("[]") && !legacy.trim().isEmpty()) {
                raw = legacy;
            }
        }
        if (raw == null || raw.equals("[]") || raw.trim().isEmpty()) {
            String mirrored = readMirrorFile(context);
            if (mirrored != null && !mirrored.equals("[]")) {
                raw = mirrored;
            }
        }
        if (raw == null || raw.equals("[]") || raw.trim().isEmpty()) {
            raw = FALLBACK_CORE_JSON;
        }
        if (!raw.equals(cachedRawJson)) {
            rebuildMemoryIndex(raw);
        }
    }

    private static synchronized void rebuildMemoryIndex(String rawJson) {
        cachedRawJson = rawJson;
        cachedTermsList = new ArrayList<>();
        exactIndex = new HashMap<>();
        stemIndex = new HashMap<>();

        try {
            JSONArray arr = new JSONArray(rawJson);
            for (int i = 0; i < arr.length(); i++) {
                JSONObject item = arr.optJSONObject(i);
                if (item == null) continue;
                String term = item.optString("term", "").trim();
                if (term.isEmpty()) continue;

                cachedTermsList.add(item);

                indexCandidateKey(term, item, true);

                String umdCode = item.optString("umdCode", "").trim();
                if (!umdCode.isEmpty()) {
                    indexCandidateKey(umdCode, item, false);
                }

                String translation = item.optString("translation", "").trim();
                if (!translation.isEmpty()) {
                    indexCandidateKey(translation, item, true);
                    // Also index slash/comma-separated Arabic translations (e.g. "تسرع القلب / خفقان")
                    String[] arParts = translation.split("[/،,;|-]");
                    for (String part : arParts) {
                        String trimmedPart = part.trim();
                        if (trimmedPart.length() >= 2) {
                            indexCandidateKey(trimmedPart, item, true);
                        }
                    }
                }

                // Index aliases array
                JSONArray aliases = item.optJSONArray("aliases");
                if (aliases != null) {
                    for (int j = 0; j < aliases.length(); j++) {
                        String alias = aliases.optString(j, "").trim();
                        if (!alias.isEmpty()) {
                            indexCandidateKey(alias, item, true);
                        }
                    }
                }

                // Index relations.synonyms
                JSONObject relations = item.optJSONObject("relations");
                if (relations != null) {
                    JSONArray synonyms = relations.optJSONArray("synonyms");
                    if (synonyms != null) {
                        for (int j = 0; j < synonyms.length(); j++) {
                            String syn = synonyms.optString(j, "").trim();
                            if (!syn.isEmpty()) {
                                indexCandidateKey(syn, item, true);
                            }
                        }
                    }
                }
            }
        } catch (Exception ignored) {
        }
    }

    private static void indexCandidateKey(String rawKey, JSONObject item, boolean includeStems) {
        String norm = normalizeLookupKey(rawKey);
        if (norm.isEmpty()) return;
        if (!exactIndex.containsKey(norm)) {
            exactIndex.put(norm, item);
        }
        if (includeStems) {
            for (String stem : generateMorphologicalVariants(norm)) {
                if (!stem.isEmpty() && !stemIndex.containsKey(stem)) {
                    stemIndex.put(stem, item);
                }
            }
        }
    }

    /**
     * Cleans punctuation, zero-width characters, surrounding quotes/brackets, and Arabic diacritics.
     */
    public static String normalizeLookupKey(String value) {
        if (value == null) return "";
        String cleaned = value
                .replaceAll("[\\u200B-\\u200F\\uFEFF]", "")
                // Remove Arabic tashkeel / diacritics and tatweel
                .replaceAll("[\\u0640\\u064B-\\u065F\\u0670]", "")
                .toLowerCase(Locale.ROOT)
                .trim();

        // Normalize common Arabic character variants for reliable lookup
        cleaned = cleaned
                .replace('أ', 'ا')
                .replace('إ', 'ا')
                .replace('آ', 'ا')
                .replace('ٱ', 'ا')
                .replace('ة', 'ه')
                .replace('ى', 'ي');

        // Strip leading and trailing punctuation/quotes/brackets
        cleaned = cleaned
                .replaceAll("^[^\\p{L}\\p{N}]+", "")
                .replaceAll("[^\\p{L}\\p{N}]+$", "")
                .replaceAll("\\s+", " ")
                .trim();
        return cleaned;
    }

    /**
     * Generates English medical/standard inflections and Arabic definite-article variants.
     */
    private static List<String> generateMorphologicalVariants(String norm) {
        List<String> variants = new ArrayList<>();
        if (norm == null || norm.length() < 2) return variants;
        variants.add(norm);

        // Arabic prefix stripping (ال، وال، بال، كال، فال، لل)
        String[] arPrefixes = new String[]{"وال", "بال", "كال", "فال", "ال", "لل"};
        for (String prefix : arPrefixes) {
            if (norm.startsWith(prefix) && norm.length() - prefix.length() >= 2) {
                variants.add(norm.substring(prefix.length()));
            }
        }

        // English & Greco-Latin medical plural / inflection normalization
        if (norm.length() >= 4) {
            if (norm.endsWith("ies") && norm.length() > 4) {
                variants.add(norm.substring(0, norm.length() - 3) + "y");
            }
            if (norm.endsWith("ae") && norm.length() > 4) {
                variants.add(norm.substring(0, norm.length() - 2) + "a");
            }
            if (norm.endsWith("ices") && norm.length() > 5) {
                String base = norm.substring(0, norm.length() - 4);
                variants.add(base + "ix");
                variants.add(base + "ex");
            }
            if (norm.endsWith("itides") && norm.length() > 7) {
                variants.add(norm.substring(0, norm.length() - 6) + "itis");
            }
            if (norm.endsWith("ata") && norm.length() > 5) {
                variants.add(norm.substring(0, norm.length() - 3) + "a");
            }
            if (norm.endsWith("i") && norm.length() > 4) {
                variants.add(norm.substring(0, norm.length() - 1) + "us");
            }
            if (norm.endsWith("a") && norm.length() > 4) {
                String base = norm.substring(0, norm.length() - 1);
                variants.add(base + "um");
                variants.add(base + "on");
            }
            if (norm.endsWith("es") && norm.length() > 4) {
                variants.add(norm.substring(0, norm.length() - 2));
                variants.add(norm.substring(0, norm.length() - 1));
            }
            if (norm.endsWith("s") && !norm.endsWith("ss") && !norm.endsWith("is") && !norm.endsWith("us")) {
                variants.add(norm.substring(0, norm.length() - 1));
            }
            if (norm.endsWith("ed") && norm.length() > 4) {
                variants.add(norm.substring(0, norm.length() - 2));
                variants.add(norm.substring(0, norm.length() - 1));
            }
            if (norm.endsWith("ing") && norm.length() > 5) {
                variants.add(norm.substring(0, norm.length() - 3));
                variants.add(norm.substring(0, norm.length() - 3) + "e");
            }
        }
        return variants;
    }

    /**
     * Looks up a copied or selected text string in the synced local dictionary.
     * Supports exact match, synonym/alias match, Arabic reverse match, inflection stem match,
     * and n-gram extraction from short copied phrases.
     */
    public static synchronized JSONObject findTerm(Context context, String rawText) {
        if (context == null || rawText == null) return null;
        String trimmed = rawText.trim();
        if (trimmed.isEmpty() || trimmed.length() > 180) return null;
        // Ignore URLs
        if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return null;

        ensureIndexLoaded(context);
        if (cachedTermsList.isEmpty()) return null;

        String queryNorm = normalizeLookupKey(trimmed);
        if (queryNorm.isEmpty()) return null;

        // 1. Direct exact lookup (O(1))
        JSONObject exact = exactIndex.get(queryNorm);
        if (exact != null) {
            return attachMatchedQuery(exact, trimmed);
        }

        // 2. Morphological / Inflection stem lookup (O(1))
        for (String variant : generateMorphologicalVariants(queryNorm)) {
            JSONObject byVariant = exactIndex.get(variant);
            if (byVariant != null) {
                return attachMatchedQuery(byVariant, trimmed);
            }
            JSONObject byStem = stemIndex.get(variant);
            if (byStem != null) {
                return attachMatchedQuery(byStem, trimmed);
            }
        }

        // 3. If the copied text contains parenthetical or slash/dash separated parts
        // e.g. "تصلب الشرايين (Atherosclerosis)" or "Myocardial Infarction - MI"
        String[] segments = trimmed.split("[()\\[\\]/،,;|\\-–—:]");
        if (segments.length > 1) {
            for (String seg : segments) {
                String segNorm = normalizeLookupKey(seg);
                if (segNorm.length() >= 2) {
                    JSONObject segMatch = exactIndex.get(segNorm);
                    if (segMatch != null) return attachMatchedQuery(segMatch, seg.trim());
                    for (String variant : generateMorphologicalVariants(segNorm)) {
                        JSONObject varMatch = exactIndex.get(variant);
                        if (varMatch != null) return attachMatchedQuery(varMatch, seg.trim());
                    }
                }
            }
        }

        // 4. Short phrase n-gram scanning (if user copied 2 to 10 words, find longest dictionary term inside)
        String[] words = queryNorm.split("\\s+");
        if (words.length >= 2 && words.length <= 10) {
            int maxN = Math.min(4, words.length);
            for (int n = maxN; n >= 1; n--) {
                for (int start = 0; start <= words.length - n; start++) {
                    StringBuilder sb = new StringBuilder();
                    for (int k = 0; k < n; k++) {
                        if (k > 0) sb.append(' ');
                        sb.append(words[start + k]);
                    }
                    String candidate = normalizeLookupKey(sb.toString());
                    if (n == 1 && candidate.length() < 3) continue;
                    JSONObject ngramMatch = exactIndex.get(candidate);
                    if (ngramMatch != null) {
                        return attachMatchedQuery(ngramMatch, sb.toString());
                    }
                    for (String variant : generateMorphologicalVariants(candidate)) {
                        if (n == 1 && variant.length() < 3) continue;
                        JSONObject ngramVarMatch = exactIndex.get(variant);
                        if (ngramVarMatch != null) {
                            return attachMatchedQuery(ngramVarMatch, sb.toString());
                        }
                    }
                }
            }
        }

        return null;
    }

    private static JSONObject attachMatchedQuery(JSONObject source, String matchedInput) {
        try {
            JSONObject copy = new JSONObject(source.toString());
            copy.put("_matchedInput", matchedInput != null ? matchedInput.trim() : "");
            return copy;
        } catch (Exception e) {
            return source;
        }
    }

    /**
     * Returns up to maxResults dictionary term suggestions matching a typed prefix or substring
     * (in English or Arabic) for the UMEDT Keyboard live autocomplete bar.
     */
    public static synchronized List<JSONObject> findSuggestions(Context context, String rawPrefix, int maxResults) {
        List<JSONObject> results = new ArrayList<>();
        if (context == null || rawPrefix == null || maxResults <= 0) return results;
        String normPrefix = normalizeLookupKey(rawPrefix);
        if (normPrefix.length() < 2) return results;

        ensureIndexLoaded(context);
        if (cachedTermsList.isEmpty()) return results;

        List<JSONObject> prefixMatches = new ArrayList<>();
        List<JSONObject> substringMatches = new ArrayList<>();

        // Check exact match first
        JSONObject exact = exactIndex.get(normPrefix);
        if (exact != null) {
            results.add(exact);
        }

        for (int i = 0; i < cachedTermsList.size(); i++) {
            JSONObject item = cachedTermsList.get(i);
            if (item == null || item == exact) continue;

            String termNorm = normalizeLookupKey(item.optString("term", ""));
            String transNorm = normalizeLookupKey(item.optString("translation", ""));

            if (termNorm.startsWith(normPrefix) || transNorm.startsWith(normPrefix)) {
                prefixMatches.add(item);
                if (results.size() + prefixMatches.size() >= maxResults) {
                    break;
                }
            } else if (substringMatches.size() < maxResults &&
                    (termNorm.contains(normPrefix) || transNorm.contains(normPrefix))) {
                substringMatches.add(item);
            }
        }

        for (JSONObject p : prefixMatches) {
            if (results.size() >= maxResults) break;
            results.add(p);
        }
        for (JSONObject s : substringMatches) {
            if (results.size() >= maxResults) break;
            results.add(s);
        }
        return results;
    }

    /**
     * Safely reads the current plain text from the clipboard.
     */
    public static String getCurrentClipboardText(Context context) {
        if (context == null) return "";
        try {
            ClipboardManager cm = (ClipboardManager) context.getSystemService(Context.CLIPBOARD_SERVICE);
            if (cm == null || !cm.hasPrimaryClip()) return "";
            ClipData clip = cm.getPrimaryClip();
            if (clip == null || clip.getItemCount() == 0) return "";
            CharSequence textSeq = clip.getItemAt(0).coerceToText(context);
            return textSeq != null ? textSeq.toString().trim() : "";
        } catch (Exception ignored) {
            return "";
        }
    }

    /**
     * Reads the current primary clipboard and shows the floating overlay card if a dictionary term is found.
     * Returns the matched JSONObject if found, or null otherwise.
     */
    public static JSONObject inspectClipboardAndShowIfMatched(Context context, boolean forceShow) {
        if (context == null) return null;
        try {
            ClipboardManager cm = (ClipboardManager) context.getSystemService(Context.CLIPBOARD_SERVICE);
            if (cm == null || !cm.hasPrimaryClip()) return null;
            ClipData clip = cm.getPrimaryClip();
            if (clip == null || clip.getItemCount() == 0) return null;
            CharSequence textSeq = clip.getItemAt(0).coerceToText(context);
            if (textSeq == null) return null;
            String copied = textSeq.toString().trim();
            if (copied.isEmpty() || shouldIgnoreText(copied)) {
                return null;
            }
            if (!forceShow && copied.equals(lastAutoClipboardValue)) {
                return null;
            }
            JSONObject matched = findTerm(context, copied);
            if (matched != null) {
                lastAutoClipboardValue = copied;
                showFloatingCard(context, matched, forceShow);
            }
            return matched;
        } catch (Exception ignored) {
            return null;
        }
    }

    /**
     * Reads the current clipboard and returns a matched dictionary term without showing the overlay.
     */
    public static JSONObject peekClipboardMatchedTerm(Context context) {
        if (context == null) return null;
        try {
            ClipboardManager cm = (ClipboardManager) context.getSystemService(Context.CLIPBOARD_SERVICE);
            if (cm == null || !cm.hasPrimaryClip()) return null;
            ClipData clip = cm.getPrimaryClip();
            if (clip == null || clip.getItemCount() == 0) return null;
            CharSequence textSeq = clip.getItemAt(0).coerceToText(context);
            if (textSeq == null) return null;
            String copied = textSeq.toString().trim();
            if (copied.isEmpty()) return null;
            return findTerm(context, copied);
        } catch (Exception ignored) {
            return null;
        }
    }

    public static boolean canDrawOverlays(Context context) {
        if (context == null) return false;
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(context);
    }

    /**
     * Displays the floating dictionary translation card over any running app.
     * Priority 1: TYPE_ACCESSIBILITY_OVERLAY on UMEDTAutoTranslateAccessibilityService (works even when the app is completely closed and without SYSTEM_ALERT_WINDOW).
     * Priority 2: TYPE_APPLICATION_OVERLAY when canDrawOverlays(context) is granted.
     * Priority 3: Translucent UMEDTPopupCardActivity with EXTRA_MATCHED_TERM_JSON.
     */
    public static void showFloatingCard(final Context context, final JSONObject term, final boolean forceShow) {
        if (context == null || term == null) return;
        MAIN_HANDLER.post(() -> {
            String termKey = term.optString("term", "") + "|" + term.optString("translation", "");
            long now = System.currentTimeMillis();
            if (!forceShow && termKey.equals(lastShownTermKey) && (now - lastShownTimestampMs) < 1200L) {
                return;
            }
            lastShownTermKey = termKey;
            lastShownTimestampMs = now;

            dismissFloatingCard();

            int screenWidth = context.getResources().getDisplayMetrics().widthPixels;
            int cardWidth = Math.min(screenWidth - dp(context, 24), dp(context, 460));
            int flags = WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                    | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
                    | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN;

            // Priority 1: Try Accessibility Overlay via active UMEDTAutoTranslateAccessibilityService instance
            UMEDTAutoTranslateAccessibilityService a11y = UMEDTAutoTranslateAccessibilityService.getActiveInstance();
            if (a11y != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP_MR1) {
                try {
                    WindowManager a11yWm = (WindowManager) a11y.getSystemService(Context.WINDOW_SERVICE);
                    if (a11yWm != null) {
                        View a11yCard = buildTranslationCardView(
                                a11y,
                                term,
                                UMEDTDictionaryPopupEngine::dismissFloatingCard,
                                () -> scheduleAutoDismiss(11000L)
                        );
                        WindowManager.LayoutParams a11yParams = new WindowManager.LayoutParams(
                                cardWidth,
                                WindowManager.LayoutParams.WRAP_CONTENT,
                                WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
                                flags,
                                PixelFormat.TRANSLUCENT
                        );
                        a11yParams.gravity = Gravity.TOP | Gravity.CENTER_HORIZONTAL;
                        a11yParams.y = dp(a11y, 44);
                        a11yWm.addView(a11yCard, a11yParams);
                        activeFloatingView = a11yCard;
                        activeWindowManager = a11yWm;
                        scheduleAutoDismiss(10000L);
                        return;
                    }
                } catch (Exception ignored) {
                }
            }

            // Priority 2: Standard TYPE_APPLICATION_OVERLAY if SYSTEM_ALERT_WINDOW is granted
            if (canDrawOverlays(context)) {
                try {
                    Context appCtx = context.getApplicationContext();
                    WindowManager wm = (WindowManager) appCtx.getSystemService(Context.WINDOW_SERVICE);
                    if (wm != null) {
                        View cardView = buildTranslationCardView(
                                appCtx,
                                term,
                                UMEDTDictionaryPopupEngine::dismissFloatingCard,
                                () -> scheduleAutoDismiss(11000L)
                        );
                        int overlayType = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                                ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                                : WindowManager.LayoutParams.TYPE_PHONE;
                        WindowManager.LayoutParams params = new WindowManager.LayoutParams(
                                cardWidth,
                                WindowManager.LayoutParams.WRAP_CONTENT,
                                overlayType,
                                flags,
                                PixelFormat.TRANSLUCENT
                        );
                        params.gravity = Gravity.TOP | Gravity.CENTER_HORIZONTAL;
                        params.y = dp(appCtx, 44);
                        wm.addView(cardView, params);
                        activeFloatingView = cardView;
                        activeWindowManager = wm;
                        scheduleAutoDismiss(10000L);
                        return;
                    }
                } catch (Exception ignored) {
                }
            }

            // Priority 3: Fallback to launching UMEDTPopupCardActivity to render the visual card in its translucent window
            try {
                Context starter = a11y != null ? a11y : context;
                Intent popupIntent = new Intent(starter, UMEDTPopupCardActivity.class);
                popupIntent.putExtra(UMEDTPopupCardActivity.EXTRA_MATCHED_TERM_JSON, term.toString());
                popupIntent.addFlags(
                        Intent.FLAG_ACTIVITY_NEW_TASK
                                | Intent.FLAG_ACTIVITY_CLEAR_TOP
                                | Intent.FLAG_ACTIVITY_SINGLE_TOP
                                | Intent.FLAG_ACTIVITY_NO_ANIMATION
                                | Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS
                );
                starter.startActivity(popupIntent);
                return;
            } catch (Exception ignored) {
            }

            String title = term.optString("term", "");
            String tr = term.optString("translation", "");
            String def = term.optString("definitionAr", "");
            String msg = "📖 " + title + " : " + tr + (def.isEmpty() ? "" : "\n" + def);
            Toast.makeText(context.getApplicationContext(), msg, Toast.LENGTH_LONG).show();
        });
    }

    private static void scheduleAutoDismiss(long delayMs) {
        MAIN_HANDLER.removeCallbacks(AUTO_DISMISS_RUNNABLE);
        MAIN_HANDLER.postDelayed(AUTO_DISMISS_RUNNABLE, delayMs);
    }

    public static void dismissFloatingCard() {
        MAIN_HANDLER.removeCallbacks(AUTO_DISMISS_RUNNABLE);
        if (activeWindowManager != null && activeFloatingView != null) {
            try {
                activeWindowManager.removeView(activeFloatingView);
            } catch (Exception ignored) {
            }
        }
        activeFloatingView = null;
        activeWindowManager = null;
    }

    /**
     * Builds the styled floating card View. Used both by WindowManager overlay and UMEDTPopupCardActivity.
     */
    public static View buildTranslationCardView(
            final Context context,
            final JSONObject term,
            final Runnable onClose,
            final Runnable onUserInteraction
    ) {
        final String termEn = term.optString("term", "");
        final String translationAr = term.optString("translation", "");
        final String phonetic = term.optString("phonetic", "");
        final String category = term.optString("category", "");
        final String pos = term.optString("pos", "");
        final String definitionAr = term.optString("definitionAr", "");
        final String definitionEn = term.optString("definitionEn", "");
        final String exampleEn = term.optString("exampleEn", "");
        final String exampleAr = term.optString("exampleAr", "");
        final String matchedInput = term.optString("_matchedInput", "");

        LinearLayout root = new LinearLayout(context);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        root.setPadding(dp(context, 12), dp(context, 10), dp(context, 12), dp(context, 10));

        GradientDrawable cardBg = new GradientDrawable();
        cardBg.setColor(Color.parseColor("#0F172A"));
        cardBg.setCornerRadius(dp(context, 16));
        cardBg.setStroke(dp(context, 1), Color.parseColor("#10B981"));
        root.setBackground(cardBg);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) root.setElevation(dp(context, 10));

        LinearLayout header = new LinearLayout(context);
        header.setGravity(Gravity.CENTER_VERTICAL);
        TextView brand = new TextView(context);
        brand.setText("UMEDT");
        brand.setTextColor(Color.parseColor("#34D399"));
        brand.setTextSize(TypedValue.COMPLEX_UNIT_SP, 10);
        brand.setTypeface(Typeface.DEFAULT_BOLD);
        header.addView(brand, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        if (!category.isEmpty() || !pos.isEmpty()) {
            TextView meta = new TextView(context);
            meta.setText(category + (!pos.isEmpty() ? " · " + pos : ""));
            meta.setTextColor(Color.parseColor("#94A3B8"));
            meta.setTextSize(TypedValue.COMPLEX_UNIT_SP, 9);
            header.addView(meta);
        }
        TextView close = new TextView(context);
        close.setText("✕");
        close.setTextColor(Color.parseColor("#CBD5E1"));
        close.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        close.setGravity(Gravity.CENTER);
        close.setPadding(dp(context, 8), dp(context, 2), dp(context, 8), dp(context, 2));
        close.setOnClickListener(v -> { if (onClose != null) onClose.run(); });
        header.addView(close);
        root.addView(header);

        LinearLayout termRow = new LinearLayout(context);
        termRow.setGravity(Gravity.CENTER_VERTICAL);
        termRow.setLayoutDirection(View.LAYOUT_DIRECTION_LTR);
        termRow.setPadding(0, dp(context, 5), 0, dp(context, 2));
        TextView termView = new TextView(context);
        termView.setText(termEn);
        termView.setTextColor(Color.WHITE);
        termView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
        termView.setTypeface(Typeface.DEFAULT_BOLD);
        termRow.addView(termView, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        if (!phonetic.isEmpty()) {
            TextView phon = new TextView(context);
            phon.setText(phonetic);
            phon.setTextColor(Color.parseColor("#94A3B8"));
            phon.setTextSize(TypedValue.COMPLEX_UNIT_SP, 10);
            termRow.addView(phon);
        }
        root.addView(termRow);

        TextView translation = new TextView(context);
        translation.setText(translationAr.isEmpty() ? termEn : translationAr);
        translation.setTextColor(Color.parseColor("#A7F3D0"));
        translation.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        translation.setTypeface(Typeface.DEFAULT_BOLD);
        translation.setPadding(dp(context, 9), dp(context, 6), dp(context, 9), dp(context, 6));
        GradientDrawable translationBg = new GradientDrawable();
        translationBg.setColor(Color.parseColor("#064E3B"));
        translationBg.setCornerRadius(dp(context, 10));
        translation.setBackground(translationBg);
        root.addView(translation);

        String shortDefinition = !definitionAr.isEmpty() ? definitionAr : definitionEn;
        TextView definition = new TextView(context);
        definition.setText(shortDefinition.isEmpty() ? "لا يتوفر شرح لهذا المصطلح." : shortDefinition);
        definition.setTextColor(Color.parseColor("#E2E8F0"));
        definition.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        definition.setMaxLines(2);
        definition.setEllipsize(TextUtils.TruncateAt.END);
        definition.setPadding(0, dp(context, 6), 0, 0);
        root.addView(definition);

        LinearLayout expandedDetails = new LinearLayout(context);
        expandedDetails.setOrientation(LinearLayout.VERTICAL);
        expandedDetails.setVisibility(View.GONE);
        expandedDetails.setPadding(0, dp(context, 6), 0, 0);

        if (!definitionAr.isEmpty() && !definitionEn.isEmpty()) {
            TextView englishDefinition = new TextView(context);
            englishDefinition.setText(definitionEn);
            englishDefinition.setTextColor(Color.parseColor("#94A3B8"));
            englishDefinition.setTextSize(TypedValue.COMPLEX_UNIT_SP, 10);
            expandedDetails.addView(englishDefinition);
        }
        if (!matchedInput.isEmpty() && !matchedInput.equalsIgnoreCase(termEn)
                && !matchedInput.equalsIgnoreCase(translationAr)) {
            TextView matched = new TextView(context);
            matched.setText("النص المطابق: " + matchedInput);
            matched.setTextColor(Color.parseColor("#38BDF8"));
            matched.setTextSize(TypedValue.COMPLEX_UNIT_SP, 10);
            expandedDetails.addView(matched);
        }
        if (!exampleEn.isEmpty()) {
            TextView example = new TextView(context);
            example.setText("مثال: " + exampleEn + (!exampleAr.isEmpty() ? "\\n" + exampleAr : ""));
            example.setTextColor(Color.parseColor("#CBD5E1"));
            example.setTextSize(TypedValue.COMPLEX_UNIT_SP, 10);
            example.setPadding(0, dp(context, 5), 0, 0);
            expandedDetails.addView(example);
        }
        root.addView(expandedDetails);

        LinearLayout actions = new LinearLayout(context);
        actions.setGravity(Gravity.CENTER_VERTICAL);
        actions.setPadding(0, dp(context, 7), 0, 0);
        TextView expand = createActionChip(context, "عرض البطاقة كاملة", "#1E293B", "#A7F3D0");
        expand.setTextSize(TypedValue.COMPLEX_UNIT_SP, 10);
        expand.setPadding(dp(context, 9), dp(context, 5), dp(context, 9), dp(context, 5));
        expand.setOnClickListener(v -> {
            boolean show = expandedDetails.getVisibility() != View.VISIBLE;
            expandedDetails.setVisibility(show ? View.VISIBLE : View.GONE);
            definition.setMaxLines(show ? 8 : 2);
            expand.setText(show ? "إخفاء التفاصيل" : "عرض البطاقة كاملة");
            if (onUserInteraction != null) onUserInteraction.run();
        });
        actions.addView(expand, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        TextView speak = createActionChip(context, "🔊", "#059669", "#FFFFFF");
        speak.setContentDescription("نطق المصطلح");
        speak.setOnClickListener(v -> {
            if (onUserInteraction != null) onUserInteraction.run();
            speakMedicalTerm(context, termEn);
        });
        LinearLayout.LayoutParams speakLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        speakLp.setMargins(dp(context, 5), 0, 0, 0);
        actions.addView(speak, speakLp);

        TextView copy = createActionChip(context, "نسخ", "#1E293B", "#E2E8F0");
        copy.setTextSize(TypedValue.COMPLEX_UNIT_SP, 10);
        copy.setPadding(dp(context, 9), dp(context, 5), dp(context, 9), dp(context, 5));
        copy.setOnClickListener(v -> {
            if (onUserInteraction != null) onUserInteraction.run();
            String value = translationAr.isEmpty() ? termEn : translationAr;
            ignoreClipboardText = value;
            try {
                ClipboardManager cm = (ClipboardManager) context.getSystemService(Context.CLIPBOARD_SERVICE);
                if (cm != null) {
                    cm.setPrimaryClip(ClipData.newPlainText("UMEDT Translation", value));
                    copy.setText("تم");
                }
            } catch (Exception ignored) { }
        });
        LinearLayout.LayoutParams copyLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        copyLp.setMargins(dp(context, 5), 0, 0, 0);
        actions.addView(copy, copyLp);
        root.addView(actions);
        return root;
    }

    private static TextView createActionChip(Context context, String label, String bgHex, String fgHex) {
        TextView btn = new TextView(context);
        btn.setText(label);
        btn.setTextColor(Color.parseColor(fgHex));
        btn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f);
        btn.setTypeface(Typeface.DEFAULT_BOLD);
        btn.setGravity(Gravity.CENTER);
        btn.setPadding(dp(context, 10), dp(context, 8), dp(context, 10), dp(context, 8));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.parseColor(bgHex));
        bg.setCornerRadius(dp(context, 12));
        bg.setStroke(dp(context, 1), Color.parseColor("#334155"));
        btn.setBackground(bg);
        return btn;
    }

    /**
     * Speaks the English medical term using native Android TextToSpeech without opening the main app.
     */
    public static void speakMedicalTerm(Context context, final String textToSpeak) {
        if (context == null || textToSpeak == null || textToSpeak.trim().isEmpty()) return;
        final Context appCtx = context.getApplicationContext();
        if (ttsEngine == null) {
            pendingTtsText = textToSpeak.trim();
            ttsEngine = new TextToSpeech(appCtx, status -> {
                if (status == TextToSpeech.SUCCESS && ttsEngine != null) {
                    ttsEngine.setLanguage(Locale.US);
                    ttsEngine.setSpeechRate(0.92f);
                    ttsReady = true;
                    if (pendingTtsText != null) {
                        speakInternal(pendingTtsText);
                        pendingTtsText = null;
                    }
                }
            });
        } else if (ttsReady) {
            speakInternal(textToSpeak.trim());
        } else {
            pendingTtsText = textToSpeak.trim();
        }
    }

    private static void speakInternal(String text) {
        if (ttsEngine == null) return;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                ttsEngine.speak(text, TextToSpeech.QUEUE_FLUSH, null, "umedt_popup_tts");
            } else {
                ttsEngine.speak(text, TextToSpeech.QUEUE_FLUSH, null);
            }
        } catch (Exception ignored) {
        }
    }

    private static int dp(Context context, int value) {
        return Math.round(value * context.getResources().getDisplayMetrics().density);
    }
}
