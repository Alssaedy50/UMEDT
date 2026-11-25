package org.umed2.dictengine;

import android.app.Dialog;
import android.content.ClipboardManager;
import android.content.Context;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.inputmethodservice.InputMethodService;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.HapticFeedbackConstants;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.ExtractedText;
import android.view.inputmethod.ExtractedTextRequest;
import android.view.inputmethod.InputConnection;
import android.view.inputmethod.InputMethodManager;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * UMEDT Complete Medical & Bilingual Keyboard (Arabic + English + Medical Symbols + Live Dictionary).
 * - Full 28+ Arabic letter inventory (including د, ذ, أ, إ, آ, لأ, لإ, لآ, لا, ة, ى, ء, ئ, ؤ, التشكيل)
 * - Dedicated top numbers row (1-0 / ١-٠)
 * - Two-page Symbols & Medical Units layout (123 and #+= with °, ±, μ, ≤, ≥, ‰, ÷, ×)
 * - Shift & Caps Lock (double-tap or long-press Shift for Caps Lock)
 * - Touch-and-hold continuous Backspace repeat & cursor arrow navigation (◀ / ▶)
 * - Smart Enter/Action key (Search 🔍, Send ➤, Next ⇥, Done ✓, Newline ⏎)
 * - One-tap Clipboard Paste (📋), TTS Speak (🔊), Keyboard Switcher (🌐), and Hide Keyboard (⌄)
 * - Live Medical Dictionary Autocomplete & Instant Floating Translation Card trigger
 */
public class UMEDTKeyboardService extends InputMethodService {

    private static final int MODE_LETTERS = 0;
    private static final int MODE_SYMBOLS_1 = 1;
    private static final int MODE_SYMBOLS_2 = 2;

    private boolean arabicLayout = true;
    private int symbolMode = MODE_LETTERS;
    private boolean shiftActive = false;
    private boolean capsLockActive = false;
    private long lastShiftTapMs = 0L;
    private long lastSpaceTapMs = 0L;

    private LinearLayout rootView;
    private TextView clipboardQuickBanner;
    private LinearLayout suggestionsContainer;
    private ClipboardManager clipboard;
    private String lastInspectedClip = "";

    private final Handler repeatHandler = new Handler(Looper.getMainLooper());
    private int backspaceHoldTicks = 0;
    private final Runnable backspaceRepeatRunnable = new Runnable() {
        @Override
        public void run() {
            backspaceHoldTicks++;
            performBackspace(backspaceHoldTicks > 18);
            repeatHandler.postDelayed(this, backspaceHoldTicks > 12 ? 45L : 65L);
        }
    };

    // English QWERTY with dedicated numbers row
    private static final String[][] EN_ROWS = new String[][]{
            {"1", "2", "3", "4", "5", "6", "7", "8", "9", "0"},
            {"q", "w", "e", "r", "t", "y", "u", "i", "o", "p"},
            {"a", "s", "d", "f", "g", "h", "j", "k", "l"},
            {"⇧", "z", "x", "c", "v", "b", "n", "m", "⌫"},
            {"123", "🌐", "AR", ",", "SPACE", ".", "/", "⏎"}
    };

    // Complete Arabic keyboard with all 28 letters (including د and ذ) + dedicated numbers row
    private static final String[][] AR_ROWS = new String[][]{
            {"1", "2", "3", "4", "5", "6", "7", "8", "9", "0"},
            {"ض", "ص", "ث", "ق", "ف", "غ", "ع", "ه", "خ", "ح", "ج", "د"},
            {"ش", "س", "ي", "ب", "ل", "ا", "ت", "ن", "م", "ك", "ط"},
            {"⇧", "ذ", "ئ", "ء", "ؤ", "ر", "لا", "ى", "ة", "و", "ز", "ظ", "⌫"},
            {"123", "🌐", "EN", "،", "SPACE", ".", "؟", "⏎"}
    };

    // Arabic Shift Layer: Hamzas (أ إ آ لأ لإ لآ), Tashkeel diacritics (َ ً ُ ٌ ِ ٍ ْ ّ), Eastern Arabic numbers, and Arabic punctuation
    private static final String[][] AR_SHIFT_ROWS = new String[][]{
            {"١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩", "٠"},
            {"َ", "ً", "ُ", "ٌ", "لإ", "إ", "‘", "÷", "×", "؛", "<", ">"},
            {"ِ", "ٍ", "]", "[", "لأ", "أ", "ـ", "،", "/", ":", "\""},
            {"⇧", "~", "ْ", "ّ", "لآ", "آ", "’", ",", ".", "؟", "!", "⌫"},
            {"123", "🌐", "EN", "،", "SPACE", ".", "؟", "⏎"}
    };

    // Symbols Page 1 (123)
    private static final String[][] SYM_ROWS_1 = new String[][]{
            {"1", "2", "3", "4", "5", "6", "7", "8", "9", "0"},
            {"@", "#", "$", "%", "&", "-", "+", "(", ")", "/"},
            {"#+=", "*", "\"", "'", ":", ";", "!", "?", "=", "⌫"},
            {"ABC", "🌐", "AR/EN", ",", "SPACE", ".", "_", "⏎"}
    };

    // Symbols Page 2 (#+=) with Medical & Scientific Units (°, ±, μ, ≤, ≥, ‰, ÷, ×)
    private static final String[][] SYM_ROWS_2 = new String[][]{
            {"~", "`", "|", "•", "√", "π", "÷", "×", "¶", "∆"},
            {"°", "±", "μ", "≤", "≥", "≠", "≈", "∞", "%", "‰"},
            {"123", "\\", "{", "}", "[", "]", "<", ">", "^", "⌫"},
            {"ABC", "🌐", "AR/EN", ",", "SPACE", ".", "-", "⏎"}
    };

    // Long-press quick alternate characters for fast medical & Arabic typing
    private static final Map<String, String> LONG_PRESS_ALT = new HashMap<>();
    static {
        LONG_PRESS_ALT.put("ا", "أ");
        LONG_PRESS_ALT.put("أ", "إ");
        LONG_PRESS_ALT.put("لا", "لأ");
        LONG_PRESS_ALT.put("ه", "ة");
        LONG_PRESS_ALT.put("ي", "ى");
        LONG_PRESS_ALT.put("و", "ؤ");
        LONG_PRESS_ALT.put("ء", "ئ");
        LONG_PRESS_ALT.put("ح", "خ");
        LONG_PRESS_ALT.put("ج", "چ");
        LONG_PRESS_ALT.put("د", "ذ");
        LONG_PRESS_ALT.put("ط", "ظ");
        LONG_PRESS_ALT.put("ص", "ض");
        LONG_PRESS_ALT.put("ع", "غ");
        LONG_PRESS_ALT.put("ف", "ڤ");
        LONG_PRESS_ALT.put("ك", "گ");
        LONG_PRESS_ALT.put(".", "؟");
        LONG_PRESS_ALT.put("،", "؛");
        LONG_PRESS_ALT.put("/", "\\");
    }

    private final ClipboardManager.OnPrimaryClipChangedListener clipListener = this::inspectClipboardForPopup;

    @Override
    public void onCreate() {
        super.onCreate();
        clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        if (clipboard != null) {
            try {
                clipboard.removePrimaryClipChangedListener(clipListener);
            } catch (Exception ignored) {
            }
            clipboard.addPrimaryClipChangedListener(clipListener);
        }
        UMEDTClipboardMonitorService.startMonitorIfEnabled(this);
    }

    @Override
    public View onCreateInputView() {
        rootView = new LinearLayout(this);
        rootView.setOrientation(LinearLayout.VERTICAL);
        rootView.setLayoutDirection(View.LAYOUT_DIRECTION_LTR);
        rootView.setBackgroundColor(Color.parseColor("#0B1320"));
        rootView.setPadding(dp(4), dp(5), dp(4), dp(10));
        renderKeyboard();
        return rootView;
    }

    @Override
    public void onStartInput(EditorInfo attribute, boolean restarting) {
        super.onStartInput(attribute, restarting);
        inspectClipboardForPopup();
        if (rootView != null) {
            renderKeyboard();
        }
    }

    @Override
    public void onWindowShown() {
        super.onWindowShown();
        inspectClipboardForPopup();
        refreshClipboardBanner();
        refreshAutocompleteSuggestions();
    }

    @Override
    public void onUpdateSelection(int oldSelStart, int oldSelEnd, int newSelStart, int newSelEnd,
                                  int candidatesStart, int candidatesEnd) {
        super.onUpdateSelection(oldSelStart, oldSelEnd, newSelStart, newSelEnd, candidatesStart, candidatesEnd);
        refreshAutocompleteSuggestions();
    }

    @Override
    public void onDestroy() {
        repeatHandler.removeCallbacks(backspaceRepeatRunnable);
        if (clipboard != null) {
            try {
                clipboard.removePrimaryClipChangedListener(clipListener);
            } catch (Exception ignored) {
            }
        }
        UMEDTDictionaryPopupEngine.dismissFloatingCard();
        super.onDestroy();
    }

    private void renderKeyboard() {
        if (rootView == null) return;
        rootView.removeAllViews();

        // ====================================================================
        // 1. TOP SMART MEDICAL TOOLBAR:
        //    [Clipboard Lookup Banner] [📋 Paste] [🔊 Speak] [◀] [▶] [🌐] [⌄]
        // ====================================================================
        LinearLayout topBar = new LinearLayout(this);
        topBar.setOrientation(LinearLayout.HORIZONTAL);
        topBar.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        topBar.setGravity(Gravity.CENTER_VERTICAL);
        topBar.setPadding(dp(2), dp(1), dp(2), dp(4));

        clipboardQuickBanner = new TextView(this);
        clipboardQuickBanner.setTextColor(Color.parseColor("#A7F3D0"));
        clipboardQuickBanner.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11.5f);
        clipboardQuickBanner.setTypeface(Typeface.DEFAULT_BOLD);
        clipboardQuickBanner.setSingleLine(true);
        clipboardQuickBanner.setEllipsize(TextUtils.TruncateAt.END);
        clipboardQuickBanner.setPadding(dp(8), dp(6), dp(8), dp(6));
        GradientDrawable bannerBg = new GradientDrawable();
        bannerBg.setColor(Color.parseColor("#064E3B"));
        bannerBg.setCornerRadius(dp(9));
        bannerBg.setStroke(dp(1), Color.parseColor("#10B981"));
        clipboardQuickBanner.setBackground(bannerBg);
        clipboardQuickBanner.setOnClickListener(v -> {
            v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
            JSONObject matched = UMEDTDictionaryPopupEngine.inspectClipboardAndShowIfMatched(this, true);
            if (matched != null) {
                refreshClipboardBanner();
            } else {
                String rawClip = UMEDTDictionaryPopupEngine.getCurrentClipboardText(this);
                if (rawClip.isEmpty()) {
                    Toast.makeText(this, "الحافظة فارغة حاليًا · انسخ أي مصطلح طبي لترجمته", Toast.LENGTH_SHORT).show();
                } else {
                    Toast.makeText(this, "الكلمة المنسوخة غير موجودة في قاموس UMEDT المحلي", Toast.LENGTH_SHORT).show();
                }
            }
        });
        LinearLayout.LayoutParams bannerParams = new LinearLayout.LayoutParams(
                0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f
        );
        bannerParams.setMargins(dp(3), 0, 0, 0);
        topBar.addView(clipboardQuickBanner, bannerParams);

        // Paste Button (📋)
        TextView pasteChip = createToolbarButton("📋 لصق", "#1E293B", "#E2E8F0");
        pasteChip.setOnClickListener(v -> {
            v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
            pasteFromClipboard();
        });
        topBar.addView(pasteChip);

        // Speak TTS Button (🔊)
        TextView speakChip = createToolbarButton("🔊", "#1E293B", "#34D399");
        speakChip.setOnClickListener(v -> {
            v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
            speakCurrentOrCopiedWord();
        });
        topBar.addView(speakChip);

        // Cursor Left / Right Buttons (◀ / ▶)
        TextView leftArrowChip = createToolbarButton("◀", "#1E293B", "#CBD5E1");
        leftArrowChip.setOnClickListener(v -> {
            v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
            moveCursor(-1);
        });
        topBar.addView(leftArrowChip);

        TextView rightArrowChip = createToolbarButton("▶", "#1E293B", "#CBD5E1");
        rightArrowChip.setOnClickListener(v -> {
            v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
            moveCursor(1);
        });
        topBar.addView(rightArrowChip);

        // Switch Keyboard Button (🌐)
        TextView switchImeChip = createToolbarButton("🌐", "#1E293B", "#38BDF8");
        switchImeChip.setOnClickListener(v -> {
            v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
            switchKeyboardMethod(false);
        });
        switchImeChip.setOnLongClickListener(v -> {
            v.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS);
            switchKeyboardMethod(true);
            return true;
        });
        topBar.addView(switchImeChip);

        // Hide Keyboard Button (⌄)
        TextView hideKeyboardChip = createToolbarButton("⌄", "#1E293B", "#94A3B8");
        hideKeyboardChip.setOnClickListener(v -> {
            v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
            requestHideSelf(0);
        });
        topBar.addView(hideKeyboardChip);

        rootView.addView(topBar);

        // ====================================================================
        // 2. LIVE DICTIONARY AUTOCOMPLETE & TRANSLATION SUGGESTIONS STRIP
        // ====================================================================
        HorizontalScrollView suggestionScroll = new HorizontalScrollView(this);
        suggestionScroll.setHorizontalScrollBarEnabled(false);
        LinearLayout.LayoutParams scrollParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
        );
        scrollParams.bottomMargin = dp(4);
        suggestionScroll.setLayoutParams(scrollParams);

        suggestionsContainer = new LinearLayout(this);
        suggestionsContainer.setOrientation(LinearLayout.HORIZONTAL);
        suggestionsContainer.setGravity(Gravity.CENTER_VERTICAL);
        suggestionsContainer.setPadding(dp(2), dp(1), dp(2), dp(1));
        suggestionScroll.addView(suggestionsContainer);
        rootView.addView(suggestionScroll);

        refreshClipboardBanner();
        refreshAutocompleteSuggestions();

        // ====================================================================
        // 3. KEYBOARD ROWS
        // ====================================================================
        String[][] rows = getActiveRows();
        for (int r = 0; r < rows.length; r++) {
            String[] row = rows[r];
            boolean isNumberRow = (r == 0 && symbolMode == MODE_LETTERS);
            LinearLayout rowLayout = new LinearLayout(this);
            rowLayout.setOrientation(LinearLayout.HORIZONTAL);
            rowLayout.setLayoutDirection(View.LAYOUT_DIRECTION_LTR);
            rowLayout.setGravity(Gravity.CENTER);
            LinearLayout.LayoutParams rowParams = new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
            );
            rowParams.bottomMargin = dp(isNumberRow ? 4 : 5);
            rowLayout.setLayoutParams(rowParams);

            for (String key : row) {
                rowLayout.addView(createKeyView(key, isNumberRow));
            }
            rootView.addView(rowLayout);
        }
    }

    private String[][] getActiveRows() {
        if (symbolMode == MODE_SYMBOLS_1) {
            return SYM_ROWS_1;
        }
        if (symbolMode == MODE_SYMBOLS_2) {
            return SYM_ROWS_2;
        }
        if (arabicLayout) {
            return (shiftActive || capsLockActive) ? AR_SHIFT_ROWS : AR_ROWS;
        }
        return EN_ROWS;
    }

    private TextView createToolbarButton(String text, String bgHex, String fgHex) {
        TextView btn = new TextView(this);
        btn.setText(text);
        btn.setTextColor(Color.parseColor(fgHex));
        btn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f);
        btn.setTypeface(Typeface.DEFAULT_BOLD);
        btn.setGravity(Gravity.CENTER);
        btn.setPadding(dp(7), dp(6), dp(7), dp(6));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.parseColor(bgHex));
        bg.setCornerRadius(dp(8));
        bg.setStroke(dp(1), Color.parseColor("#334155"));
        btn.setBackground(bg);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT
        );
        lp.setMargins(dp(2), 0, 0, 0);
        btn.setLayoutParams(lp);
        return btn;
    }

    private void refreshClipboardBanner() {
        if (clipboardQuickBanner == null) return;
        JSONObject matched = UMEDTDictionaryPopupEngine.peekClipboardMatchedTerm(this);
        if (matched != null) {
            String term = matched.optString("term", "");
            String trans = matched.optString("translation", "");
            clipboardQuickBanner.setText("⚡ " + term + " ← " + trans);
        } else {
            int count = UMEDTDictionaryPopupEngine.getSyncedTermsCount(this);
            clipboardQuickBanner.setText("📖 قاموس UMEDT (" + count + " مصطلح) · انسخ لترجمة فورية");
        }
    }

    private void refreshAutocompleteSuggestions() {
        if (suggestionsContainer == null) return;
        suggestionsContainer.removeAllViews();

        String currentWord = getCurrentWordBeforeCursor();
        if (currentWord.length() >= 2) {
            List<JSONObject> suggestions = UMEDTDictionaryPopupEngine.findSuggestions(this, currentWord, 4);
            if (!suggestions.isEmpty()) {
                for (final JSONObject item : suggestions) {
                    final String termEn = item.optString("term", "");
                    final String transAr = item.optString("translation", "");
                    TextView chip = new TextView(this);
                    chip.setText("📖 " + termEn + " · " + transAr);
                    chip.setTextColor(Color.parseColor("#E2E8F0"));
                    chip.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11.5f);
                    chip.setTypeface(Typeface.DEFAULT_BOLD);
                    chip.setPadding(dp(10), dp(5), dp(10), dp(5));
                    GradientDrawable bg = new GradientDrawable();
                    bg.setColor(Color.parseColor("#1E293B"));
                    bg.setCornerRadius(dp(10));
                    bg.setStroke(dp(1), Color.parseColor("#10B981"));
                    chip.setBackground(bg);

                    // Single tap: autocomplete the term in the current language & show popup card if long-pressed
                    chip.setOnClickListener(v -> {
                        v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
                        boolean typedArabic = isArabicString(currentWord);
                        String replacement = typedArabic && !transAr.isEmpty() ? transAr : termEn;
                        replaceCurrentWordBeforeCursor(currentWord, replacement + " ");
                        UMEDTDictionaryPopupEngine.showFloatingCard(getApplicationContext(), item, true);
                    });
                    chip.setOnLongClickListener(v -> {
                        v.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS);
                        UMEDTDictionaryPopupEngine.showFloatingCard(getApplicationContext(), item, true);
                        return true;
                    });

                    LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT
                    );
                    lp.setMargins(dp(3), 0, dp(3), 0);
                    chip.setLayoutParams(lp);
                    suggestionsContainer.addView(chip);
                }
                return;
            }
        }

        // Default quick medical prefixes/punctuations strip when no word is being typed
        String[] quickTokens = arabicLayout
                ? new String[]{"أ", "إ", "آ", "ة", "ى", "؟", "،", "mg", "mL", "%"}
                : new String[]{"mg", "mL", "mmHg", "°C", "IV", "PO", "bid", "tid", "/", "%"};

        for (final String token : quickTokens) {
            TextView quickChip = new TextView(this);
            quickChip.setText(token);
            quickChip.setTextColor(Color.parseColor("#CBD5E1"));
            quickChip.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11.5f);
            quickChip.setTypeface(Typeface.DEFAULT_BOLD);
            quickChip.setPadding(dp(9), dp(4), dp(9), dp(4));
            GradientDrawable bg = new GradientDrawable();
            bg.setColor(Color.parseColor("#162032"));
            bg.setCornerRadius(dp(8));
            bg.setStroke(dp(1), Color.parseColor("#26354D"));
            quickChip.setBackground(bg);
            quickChip.setOnClickListener(v -> {
                v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
                InputConnection ic = getCurrentInputConnection();
                if (ic != null) {
                    ic.commitText(token.length() > 1 ? token + " " : token, 1);
                    refreshAutocompleteSuggestions();
                }
            });
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT
            );
            lp.setMargins(dp(2), 0, dp(2), 0);
            quickChip.setLayoutParams(lp);
            suggestionsContainer.addView(quickChip);
        }
    }

    private View createKeyView(final String label, final boolean isCompactNumberRow) {
        final TextView keyView = new TextView(this);
        String displayLabel = resolveDisplayLabel(label);

        keyView.setText(displayLabel);
        keyView.setGravity(Gravity.CENTER);
        keyView.setTextColor(Color.WHITE);

        float textSizeSp = 15.5f;
        if (isCompactNumberRow) {
            textSizeSp = 13.5f;
        } else if ("SPACE".equals(label) || "123".equals(label) || "ABC".equals(label)
                || "#+=".equals(label) || "AR".equals(label) || "EN".equals(label) || "AR/EN".equals(label)) {
            textSizeSp = 12.5f;
        }
        keyView.setTextSize(TypedValue.COMPLEX_UNIT_SP, textSizeSp);
        keyView.setTypeface(Typeface.DEFAULT_BOLD);

        final String normalBgColor = resolveKeyBackgroundColor(label, isCompactNumberRow);
        final String pressedBgColor = "#10B981";

        final GradientDrawable keyBg = new GradientDrawable();
        keyBg.setColor(Color.parseColor(normalBgColor));
        keyBg.setCornerRadius(dp(isCompactNumberRow ? 6 : 8));
        keyBg.setStroke(dp(1), Color.parseColor("#334155"));
        keyView.setBackground(keyBg);

        int verticalPad = dp(isCompactNumberRow ? 7 : 10);
        keyView.setPadding(dp(2), verticalPad, dp(2), verticalPad);

        float weight = 1f;
        if ("SPACE".equals(label)) {
            weight = 3.8f;
        } else if ("⌫".equals(label) || "⏎".equals(label) || "⇧".equals(label)
                || "123".equals(label) || "ABC".equals(label) || "#+=".equals(label)) {
            weight = 1.35f;
        } else if ("AR".equals(label) || "EN".equals(label) || "AR/EN".equals(label)) {
            weight = 1.15f;
        }

        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                0,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                weight
        );
        params.setMargins(dp(2), 0, dp(2), 0);
        keyView.setLayoutParams(params);

        // Special touch-and-hold handling for Backspace (⌫)
        if ("⌫".equals(label)) {
            keyView.setOnTouchListener((v, event) -> {
                int action = event.getActionMasked();
                if (action == MotionEvent.ACTION_DOWN) {
                    v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
                    keyBg.setColor(Color.parseColor("#EF4444"));
                    backspaceHoldTicks = 0;
                    performBackspace(false);
                    repeatHandler.removeCallbacks(backspaceRepeatRunnable);
                    repeatHandler.postDelayed(backspaceRepeatRunnable, 360L);
                    return true;
                } else if (action == MotionEvent.ACTION_UP || action == MotionEvent.ACTION_CANCEL) {
                    repeatHandler.removeCallbacks(backspaceRepeatRunnable);
                    keyBg.setColor(Color.parseColor(normalBgColor));
                    return true;
                }
                return false;
            });
            return keyView;
        }

        // Visual press highlight for all keys
        keyView.setOnTouchListener((v, event) -> {
            int action = event.getActionMasked();
            if (action == MotionEvent.ACTION_DOWN) {
                v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
                keyBg.setColor(Color.parseColor(pressedBgColor));
            } else if (action == MotionEvent.ACTION_UP || action == MotionEvent.ACTION_CANCEL) {
                keyBg.setColor(Color.parseColor(normalBgColor));
            }
            return false;
        });

        keyView.setOnClickListener(v -> handleKeyPress(label));

        // Long-press handlers
        keyView.setOnLongClickListener(v -> {
            v.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS);
            if ("⇧".equals(label)) {
                capsLockActive = !capsLockActive;
                shiftActive = capsLockActive;
                renderKeyboard();
                return true;
            }
            if ("🌐".equals(label) || "SPACE".equals(label)) {
                switchKeyboardMethod(true);
                return true;
            }
            String alt = LONG_PRESS_ALT.get(label);
            if (alt != null) {
                commitString(alt);
                return true;
            }
            if (label.length() == 1 && Character.isLetter(label.charAt(0))) {
                commitString(label.toUpperCase(Locale.ROOT));
                return true;
            }
            return false;
        });

        return keyView;
    }

    private String resolveDisplayLabel(String label) {
        if ("SPACE".equals(label)) {
            if (symbolMode != MODE_LETTERS) {
                return arabicLayout ? "مسافة · ١٢٣" : "SPACE · 123";
            }
            return arabicLayout ? "مسافة · UMEDT الطبية" : "UMEDT Medical · Space";
        }
        if ("⇧".equals(label)) {
            if (arabicLayout) {
                return (shiftActive || capsLockActive) ? "أ ب ت" : "أ إ ّ";
            }
            return capsLockActive ? "⇪" : "⇧";
        }
        if ("⏎".equals(label)) {
            return resolveEnterKeyLabel();
        }
        if (symbolMode == MODE_LETTERS && !arabicLayout && label.length() == 1 && Character.isLetter(label.charAt(0))) {
            return (shiftActive || capsLockActive) ? label.toUpperCase(Locale.ROOT) : label.toLowerCase(Locale.ROOT);
        }
        String alt = LONG_PRESS_ALT.get(label);
        if (alt != null && symbolMode == MODE_LETTERS && arabicLayout && !shiftActive && !capsLockActive) {
            return label;
        }
        return label;
    }

    private String resolveKeyBackgroundColor(String label, boolean isCompactNumberRow) {
        if (isCompactNumberRow) {
            return "#152033";
        }
        if ("⏎".equals(label) || "AR".equals(label) || "EN".equals(label) || "AR/EN".equals(label)) {
            return "#059669";
        }
        if ("⇧".equals(label)) {
            if (capsLockActive) return "#059669";
            if (shiftActive) return "#0284C7";
            return "#334155";
        }
        if ("⌫".equals(label) || "123".equals(label) || "ABC".equals(label)
                || "#+=".equals(label) || "🌐".equals(label)) {
            return "#334155";
        }
        return "#1E293B";
    }

    private void handleKeyPress(String label) {
        if ("AR".equals(label) || "EN".equals(label) || "AR/EN".equals(label)) {
            arabicLayout = !arabicLayout;
            symbolMode = MODE_LETTERS;
            shiftActive = false;
            capsLockActive = false;
            renderKeyboard();
            return;
        }
        if ("123".equals(label)) {
            symbolMode = MODE_SYMBOLS_1;
            renderKeyboard();
            return;
        }
        if ("#+=".equals(label)) {
            symbolMode = MODE_SYMBOLS_2;
            renderKeyboard();
            return;
        }
        if ("ABC".equals(label)) {
            symbolMode = MODE_LETTERS;
            renderKeyboard();
            return;
        }
        if ("⇧".equals(label)) {
            long now = System.currentTimeMillis();
            if (!arabicLayout && (now - lastShiftTapMs) < 380L) {
                capsLockActive = true;
                shiftActive = true;
            } else if (capsLockActive) {
                capsLockActive = false;
                shiftActive = false;
            } else {
                shiftActive = !shiftActive;
            }
            lastShiftTapMs = now;
            renderKeyboard();
            return;
        }
        if ("🌐".equals(label)) {
            switchKeyboardMethod(false);
            return;
        }
        if ("⌫".equals(label)) {
            performBackspace(false);
            return;
        }
        if ("SPACE".equals(label)) {
            handleSpacePress();
            return;
        }
        if ("⏎".equals(label)) {
            handleEnterAction();
            return;
        }

        String out = label;
        if (symbolMode == MODE_LETTERS && !arabicLayout && label.length() == 1 && Character.isLetter(label.charAt(0))) {
            out = (shiftActive || capsLockActive) ? label.toUpperCase(Locale.ROOT) : label.toLowerCase(Locale.ROOT);
        }
        commitString(out);

        if (shiftActive && !capsLockActive) {
            shiftActive = false;
            renderKeyboard();
        }
    }

    private void commitString(String text) {
        InputConnection ic = getCurrentInputConnection();
        if (ic == null) return;
        ic.commitText(text, 1);
        refreshAutocompleteSuggestions();
    }

    private void handleSpacePress() {
        InputConnection ic = getCurrentInputConnection();
        if (ic == null) return;
        long now = System.currentTimeMillis();
        if ((now - lastSpaceTapMs) < 320L) {
            CharSequence before = ic.getTextBeforeCursor(2, 0);
            if (before != null && before.length() == 2
                    && before.charAt(1) == ' '
                    && Character.isLetterOrDigit(before.charAt(0))) {
                ic.deleteSurroundingText(1, 0);
                ic.commitText(". ", 1);
                lastSpaceTapMs = 0L;
                refreshAutocompleteSuggestions();
                return;
            }
        }
        lastSpaceTapMs = now;
        ic.commitText(" ", 1);
        refreshAutocompleteSuggestions();
    }

    private void performBackspace(boolean deleteWholeWord) {
        InputConnection ic = getCurrentInputConnection();
        if (ic == null) return;
        CharSequence selected = ic.getSelectedText(0);
        if (!TextUtils.isEmpty(selected)) {
            ic.commitText("", 1);
            refreshAutocompleteSuggestions();
            return;
        }

        if (deleteWholeWord) {
            CharSequence before = ic.getTextBeforeCursor(24, 0);
            if (before != null && before.length() > 0) {
                int count = 0;
                int idx = before.length() - 1;
                while (idx >= 0 && Character.isWhitespace(before.charAt(idx))) {
                    count++;
                    idx--;
                }
                while (idx >= 0 && !Character.isWhitespace(before.charAt(idx))) {
                    count++;
                    idx--;
                }
                ic.deleteSurroundingText(Math.max(1, count), 0);
                refreshAutocompleteSuggestions();
                return;
            }
        }

        ic.deleteSurroundingText(1, 0);
        refreshAutocompleteSuggestions();
    }

    private String resolveEnterKeyLabel() {
        EditorInfo ei = getCurrentInputEditorInfo();
        if (ei == null) return "⏎";
        int action = ei.imeOptions & EditorInfo.IME_MASK_ACTION;
        boolean noEnterAction = (ei.imeOptions & EditorInfo.IME_FLAG_NO_ENTER_ACTION) != 0;
        if (noEnterAction) return "⏎";
        switch (action) {
            case EditorInfo.IME_ACTION_SEARCH:
                return "🔍";
            case EditorInfo.IME_ACTION_SEND:
                return "➤";
            case EditorInfo.IME_ACTION_GO:
                return "➔";
            case EditorInfo.IME_ACTION_NEXT:
                return "⇥";
            case EditorInfo.IME_ACTION_DONE:
                return "✓";
            default:
                return "⏎";
        }
    }

    private void handleEnterAction() {
        InputConnection ic = getCurrentInputConnection();
        if (ic == null) return;
        EditorInfo ei = getCurrentInputEditorInfo();
        if (ei != null) {
            int action = ei.imeOptions & EditorInfo.IME_MASK_ACTION;
            boolean noEnterAction = (ei.imeOptions & EditorInfo.IME_FLAG_NO_ENTER_ACTION) != 0;
            if (!noEnterAction && action != EditorInfo.IME_ACTION_NONE && action != EditorInfo.IME_ACTION_UNSPECIFIED) {
                if (ic.performEditorAction(action)) {
                    return;
                }
            }
        }
        ic.sendKeyEvent(new KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_ENTER));
        ic.sendKeyEvent(new KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_ENTER));
    }

    private void pasteFromClipboard() {
        InputConnection ic = getCurrentInputConnection();
        if (ic == null) return;
        String clipText = UMEDTDictionaryPopupEngine.getCurrentClipboardText(this);
        if (clipText.isEmpty()) {
            Toast.makeText(this, "الحافظة فارغة حاليًا", Toast.LENGTH_SHORT).show();
            return;
        }
        ic.commitText(clipText, 1);
        refreshAutocompleteSuggestions();
    }

    private void speakCurrentOrCopiedWord() {
        String target = getCurrentWordBeforeCursor();
        if (target.isEmpty()) {
            JSONObject matched = UMEDTDictionaryPopupEngine.peekClipboardMatchedTerm(this);
            if (matched != null) {
                target = matched.optString("term", "");
            } else {
                target = UMEDTDictionaryPopupEngine.getCurrentClipboardText(this);
            }
        }
        if (target != null && !target.trim().isEmpty()) {
            UMEDTDictionaryPopupEngine.speakMedicalTerm(this, target.trim());
        } else {
            Toast.makeText(this, "اكتب أو انسخ مصطلحًا طبيًا لنطقه صوتيًا", Toast.LENGTH_SHORT).show();
        }
    }

    private void moveCursor(int delta) {
        InputConnection ic = getCurrentInputConnection();
        if (ic == null) return;
        try {
            ExtractedText et = ic.getExtractedText(new ExtractedTextRequest(), 0);
            if (et != null && et.text != null) {
                int len = et.text.length();
                int nextPos = Math.max(0, Math.min(len, et.selectionEnd + delta));
                ic.setSelection(nextPos, nextPos);
                return;
            }
        } catch (Exception ignored) {
        }
        int keyCode = delta < 0 ? KeyEvent.KEYCODE_DPAD_LEFT : KeyEvent.KEYCODE_DPAD_RIGHT;
        ic.sendKeyEvent(new KeyEvent(KeyEvent.ACTION_DOWN, keyCode));
        ic.sendKeyEvent(new KeyEvent(KeyEvent.ACTION_UP, keyCode));
    }

    private String getCurrentWordBeforeCursor() {
        InputConnection ic = getCurrentInputConnection();
        if (ic == null) return "";
        try {
            CharSequence selected = ic.getSelectedText(0);
            if (selected != null && selected.length() > 0 && selected.length() <= 45) {
                return selected.toString().trim();
            }
            CharSequence before = ic.getTextBeforeCursor(40, 0);
            if (before == null || before.length() == 0) return "";
            String s = before.toString();
            int i = s.length() - 1;
            while (i >= 0 && (Character.isLetterOrDigit(s.charAt(i)) || s.charAt(i) == '-')) {
                i--;
            }
            return s.substring(i + 1).trim();
        } catch (Exception ignored) {
            return "";
        }
    }

    private void replaceCurrentWordBeforeCursor(String currentWord, String replacement) {
        InputConnection ic = getCurrentInputConnection();
        if (ic == null) return;
        try {
            CharSequence selected = ic.getSelectedText(0);
            if (!TextUtils.isEmpty(selected)) {
                ic.commitText(replacement, 1);
            } else {
                ic.deleteSurroundingText(currentWord.length(), 0);
                ic.commitText(replacement, 1);
            }
            refreshAutocompleteSuggestions();
        } catch (Exception ignored) {
        }
    }

    private static boolean isArabicString(String s) {
        if (s == null) return false;
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c >= '\u0600' && c <= '\u06FF') return true;
        }
        return false;
    }

    private void switchKeyboardMethod(boolean forcePicker) {
        try {
            InputMethodManager imm = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
            if (forcePicker && imm != null) {
                imm.showInputMethodPicker();
                return;
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                boolean switched = switchToPreviousInputMethod();
                if (switched) return;
            }
            if (imm != null) {
                Dialog imeDialog = getWindow();
                Window dialogWindow = imeDialog != null ? imeDialog.getWindow() : null;
                WindowManager.LayoutParams attrs = dialogWindow != null ? dialogWindow.getAttributes() : null;
                IBinder token = attrs != null ? attrs.token : null;
                if (token != null && imm.switchToLastInputMethod(token)) {
                    return;
                }
                imm.showInputMethodPicker();
            }
        } catch (Exception ignored) {
            try {
                InputMethodManager imm = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
                if (imm != null) imm.showInputMethodPicker();
            } catch (Exception ignored2) {
            }
        }
    }

    private void inspectClipboardForPopup() {
        try {
            JSONObject matched = UMEDTDictionaryPopupEngine.peekClipboardMatchedTerm(this);
            refreshClipboardBanner();
            if (matched != null) {
                String matchedKey = matched.optString("_matchedInput", matched.optString("term", ""));
                if (!matchedKey.equals(lastInspectedClip)) {
                    lastInspectedClip = matchedKey;
                }
                UMEDTDictionaryPopupEngine.showFloatingCard(getApplicationContext(), matched, false);
            }
        } catch (Exception ignored) {
        }
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}