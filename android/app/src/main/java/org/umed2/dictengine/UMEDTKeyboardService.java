package org.umed2.dictengine;

import android.app.Dialog;
import android.content.ClipboardManager;
import android.content.Context;
import android.graphics.Color;
import android.graphics.Insets;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.inputmethodservice.InputMethodService;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.text.InputType;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.HapticFeedbackConstants;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;
import android.view.inputmethod.InputMethodManager;
import android.widget.FrameLayout;
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
 * UMEDT Global-Standard Compact Medical & Bilingual Keyboard (Gboard / Samsung style).
 *
 * Key architecture fixes:
 * 1. Compact 4-Row Key Grid + Single 36dp Smart Header (~228dp active height, never oversized).
 * 2. Full Android 15/16 (targetSdk 36) edge-to-edge navigation bar inset protection so the bottom
 *    row is NEVER covered by the system navigation bar (◀ ⏺ ■).
 * 3. 100% reliable Backspace (⌫) across Chromium WebView (React controlled inputs, mixed RTL/LTR BiDi text)
 *    and native Android EditTexts using sendDownUpKeyEvents(KEYCODE_DEL) + InputConnection fallback + continuous hold repeat.
 * 4. Floating Popup Key Bubbles (الأزرار المنبثقة) on long-press for numbers (1-0), Hamzas (أ إ آ لأ لإ لآ),
 *    Tashkeel (َ ً ُ ٌ ِ ٍ ّ ْ), Punctuation (؟ ! ؛ :), and a one-tap Tools/Medical/Tashkeel Popup Tray.
 * 5. Complete 28+ Arabic letter inventory on a symmetrical 11-key grid with fixed single-line key heights.
 */
public class UMEDTKeyboardService extends InputMethodService {

    private static final int MODE_LETTERS = 0;
    private static final int MODE_SYMBOLS_1 = 1;
    private static final int MODE_SYMBOLS_2 = 2;

    private static final String POPUP_NONE = "";
    private static final String POPUP_TOOLS = "TOOLS";
    private static final String POPUP_TASHKEEL = "TASHKEEL";
    private static final String POPUP_MEDICAL = "MEDICAL";
    private static final String POPUP_KEY_ALT = "KEY_ALT";

    private boolean arabicLayout = true;
    private int symbolMode = MODE_LETTERS;
    private boolean shiftActive = false;
    private boolean capsLockActive = false;
    private long lastShiftTapMs = 0L;
    private long lastSpaceTapMs = 0L;

    private FrameLayout rootContainer;
    private LinearLayout keyboardBody;
    private FrameLayout popupOverlayContainer;
    private LinearLayout suggestionsContainer;
    private ClipboardManager clipboard;
    private String lastInspectedClip = "";

    private String activePopupType = POPUP_NONE;
    private String activePopupTitle = "";
    private String[] activePopupOptions = new String[0];

    private final Handler repeatHandler = new Handler(Looper.getMainLooper());
    private final Runnable debouncedSuggestionsRunnable = this::refreshSuggestionsStrip;
    private int backspaceHoldTicks = 0;
    private boolean backspaceRepeating = false;
    private final Runnable backspaceRepeatRunnable = new Runnable() {
        @Override
        public void run() {
            backspaceRepeating = true;
            backspaceHoldTicks++;
            performBackspace(backspaceHoldTicks > 22);
            repeatHandler.postDelayed(this, backspaceHoldTicks > 10 ? 45L : 65L);
        }
    };

    // ========================================================================
    // GLOBAL STANDARD 4-ROW LAYOUTS (Compact, Balanced, Max 11 Keys per Row)
    // ========================================================================

    // English QWERTY (4 rows, numbers 1-0 on Row 1 long-press popup + ?123 mode)
    private static final String[][] EN_ROWS = new String[][]{
            {"q", "w", "e", "r", "t", "y", "u", "i", "o", "p"},
            {"a", "s", "d", "f", "g", "h", "j", "k", "l"},
            {"⇧", "z", "x", "c", "v", "b", "n", "m", "⌫"},
            {"?123", "LANG", ",", "SPACE", ".", "⏎"}
    };

    // Complete 28-Letter Arabic Layout (Symmetrical 11-key grid, zero multi-line keys)
    private static final String[][] AR_ROWS = new String[][]{
            {"ض", "ص", "ث", "ق", "ف", "غ", "ع", "ه", "خ", "ح", "ج"},
            {"ش", "س", "ي", "ب", "ل", "ا", "ت", "ن", "م", "ك", "ط"},
            {"ذ", "ء", "ر", "لا", "ى", "ة", "و", "ز", "ظ", "د", "⌫"},
            {"?123", "LANG", "،", "SPACE", ".", "⏎"}
    };

    // Symbols & Numbers Page 1 (?123)
    private static final String[][] SYM_ROWS_1 = new String[][]{
            {"1", "2", "3", "4", "5", "6", "7", "8", "9", "0"},
            {"@", "#", "$", "%", "&", "-", "+", "(", ")", "/"},
            {"=\\<", "*", "\"", "'", ":", ";", "!", "?", "=", "⌫"},
            {"ABC", "LANG", ",", "SPACE", ".", "⏎"}
    };

    // Symbols & Medical Units Page 2 (=\<)
    private static final String[][] SYM_ROWS_2 = new String[][]{
            {"١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩", "٠"},
            {"°", "±", "μ", "≤", "≥", "≠", "≈", "÷", "×", "‰"},
            {"?123", "~", "`", "|", "{", "}", "[", "]", "^", "⌫"},
            {"ABC", "LANG", "،", "SPACE", ".", "⏎"}
    };

    // Top-right corner hint badge for each key
    private static final Map<String, String> KEY_CORNER_HINTS = new HashMap<>();
    // Long-press popup options array for each key
    private static final Map<String, String[]> KEY_POPUP_OPTIONS = new HashMap<>();

    static {
        // Arabic Row 1 hints & popups (Numbers 1-0 + Eastern Arabic numerals)
        KEY_CORNER_HINTS.put("ض", "1");
        KEY_POPUP_OPTIONS.put("ض", new String[]{"1", "١", "ض"});
        KEY_CORNER_HINTS.put("ص", "2");
        KEY_POPUP_OPTIONS.put("ص", new String[]{"2", "٢", "ص"});
        KEY_CORNER_HINTS.put("ث", "3");
        KEY_POPUP_OPTIONS.put("ث", new String[]{"3", "٣", "ث"});
        KEY_CORNER_HINTS.put("ق", "4");
        KEY_POPUP_OPTIONS.put("ق", new String[]{"4", "٤", "ڤ", "ق"});
        KEY_CORNER_HINTS.put("ف", "5");
        KEY_POPUP_OPTIONS.put("ف", new String[]{"5", "٥", "ڤ", "ف"});
        KEY_CORNER_HINTS.put("غ", "6");
        KEY_POPUP_OPTIONS.put("غ", new String[]{"6", "٦", "غ"});
        KEY_CORNER_HINTS.put("ع", "7");
        KEY_POPUP_OPTIONS.put("ع", new String[]{"7", "٧", "ع"});
        KEY_CORNER_HINTS.put("ه", "8");
        KEY_POPUP_OPTIONS.put("ه", new String[]{"8", "٨", "ة", "هـ"});
        KEY_CORNER_HINTS.put("خ", "9");
        KEY_POPUP_OPTIONS.put("خ", new String[]{"9", "٩", "خ"});
        KEY_CORNER_HINTS.put("ح", "0");
        KEY_POPUP_OPTIONS.put("ح", new String[]{"0", "٠", "ح"});
        KEY_CORNER_HINTS.put("ج", "چ");
        KEY_POPUP_OPTIONS.put("ج", new String[]{"چ", "د", "ذ", "-"});

        // Arabic Row 2 hints & popups (Hamzas, Lam-Alif, Diacritics)
        KEY_CORNER_HINTS.put("ي", "ى");
        KEY_POPUP_OPTIONS.put("ي", new String[]{"ى", "ئ", "ي"});
        KEY_CORNER_HINTS.put("ب", "پ");
        KEY_POPUP_OPTIONS.put("ب", new String[]{"پ", "ب"});
        KEY_CORNER_HINTS.put("ل", "لا");
        KEY_POPUP_OPTIONS.put("ل", new String[]{"لا", "لأ", "لإ", "لآ"});
        KEY_CORNER_HINTS.put("ا", "أ إ آ");
        KEY_POPUP_OPTIONS.put("ا", new String[]{"أ", "إ", "آ", "ٱ", "لا", "لأ", "لإ", "لآ"});
        KEY_CORNER_HINTS.put("ت", "ة");
        KEY_POPUP_OPTIONS.put("ت", new String[]{"ة", "ت"});
        KEY_CORNER_HINTS.put("ن", "ـ");
        KEY_POPUP_OPTIONS.put("ن", new String[]{"ـ", "ن"});
        KEY_CORNER_HINTS.put("م", "μ");
        KEY_POPUP_OPTIONS.put("م", new String[]{"mg", "mL", "mmHg", "μ"});
        KEY_CORNER_HINTS.put("ك", "گ");
        KEY_POPUP_OPTIONS.put("ك", new String[]{"گ", "ك", ":"});
        KEY_CORNER_HINTS.put("ط", "ظ");
        KEY_POPUP_OPTIONS.put("ط", new String[]{"ظ", "ط"});

        // Arabic Row 3 hints & popups
        KEY_CORNER_HINTS.put("ذ", "ّ");
        KEY_POPUP_OPTIONS.put("ذ", new String[]{"ّ", "ْ", "َ", "ُ", "ِ", "ذ"});
        KEY_CORNER_HINTS.put("ء", "ئ ؤ");
        KEY_POPUP_OPTIONS.put("ء", new String[]{"أ", "إ", "آ", "ئ", "ؤ", "ء"});
        KEY_CORNER_HINTS.put("لا", "لأ");
        KEY_POPUP_OPTIONS.put("لا", new String[]{"لأ", "لإ", "لآ", "لا"});
        KEY_CORNER_HINTS.put("ى", "ئ");
        KEY_POPUP_OPTIONS.put("ى", new String[]{"ئ", "ي", "ى"});
        KEY_CORNER_HINTS.put("ة", "ه");
        KEY_POPUP_OPTIONS.put("ة", new String[]{"ه", "ة"});
        KEY_CORNER_HINTS.put("و", "ؤ");
        KEY_POPUP_OPTIONS.put("و", new String[]{"ؤ", "و"});
        KEY_CORNER_HINTS.put("ز", "ژ");
        KEY_POPUP_OPTIONS.put("ز", new String[]{"ژ", "ز"});
        KEY_CORNER_HINTS.put("د", "ذ");
        KEY_POPUP_OPTIONS.put("د", new String[]{"ذ", "د"});

        // Punctuation & Tashkeel popups
        KEY_CORNER_HINTS.put("،", "ّ");
        KEY_POPUP_OPTIONS.put("،", new String[]{"َ", "ً", "ُ", "ٌ", "ِ", "ٍ", "ّ", "ْ", "؛", "؟"});
        KEY_CORNER_HINTS.put(".", "؟");
        KEY_POPUP_OPTIONS.put(".", new String[]{"؟", "!", "؛", ":", "/", "-", "(", ")", "%", "°", "±", "μ"});
        KEY_CORNER_HINTS.put(",", "'");
        KEY_POPUP_OPTIONS.put(",", new String[]{"'", "\"", ";", ":", "(", ")", "/", "-", "@", "#"});

        // English Row 1 hints & popups (1-0)
        KEY_CORNER_HINTS.put("q", "1");
        KEY_POPUP_OPTIONS.put("q", new String[]{"1", "%"});
        KEY_CORNER_HINTS.put("w", "2");
        KEY_POPUP_OPTIONS.put("w", new String[]{"2", "@"});
        KEY_CORNER_HINTS.put("e", "3");
        KEY_POPUP_OPTIONS.put("e", new String[]{"3", "é", "è"});
        KEY_CORNER_HINTS.put("r", "4");
        KEY_POPUP_OPTIONS.put("r", new String[]{"4", "#"});
        KEY_CORNER_HINTS.put("t", "5");
        KEY_POPUP_OPTIONS.put("t", new String[]{"5", "$"});
        KEY_CORNER_HINTS.put("y", "6");
        KEY_POPUP_OPTIONS.put("y", new String[]{"6", "^"});
        KEY_CORNER_HINTS.put("u", "7");
        KEY_POPUP_OPTIONS.put("u", new String[]{"7", "μ", "&"});
        KEY_CORNER_HINTS.put("i", "8");
        KEY_POPUP_OPTIONS.put("i", new String[]{"8", "*"});
        KEY_CORNER_HINTS.put("o", "9");
        KEY_POPUP_OPTIONS.put("o", new String[]{"9", "°", "("});
        KEY_CORNER_HINTS.put("p", "0");
        KEY_POPUP_OPTIONS.put("p", new String[]{"0", "±", ")"});
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
        rootContainer = new FrameLayout(this);
        rootContainer.setLayoutDirection(View.LAYOUT_DIRECTION_LTR);
        rootContainer.setBackgroundColor(Color.parseColor("#111827"));

        keyboardBody = new LinearLayout(this);
        keyboardBody.setOrientation(LinearLayout.VERTICAL);
        keyboardBody.setLayoutDirection(View.LAYOUT_DIRECTION_LTR);
        keyboardBody.setBackgroundColor(Color.parseColor("#111827"));

        int initialBottomPad = computeSafeNavigationBarPadding(null);
        keyboardBody.setPadding(dp(3), dp(4), dp(3), initialBottomPad);

        rootContainer.addView(keyboardBody, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        ));

        popupOverlayContainer = new FrameLayout(this);
        popupOverlayContainer.setVisibility(View.GONE);
        rootContainer.addView(popupOverlayContainer, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));

        // Listen for Android 15/16 (targetSdk 36) WindowInsets so navigation bar never covers bottom keys
        rootContainer.setOnApplyWindowInsetsListener((v, insets) -> {
            int bottomPad = computeSafeNavigationBarPadding(insets);
            keyboardBody.setPadding(dp(3), dp(4), dp(3), bottomPad);
            return insets;
        });

        styleImeNavigationBar();
        renderKeyboard();
        return rootContainer;
    }

    private void styleImeNavigationBar() {
        try {
            Dialog imeDialog = getWindow();
            Window win = imeDialog != null ? imeDialog.getWindow() : null;
            if (win != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                win.setNavigationBarColor(Color.parseColor("#111827"));
            }
        } catch (Exception ignored) {
        }
    }

    /**
     * Computes bottom padding so the keyboard sits cleanly above the Android system navigation bar
     * (3-button or gesture bar) on Android 10-16 (including targetSdk 36 edge-to-edge enforcement).
     */
    private int computeSafeNavigationBarPadding(WindowInsets insets) {
        int navInset = 0;
        try {
            if (insets != null) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    Insets sys = insets.getInsets(
                            WindowInsets.Type.navigationBars() | WindowInsets.Type.systemBars()
                    );
                    navInset = sys.bottom;
                } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    navInset = insets.getSystemWindowInsetBottom();
                }
            }
            if (navInset <= 0 && rootContainer != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                WindowInsets rootInsets = rootContainer.getRootWindowInsets();
                if (rootInsets != null) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                        navInset = rootInsets.getInsets(
                                WindowInsets.Type.navigationBars() | WindowInsets.Type.systemBars()
                        ).bottom;
                    } else {
                        navInset = rootInsets.getSystemWindowInsetBottom();
                    }
                }
            }
        } catch (Exception ignored) {
        }

        // Fallback on Android 15+ (API 35+) where edge-to-edge is enforced before first inset pass
        if (navInset <= 0) {
            try {
                int resId = getResources().getIdentifier("navigation_bar_height", "dimen", "android");
                if (resId > 0) {
                    int sysNav = getResources().getDimensionPixelSize(resId);
                    if (sysNav > 0) {
                        navInset = sysNav;
                    }
                }
            } catch (Exception ignored) {
            }
        }

        if (navInset <= 0) {
            navInset = dp(42);
        }
        return navInset + dp(4);
    }

    @Override
    public void onStartInput(EditorInfo attribute, boolean restarting) {
        super.onStartInput(attribute, restarting);
        dismissPopupOverlay();
        inspectClipboardForPopup();
        if (keyboardBody != null) {
            renderKeyboard();
        }
    }

    @Override
    public void onWindowShown() {
        super.onWindowShown();
        styleImeNavigationBar();
        if (keyboardBody != null && rootContainer != null) {
            int bottomPad = computeSafeNavigationBarPadding(rootContainer.getRootWindowInsets());
            keyboardBody.setPadding(dp(3), dp(4), dp(3), bottomPad);
        }
        inspectClipboardForPopup();
        refreshSuggestionsStrip();
    }

    @Override
    public void onUpdateSelection(int oldSelStart, int oldSelEnd, int newSelStart, int newSelEnd,
                                  int candidatesStart, int candidatesEnd) {
        super.onUpdateSelection(oldSelStart, oldSelEnd, newSelStart, newSelEnd, candidatesStart, candidatesEnd);
        refreshSuggestionsStrip();
    }

    @Override
    public void onDestroy() {
        repeatHandler.removeCallbacks(backspaceRepeatRunnable);
        repeatHandler.removeCallbacks(debouncedSuggestionsRunnable);
        if (clipboard != null) {
            try {
                clipboard.removePrimaryClipChangedListener(clipListener);
            } catch (Exception ignored) {
            }
        }
        UMEDTDictionaryPopupEngine.dismissFloatingCard();
        super.onDestroy();
    }

    // ========================================================================
    // KEYBOARD RENDERER (1 Slim 36dp Header + 4 Uniform 42dp Key Rows)
    // ========================================================================

    private void renderKeyboard() {
        if (keyboardBody == null) return;
        keyboardBody.removeAllViews();

        // 1. SINGLE SLIM SMART HEADER (36dp):
        //    [⊞ أدوات] [ّ تشكيل] [⚕️ وحدات] | [Live Dictionary Suggestions / Clipboard Match] | [⌄]
        LinearLayout headerBar = new LinearLayout(this);
        headerBar.setOrientation(LinearLayout.HORIZONTAL);
        headerBar.setLayoutDirection(View.LAYOUT_DIRECTION_LTR);
        headerBar.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout.LayoutParams headerParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(36)
        );
        headerParams.bottomMargin = dp(4);
        headerBar.setLayoutParams(headerParams);

        // Popup Tools Button (⊞) — Paste, Speak, Cursor Arrows, Clipboard Translate, Switch IME
        TextView toolsBtn = createHeaderIconButton(
                "⊞",
                POPUP_TOOLS.equals(activePopupType) ? "#059669" : "#1F2937",
                "#34D399"
        );
        toolsBtn.setOnClickListener(v -> {
            v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
            if (POPUP_TOOLS.equals(activePopupType)) {
                dismissPopupOverlay();
            } else {
                showToolsPopupOverlay();
            }
        });
        headerBar.addView(toolsBtn);

        // Popup Tashkeel & Hamzas Button (ّ)
        TextView tashkeelBtn = createHeaderIconButton(
                "ّ أ",
                POPUP_TASHKEEL.equals(activePopupType) ? "#059669" : "#1F2937",
                "#FDE68A"
        );
        tashkeelBtn.setOnClickListener(v -> {
            v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
            if (POPUP_TASHKEEL.equals(activePopupType)) {
                dismissPopupOverlay();
            } else {
                showPresetPopupOverlay(
                        POPUP_TASHKEEL,
                        "التشكيل والهمزات والأرقام",
                        new String[]{"أ", "إ", "آ", "لأ", "لإ", "لآ", "ء", "ئ", "ؤ", "َ", "ً", "ُ", "ٌ", "ِ", "ٍ", "ّ", "ْ", "ـ"}
                );
            }
        });
        headerBar.addView(tashkeelBtn);

        // Popup Medical Units & Symbols Button (⚕️)
        TextView medBtn = createHeaderIconButton(
                "⚕️",
                POPUP_MEDICAL.equals(activePopupType) ? "#059669" : "#1F2937",
                "#38BDF8"
        );
        medBtn.setOnClickListener(v -> {
            v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
            if (POPUP_MEDICAL.equals(activePopupType)) {
                dismissPopupOverlay();
            } else {
                showPresetPopupOverlay(
                        POPUP_MEDICAL,
                        "الوحدات والرموز الطبية السريعة",
                        new String[]{"mg", "mL", "mmHg", "°C", "μg", "mmol/L", "g/dL", "bpm", "IV", "PO", "IM", "±", "≤", "≥", "°", "μ", "%", "‰"}
                );
            }
        });
        headerBar.addView(medBtn);

        // Center Scrollable Suggestions & Instant Clipboard Match Bar
        HorizontalScrollView suggestionScroll = new HorizontalScrollView(this);
        suggestionScroll.setHorizontalScrollBarEnabled(false);
        LinearLayout.LayoutParams scrollParams = new LinearLayout.LayoutParams(
                0,
                ViewGroup.LayoutParams.MATCH_PARENT,
                1f
        );
        scrollParams.setMargins(dp(3), 0, dp(3), 0);
        suggestionScroll.setLayoutParams(scrollParams);

        suggestionsContainer = new LinearLayout(this);
        suggestionsContainer.setOrientation(LinearLayout.HORIZONTAL);
        suggestionsContainer.setGravity(Gravity.CENTER_VERTICAL);
        suggestionScroll.addView(suggestionsContainer);
        headerBar.addView(suggestionScroll);

        // Hide Keyboard Button (⌄)
        TextView hideBtn = createHeaderIconButton("⌄", "#1F2937", "#94A3B8");
        hideBtn.setOnClickListener(v -> {
            v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
            dismissPopupOverlay();
            requestHideSelf(0);
        });
        headerBar.addView(hideBtn);

        keyboardBody.addView(headerBar);
        refreshSuggestionsStrip();

        // 2. 4 UNIFORM KEYBOARD ROWS (42dp each)
        String[][] rows = getActiveRows();
        for (int r = 0; r < rows.length; r++) {
            String[] row = rows[r];
            boolean isBottomRow = (r == rows.length - 1);
            LinearLayout rowLayout = new LinearLayout(this);
            rowLayout.setOrientation(LinearLayout.HORIZONTAL);
            rowLayout.setLayoutDirection(View.LAYOUT_DIRECTION_LTR);
            rowLayout.setGravity(Gravity.CENTER);

            LinearLayout.LayoutParams rowParams = new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    dp(isBottomRow ? 44 : 42)
            );
            rowParams.bottomMargin = dp(isBottomRow ? 2 : 4);
            rowLayout.setLayoutParams(rowParams);

            // Add subtle side padding on 9-key English row 2 ("a..l") just like Gboard
            if (!arabicLayout && symbolMode == MODE_LETTERS && r == 1) {
                rowLayout.setPadding(dp(14), 0, dp(14), 0);
            }

            for (String key : row) {
                rowLayout.addView(createKeyView(key, isBottomRow));
            }
            keyboardBody.addView(rowLayout);
        }
    }

    private String[][] getActiveRows() {
        if (symbolMode == MODE_SYMBOLS_1) {
            return SYM_ROWS_1;
        }
        if (symbolMode == MODE_SYMBOLS_2) {
            return SYM_ROWS_2;
        }
        return arabicLayout ? AR_ROWS : EN_ROWS;
    }

    private TextView createHeaderIconButton(String text, String bgHex, String fgHex) {
        TextView btn = new TextView(this);
        btn.setText(text);
        btn.setTextColor(Color.parseColor(fgHex));
        btn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f);
        btn.setTypeface(Typeface.DEFAULT_BOLD);
        btn.setGravity(Gravity.CENTER);
        btn.setSingleLine(true);
        btn.setPadding(dp(8), 0, dp(8), 0);

        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.parseColor(bgHex));
        bg.setCornerRadius(dp(7));
        bg.setStroke(dp(1), Color.parseColor("#374151"));
        btn.setBackground(bg);

        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                dp(32)
        );
        lp.setMargins(dp(2), 0, dp(2), 0);
        btn.setLayoutParams(lp);
        return btn;
    }

    private void refreshSuggestionsStrip() {
        if (suggestionsContainer == null) return;
        suggestionsContainer.removeAllViews();

        // 1. If clipboard has a matched dictionary term, show a glowing 1-tap floating translation chip first
        final JSONObject clipMatched = UMEDTDictionaryPopupEngine.peekClipboardMatchedTerm(this);
        if (clipMatched != null) {
            String term = clipMatched.optString("term", "");
            String trans = clipMatched.optString("translation", "");
            TextView clipChip = createSuggestionChip(
                    "⚡ " + term + " ← " + trans,
                    "#064E3B",
                    "#A7F3D0",
                    "#10B981"
            );
            clipChip.setOnClickListener(v -> {
                v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
                UMEDTDictionaryPopupEngine.showFloatingCard(getApplicationContext(), clipMatched, true);
            });
            suggestionsContainer.addView(clipChip);
        }

        // 2. Live dictionary autocomplete suggestions while typing
        final String currentWord = getCurrentWordBeforeCursor();
        if (currentWord.length() >= 2) {
            List<JSONObject> suggestions = UMEDTDictionaryPopupEngine.findSuggestions(this, currentWord, 4);
            for (final JSONObject item : suggestions) {
                final String termEn = item.optString("term", "");
                final String transAr = item.optString("translation", "");
                TextView chip = createSuggestionChip(
                        "📖 " + termEn + " · " + transAr,
                        "#1E293B",
                        "#F8FAFC",
                        "#10B981"
                );
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
                suggestionsContainer.addView(chip);
            }
            if (!suggestions.isEmpty()) {
                return;
            }
        }

        // 3. Quick 1-tap utility chips when idle (Paste, Speak, Translate Copied, Numbers)
        TextView pasteChip = createSuggestionChip("📋 لصق", "#1F2937", "#E2E8F0", "#374151");
        pasteChip.setOnClickListener(v -> {
            v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
            pasteFromClipboard();
        });
        suggestionsContainer.addView(pasteChip);

        TextView speakChip = createSuggestionChip("🔊 نطق", "#1F2937", "#34D399", "#374151");
        speakChip.setOnClickListener(v -> {
            v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
            speakCurrentOrCopiedWord();
        });
        suggestionsContainer.addView(speakChip);

        if (clipMatched == null) {
            int count = UMEDTDictionaryPopupEngine.getSyncedTermsCount(this);
            TextView dictChip = createSuggestionChip(
                    "📖 القاموس (" + count + ")",
                    "#1F2937",
                    "#93C5FD",
                    "#374151"
            );
            dictChip.setOnClickListener(v -> {
                v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
                JSONObject matched = UMEDTDictionaryPopupEngine.inspectClipboardAndShowIfMatched(this, true);
                if (matched == null) {
                    String rawClip = UMEDTDictionaryPopupEngine.getCurrentClipboardText(this);
                    if (rawClip.isEmpty()) {
                        Toast.makeText(this, "انسخ أي مصطلح طبي لإظهار بطاقة ترجمته الفورية", Toast.LENGTH_SHORT).show();
                    } else {
                        Toast.makeText(this, "«" + rawClip + "» غير موجود في القاموس المحلي", Toast.LENGTH_SHORT).show();
                    }
                }
            });
            suggestionsContainer.addView(dictChip);
        }
    }

    private TextView createSuggestionChip(String text, String bgHex, String fgHex, String strokeHex) {
        TextView chip = new TextView(this);
        chip.setText(text);
        chip.setTextColor(Color.parseColor(fgHex));
        chip.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11.5f);
        chip.setTypeface(Typeface.DEFAULT_BOLD);
        chip.setSingleLine(true);
        chip.setEllipsize(TextUtils.TruncateAt.END);
        chip.setGravity(Gravity.CENTER_VERTICAL);
        chip.setPadding(dp(9), 0, dp(9), 0);

        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.parseColor(bgHex));
        bg.setCornerRadius(dp(7));
        bg.setStroke(dp(1), Color.parseColor(strokeHex));
        chip.setBackground(bg);

        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                dp(30)
        );
        lp.setMargins(dp(2), 0, dp(2), 0);
        chip.setLayoutParams(lp);
        return chip;
    }

    // ========================================================================
    // INDIVIDUAL KEY BUILDER (With Corner Popup Hint + Reliable Touch/Click)
    // ========================================================================

    private View createKeyView(final String label, final boolean isBottomRow) {
        final FrameLayout keyFrame = new FrameLayout(this);
        keyFrame.setClickable(true);
        keyFrame.setFocusable(false);

        final String normalBgColor = resolveKeyBackgroundColor(label);
        final String pressedBgColor = "⌫".equals(label) ? "#DC2626" : "#10B981";

        final GradientDrawable keyBg = new GradientDrawable();
        keyBg.setColor(Color.parseColor(normalBgColor));
        keyBg.setCornerRadius(dp(6));
        keyBg.setStroke(dp(1), Color.parseColor("#334155"));
        keyFrame.setBackground(keyBg);

        // Main center label (Strictly single-line so keys NEVER wrap or stretch!)
        final TextView mainText = new TextView(this);
        mainText.setText(resolveDisplayLabel(label));
        mainText.setGravity(Gravity.CENTER);
        mainText.setSingleLine(true);
        mainText.setEllipsize(TextUtils.TruncateAt.END);
        mainText.setTextColor(Color.WHITE);
        mainText.setTypeface(Typeface.DEFAULT_BOLD);

        float textSizeSp = 16.5f;
        if ("SPACE".equals(label)) {
            textSizeSp = 13f;
            mainText.setTextColor(Color.parseColor("#CBD5E1"));
        } else if ("?123".equals(label) || "ABC".equals(label) || "=\\<".equals(label) || "LANG".equals(label)) {
            textSizeSp = 12.5f;
        } else if ("لا".equals(label)) {
            textSizeSp = 15f;
        }
        mainText.setTextSize(TypedValue.COMPLEX_UNIT_SP, textSizeSp);

        keyFrame.addView(mainText, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
                Gravity.CENTER
        ));

        // Top-right corner hint badge for popup options (just like Gboard / Samsung)
        String hint = (symbolMode == MODE_LETTERS) ? KEY_CORNER_HINTS.get(label) : null;
        if (hint != null && !hint.isEmpty()) {
            TextView hintView = new TextView(this);
            hintView.setText(hint);
            hintView.setTextColor(Color.parseColor("#94A3B8"));
            hintView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 8.5f);
            hintView.setSingleLine(true);
            hintView.setPadding(0, dp(2), dp(4), 0);
            FrameLayout.LayoutParams hintLp = new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    Gravity.TOP | Gravity.END
            );
            keyFrame.addView(hintView, hintLp);
        }

        float weight = 1f;
        if ("SPACE".equals(label)) {
            weight = 3.9f;
        } else if ("⌫".equals(label)) {
            weight = arabicLayout && symbolMode == MODE_LETTERS ? 1.35f : 1.45f;
        } else if ("⏎".equals(label)) {
            weight = 1.4f;
        } else if ("⇧".equals(label)) {
            weight = 1.45f;
        } else if ("?123".equals(label) || "ABC".equals(label) || "=\\<".equals(label)) {
            weight = 1.25f;
        } else if ("LANG".equals(label)) {
            weight = 1.1f;
        } else if (isBottomRow && (",".equals(label) || "،".equals(label) || ".".equals(label))) {
            weight = 0.95f;
        }

        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                0,
                ViewGroup.LayoutParams.MATCH_PARENT,
                weight
        );
        params.setMargins(dp(2), 0, dp(2), 0);
        keyFrame.setLayoutParams(params);

        // ====================================================================
        // RELIABLE BACKSPACE (⌫) HANDLER: Single Tap + Continuous Hold Repeat
        // ====================================================================
        if ("⌫".equals(label)) {
            keyFrame.setOnTouchListener((v, event) -> {
                int action = event.getActionMasked();
                if (action == MotionEvent.ACTION_DOWN) {
                    v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
                    keyBg.setColor(Color.parseColor(pressedBgColor));
                    backspaceHoldTicks = 0;
                    backspaceRepeating = false;
                    // Perform immediate deletion on touch down for zero-latency responsiveness
                    performBackspace(false);
                    repeatHandler.removeCallbacks(backspaceRepeatRunnable);
                    repeatHandler.postDelayed(backspaceRepeatRunnable, 350L);
                    return true;
                } else if (action == MotionEvent.ACTION_UP || action == MotionEvent.ACTION_CANCEL) {
                    repeatHandler.removeCallbacks(backspaceRepeatRunnable);
                    backspaceRepeating = false;
                    keyBg.setColor(Color.parseColor(normalBgColor));
                    return true;
                }
                return false;
            });
            // Fallback click listener in case accessibility or OEM synthetic click triggers onClick
            keyFrame.setOnClickListener(v -> {
                if (!backspaceRepeating) {
                    performBackspace(false);
                }
            });
            return keyFrame;
        }

        // Visual press highlight for all standard keys
        keyFrame.setOnTouchListener((v, event) -> {
            int action = event.getActionMasked();
            if (action == MotionEvent.ACTION_DOWN) {
                v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
                keyBg.setColor(Color.parseColor(pressedBgColor));
            } else if (action == MotionEvent.ACTION_UP || action == MotionEvent.ACTION_CANCEL) {
                keyBg.setColor(Color.parseColor(normalBgColor));
            }
            return false;
        });

        keyFrame.setOnClickListener(v -> {
            dismissPopupOverlay();
            handleKeyPress(label);
        });

        // ====================================================================
        // LONG-PRESS POPUP KEYS (الأزرار المنبثقة)
        // ====================================================================
        keyFrame.setOnLongClickListener(v -> {
            v.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS);
            keyBg.setColor(Color.parseColor(normalBgColor));

            if ("⇧".equals(label)) {
                capsLockActive = !capsLockActive;
                shiftActive = capsLockActive;
                renderKeyboard();
                return true;
            }
            if ("LANG".equals(label) || "SPACE".equals(label)) {
                switchKeyboardMethod(true);
                return true;
            }

            String[] popupOpts = KEY_POPUP_OPTIONS.get(label);
            if (popupOpts != null && popupOpts.length > 0) {
                if (popupOpts.length == 1) {
                    commitString(popupOpts[0]);
                } else {
                    showKeyAlternatePopupOverlay(label, popupOpts);
                }
                return true;
            }

            if (label.length() == 1 && Character.isLetter(label.charAt(0))) {
                commitString(label.toUpperCase(Locale.ROOT));
                return true;
            }
            return false;
        });

        return keyFrame;
    }

    // ========================================================================
    // FLOATING POPUP OVERLAY SYSTEM (الأزرار المنبثقة للأحرف والتشكيل والأدوات)
    // ========================================================================

    private void showKeyAlternatePopupOverlay(String baseKey, String[] options) {
        showPresetPopupOverlay(
                POPUP_KEY_ALT,
                "خيارات الزر «" + baseKey + "» المنبثقة",
                options
        );
    }

    private void showPresetPopupOverlay(String popupType, String title, String[] options) {
        if (popupOverlayContainer == null) return;
        activePopupType = popupType;
        activePopupTitle = title;
        activePopupOptions = options;

        popupOverlayContainer.removeAllViews();
        popupOverlayContainer.setVisibility(View.VISIBLE);

        // Semi-transparent dismiss backdrop covering the keyboard
        FrameLayout backdrop = new FrameLayout(this);
        backdrop.setBackgroundColor(Color.parseColor("#B3090D16"));
        backdrop.setClickable(true);
        backdrop.setOnClickListener(v -> dismissPopupOverlay());

        // Elevated Popup Card centered near the top of the keyboard
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        card.setClickable(true);
        card.setPadding(dp(10), dp(8), dp(10), dp(10));

        GradientDrawable cardBg = new GradientDrawable();
        cardBg.setColor(Color.parseColor("#1E293B"));
        cardBg.setCornerRadius(dp(14));
        cardBg.setStroke(dp(2), Color.parseColor("#10B981"));
        card.setBackground(cardBg);

        // Header Row inside Popup Card
        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.setPadding(dp(2), 0, dp(2), dp(6));

        TextView titleView = new TextView(this);
        titleView.setText(activePopupTitle);
        titleView.setTextColor(Color.parseColor("#A7F3D0"));
        titleView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11.5f);
        titleView.setTypeface(Typeface.DEFAULT_BOLD);
        header.addView(titleView, new LinearLayout.LayoutParams(
                0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f
        ));

        TextView closeBtn = new TextView(this);
        closeBtn.setText("✕ إغلاق");
        closeBtn.setTextColor(Color.parseColor("#F8FAFC"));
        closeBtn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f);
        closeBtn.setTypeface(Typeface.DEFAULT_BOLD);
        closeBtn.setPadding(dp(8), dp(3), dp(8), dp(3));
        GradientDrawable closeBg = new GradientDrawable();
        closeBg.setColor(Color.parseColor("#334155"));
        closeBg.setCornerRadius(dp(8));
        closeBtn.setBackground(closeBg);
        closeBtn.setOnClickListener(v -> dismissPopupOverlay());
        header.addView(closeBtn);
        card.addView(header);

        // Multi-row grid of popup option buttons (up to 6 buttons per row)
        int perRow = Math.min(6, Math.max(4, activePopupOptions.length));
        LinearLayout currentRow = null;
        for (int i = 0; i < activePopupOptions.length; i++) {
            if (i % perRow == 0) {
                currentRow = new LinearLayout(this);
                currentRow.setOrientation(LinearLayout.HORIZONTAL);
                currentRow.setLayoutDirection(View.LAYOUT_DIRECTION_LTR);
                currentRow.setGravity(Gravity.CENTER);
                LinearLayout.LayoutParams rp = new LinearLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        dp(40)
                );
                rp.topMargin = dp(4);
                currentRow.setLayoutParams(rp);
                card.addView(currentRow);
            }
            final String opt = activePopupOptions[i];
            TextView optBtn = new TextView(this);
            optBtn.setText(opt);
            optBtn.setTextColor(Color.WHITE);
            optBtn.setTextSize(TypedValue.COMPLEX_UNIT_SP, opt.length() > 3 ? 12f : 16f);
            optBtn.setTypeface(Typeface.DEFAULT_BOLD);
            optBtn.setGravity(Gravity.CENTER);
            optBtn.setSingleLine(true);

            GradientDrawable optBg = new GradientDrawable();
            optBg.setColor(Color.parseColor("#0F172A"));
            optBg.setCornerRadius(dp(8));
            optBg.setStroke(dp(1), Color.parseColor("#10B981"));
            optBtn.setBackground(optBg);

            optBtn.setOnClickListener(v -> {
                v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
                String toCommit = (opt.length() > 1 && isAsciiLettersOrUnits(opt)) ? (opt + " ") : opt;
                commitString(toCommit);
                dismissPopupOverlay();
            });

            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                    0,
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    1f
            );
            lp.setMargins(dp(3), 0, dp(3), 0);
            optBtn.setLayoutParams(lp);
            if (currentRow != null) {
                currentRow.addView(optBtn);
            }
        }

        FrameLayout.LayoutParams cardParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.TOP
        );
        cardParams.setMargins(dp(8), dp(38), dp(8), dp(8));
        backdrop.addView(card, cardParams);
        popupOverlayContainer.addView(backdrop, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));
    }

    private void showToolsPopupOverlay() {
        if (popupOverlayContainer == null) return;
        activePopupType = POPUP_TOOLS;
        popupOverlayContainer.removeAllViews();
        popupOverlayContainer.setVisibility(View.VISIBLE);

        FrameLayout backdrop = new FrameLayout(this);
        backdrop.setBackgroundColor(Color.parseColor("#B3090D16"));
        backdrop.setClickable(true);
        backdrop.setOnClickListener(v -> dismissPopupOverlay());

        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        card.setClickable(true);
        card.setPadding(dp(10), dp(8), dp(10), dp(10));

        GradientDrawable cardBg = new GradientDrawable();
        cardBg.setColor(Color.parseColor("#1E293B"));
        cardBg.setCornerRadius(dp(14));
        cardBg.setStroke(dp(2), Color.parseColor("#10B981"));
        card.setBackground(cardBg);

        // Header
        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.setPadding(dp(2), 0, dp(2), dp(6));

        TextView titleView = new TextView(this);
        titleView.setText("أدوات لوحة مفاتيح UMEDT المنبثقة");
        titleView.setTextColor(Color.parseColor("#A7F3D0"));
        titleView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11.5f);
        titleView.setTypeface(Typeface.DEFAULT_BOLD);
        header.addView(titleView, new LinearLayout.LayoutParams(
                0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f
        ));

        TextView closeBtn = new TextView(this);
        closeBtn.setText("✕ إغلاق");
        closeBtn.setTextColor(Color.WHITE);
        closeBtn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f);
        closeBtn.setTypeface(Typeface.DEFAULT_BOLD);
        closeBtn.setPadding(dp(8), dp(3), dp(8), dp(3));
        GradientDrawable closeBg = new GradientDrawable();
        closeBg.setColor(Color.parseColor("#334155"));
        closeBg.setCornerRadius(dp(8));
        closeBtn.setBackground(closeBg);
        closeBtn.setOnClickListener(v -> dismissPopupOverlay());
        header.addView(closeBtn);
        card.addView(header);

        // Row 1: Action Tools (Paste, Speak, Translate Clipboard, Switch System Keyboard)
        LinearLayout row1 = new LinearLayout(this);
        row1.setOrientation(LinearLayout.HORIZONTAL);
        row1.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams r1p = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(38)
        );
        r1p.bottomMargin = dp(6);
        row1.setLayoutParams(r1p);

        row1.addView(createToolActionButton("📋 لصق", "#0F172A", "#E2E8F0", () -> {
            pasteFromClipboard();
            dismissPopupOverlay();
        }));
        row1.addView(createToolActionButton("🔊 نطق", "#0F172A", "#34D399", () -> {
            speakCurrentOrCopiedWord();
            dismissPopupOverlay();
        }));
        row1.addView(createToolActionButton("⚡ ترجمة المنسوخ", "#064E3B", "#A7F3D0", () -> {
            dismissPopupOverlay();
            JSONObject matched = UMEDTDictionaryPopupEngine.inspectClipboardAndShowIfMatched(this, true);
            if (matched == null) {
                Toast.makeText(this, "انسخ أي مصطلح طبي لعرض بطاقة ترجمته الفورية", Toast.LENGTH_SHORT).show();
            }
        }));
        card.addView(row1);

        // Row 2: Cursor Navigation & System Keyboard Picker
        LinearLayout row2 = new LinearLayout(this);
        row2.setOrientation(LinearLayout.HORIZONTAL);
        row2.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams r2p = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(38)
        );
        row2.setLayoutParams(r2p);

        row2.addView(createToolActionButton("▶ مؤشر يمين", "#0F172A", "#CBD5E1", () -> moveCursor(1)));
        row2.addView(createToolActionButton("◀ مؤشر يسار", "#0F172A", "#CBD5E1", () -> moveCursor(-1)));
        row2.addView(createToolActionButton("🌐 تغيير الكيبورد", "#0F172A", "#38BDF8", () -> {
            dismissPopupOverlay();
            switchKeyboardMethod(true);
        }));
        card.addView(row2);

        FrameLayout.LayoutParams cardParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.TOP
        );
        cardParams.setMargins(dp(8), dp(38), dp(8), dp(8));
        backdrop.addView(card, cardParams);
        popupOverlayContainer.addView(backdrop, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));
    }

    private View createToolActionButton(String label, String bgHex, String fgHex, final Runnable action) {
        TextView btn = new TextView(this);
        btn.setText(label);
        btn.setTextColor(Color.parseColor(fgHex));
        btn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11.5f);
        btn.setTypeface(Typeface.DEFAULT_BOLD);
        btn.setGravity(Gravity.CENTER);
        btn.setSingleLine(true);

        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.parseColor(bgHex));
        bg.setCornerRadius(dp(8));
        bg.setStroke(dp(1), Color.parseColor("#334155"));
        btn.setBackground(bg);

        btn.setOnClickListener(v -> {
            v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
            action.run();
        });

        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                0, ViewGroup.LayoutParams.MATCH_PARENT, 1f
        );
        lp.setMargins(dp(3), 0, dp(3), 0);
        btn.setLayoutParams(lp);
        return btn;
    }

    private void dismissPopupOverlay() {
        activePopupType = POPUP_NONE;
        if (popupOverlayContainer != null) {
            popupOverlayContainer.removeAllViews();
            popupOverlayContainer.setVisibility(View.GONE);
        }
    }

    private static boolean isAsciiLettersOrUnits(String s) {
        if (s == null || s.isEmpty()) return false;
        char c = s.charAt(0);
        return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || s.contains("°C") || s.contains("μg");
    }

    // ========================================================================
    // KEY LABELS, COLORS & INPUT DISPATCH
    // ========================================================================

    private String resolveDisplayLabel(String label) {
        if ("SPACE".equals(label)) {
            return arabicLayout ? "العربية" : "English";
        }
        if ("LANG".equals(label)) {
            return arabicLayout ? "🌐 EN" : "🌐 AR";
        }
        if ("⇧".equals(label)) {
            return capsLockActive ? "⇪" : "⇧";
        }
        if ("⏎".equals(label)) {
            return resolveEnterKeyLabel();
        }
        if (symbolMode == MODE_LETTERS && !arabicLayout && label.length() == 1 && Character.isLetter(label.charAt(0))) {
            return (shiftActive || capsLockActive) ? label.toUpperCase(Locale.ROOT) : label.toLowerCase(Locale.ROOT);
        }
        return label;
    }

    private String resolveKeyBackgroundColor(String label) {
        if ("⏎".equals(label)) {
            return "#059669";
        }
        if ("LANG".equals(label)) {
            return "#0F766E";
        }
        if ("⇧".equals(label)) {
            if (capsLockActive) return "#059669";
            if (shiftActive) return "#0284C7";
            return "#334155";
        }
        if ("⌫".equals(label) || "?123".equals(label) || "ABC".equals(label) || "=\\<".equals(label)) {
            return "#334155";
        }
        return "#1E293B";
    }

    private void handleKeyPress(String label) {
        if ("LANG".equals(label)) {
            arabicLayout = !arabicLayout;
            symbolMode = MODE_LETTERS;
            shiftActive = false;
            capsLockActive = false;
            renderKeyboard();
            return;
        }
        if ("?123".equals(label)) {
            symbolMode = MODE_SYMBOLS_1;
            renderKeyboard();
            return;
        }
        if ("=\\<".equals(label)) {
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
            if ((now - lastShiftTapMs) < 380L) {
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
        refreshSuggestionsStrip();
    }

    private void handleSpacePress() {
        InputConnection ic = getCurrentInputConnection();
        if (ic == null) return;
        long now = System.currentTimeMillis();
        if ((now - lastSpaceTapMs) < 300L) {
            CharSequence before = ic.getTextBeforeCursor(2, 0);
            if (before != null && before.length() == 2
                    && before.charAt(1) == ' '
                    && Character.isLetterOrDigit(before.charAt(0))) {
                ic.deleteSurroundingText(1, 0);
                ic.commitText(". ", 1);
                lastSpaceTapMs = 0L;
                refreshSuggestionsStrip();
                return;
            }
        }
        lastSpaceTapMs = now;
        ic.commitText(" ", 1);
        refreshSuggestionsStrip();
    }

    private void scheduleSuggestionsRefresh() {
        repeatHandler.removeCallbacks(debouncedSuggestionsRunnable);
        repeatHandler.postDelayed(debouncedSuggestionsRunnable, 110L);
    }

    /**
     * 100% Reliable single-step Backspace across Chromium WebView (React controlled inputs, mixed RTL/LTR BiDi)
     * and native Android EditText views — never double-fires KEYCODE_DEL + deleteSurroundingText together.
     */
    private void performBackspace(boolean deleteWholeWord) {
        InputConnection ic = getCurrentInputConnection();
        if (ic == null) return;

        try {
            // 1. If text is currently highlighted/selected, clear the selection immediately
            CharSequence selected = ic.getSelectedText(0);
            if (!TextUtils.isEmpty(selected)) {
                ic.commitText("", 1);
                scheduleSuggestionsRefresh();
                return;
            }

            // 2. Fast whole-word delete on long backspace hold
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
                    if (count > 1 && ic.deleteSurroundingText(count, 0)) {
                        scheduleSuggestionsRefresh();
                        return;
                    }
                }
            }

            // 3. Primary reliable deletion: deleteSurroundingTextInCodePoints (API 24+, handles Arabic/Latin/Emoji cleanly)
            CharSequence before = ic.getTextBeforeCursor(2, 0);
            if (before != null && before.length() > 0) {
                boolean deleted = false;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                    deleted = ic.deleteSurroundingTextInCodePoints(1, 0);
                } else {
                    deleted = ic.deleteSurroundingText(1, 0);
                }
                if (deleted) {
                    scheduleSuggestionsRefresh();
                    return;
                }
            }

            // 4. Fallback for editors requiring hardware key event
            sendDownUpKeyEvents(KeyEvent.KEYCODE_DEL);
        } catch (Exception ignored) {
            try {
                sendDownUpKeyEvents(KeyEvent.KEYCODE_DEL);
            } catch (Exception ignored2) {
            }
        }
        scheduleSuggestionsRefresh();
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
            boolean isMultiLine = (ei.inputType & InputType.TYPE_TEXT_FLAG_MULTI_LINE) != 0;
            int action = ei.imeOptions & EditorInfo.IME_MASK_ACTION;
            boolean noEnterAction = (ei.imeOptions & EditorInfo.IME_FLAG_NO_ENTER_ACTION) != 0;
            if (!isMultiLine && !noEnterAction
                    && action != EditorInfo.IME_ACTION_NONE
                    && action != EditorInfo.IME_ACTION_UNSPECIFIED) {
                ic.performEditorAction(action);
                // Also dispatch KEYCODE_ENTER for WebView <form> / onKeyDown('Enter') listeners
                sendDownUpKeyEvents(KeyEvent.KEYCODE_ENTER);
                return;
            }
        }
        sendDownUpKeyEvents(KeyEvent.KEYCODE_ENTER);
    }

    private void pasteFromClipboard() {
        InputConnection ic = getCurrentInputConnection();
        if (ic == null) return;
        String clipText = UMEDTDictionaryPopupEngine.getCurrentClipboardText(this);
        if (!clipText.isEmpty()) {
            ic.commitText(clipText, 1);
            refreshSuggestionsStrip();
            return;
        }
        // Fallback to native context menu paste action
        if (!ic.performContextMenuAction(android.R.id.paste)) {
            Toast.makeText(this, "الحافظة فارغة حاليًا", Toast.LENGTH_SHORT).show();
        }
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
        int keyCode = delta < 0 ? KeyEvent.KEYCODE_DPAD_LEFT : KeyEvent.KEYCODE_DPAD_RIGHT;
        sendDownUpKeyEvents(keyCode);
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
            refreshSuggestionsStrip();
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
            refreshSuggestionsStrip();
            String currentClip = UMEDTDictionaryPopupEngine.getCurrentClipboardText(this);
            if (currentClip.isEmpty() || UMEDTDictionaryPopupEngine.shouldIgnoreText(currentClip)) {
                return;
            }
            if (currentClip.equals(lastInspectedClip)) {
                return;
            }
            JSONObject matched = UMEDTDictionaryPopupEngine.findTerm(this, currentClip);
            if (matched != null) {
                lastInspectedClip = currentClip;
                UMEDTDictionaryPopupEngine.showFloatingCard(getApplicationContext(), matched, false);
            }
        } catch (Exception ignored) {
        }
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}