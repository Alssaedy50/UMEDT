package org.umed2.dictengine;

import android.content.ClipboardManager;
import android.content.Context;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.inputmethodservice.InputMethodService;
import android.os.Build;
import android.os.IBinder;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;
import android.view.inputmethod.InputMethodManager;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONObject;

/**
 * UMEDT Medical Keyboard & Instant Clipboard Dictionary Lookup Service.
 * Monitors copied text and displays the UMEDT floating translation card immediately
 * when a dictionary match is found, without opening the main UMEDT application.
 */
public class UMEDTKeyboardService extends InputMethodService {
    private boolean arabicLayout = false;
    private boolean symbolsLayout = false;
    private boolean shiftUppercase = false;
    private LinearLayout rootView;
    private TextView clipboardQuickBanner;
    private ClipboardManager clipboard;
    private String lastInspectedClip = "";

    private static final String[][] EN_ROWS = new String[][]{
            {"q", "w", "e", "r", "t", "y", "u", "i", "o", "p"},
            {"a", "s", "d", "f", "g", "h", "j", "k", "l"},
            {"⇧", "z", "x", "c", "v", "b", "n", "m", "⌫"},
            {"123", "🌐", "AR", ",", "SPACE", ".", "⏎"}
    };

    private static final String[][] AR_ROWS = new String[][]{
            {"ض", "ص", "ث", "ق", "ف", "غ", "ع", "ه", "خ", "ح", "ج"},
            {"ش", "س", "ي", "ب", "ل", "ا", "ت", "ن", "م", "ك", "ط"},
            {"ئ", "ء", "ؤ", "ر", "لا", "ى", "ة", "و", "ز", "ظ", "⌫"},
            {"123", "🌐", "EN", "،", "SPACE", ".", "⏎"}
    };

    private static final String[][] SYM_ROWS = new String[][]{
            {"1", "2", "3", "4", "5", "6", "7", "8", "9", "0"},
            {"-", "/", ":", ";", "(", ")", "%", "+", "=", "\""},
            {"ABC", ".", ",", "?", "!", "'", "[", "]", "⌫"},
            {"ABC", "🌐", "AR/EN", ",", "SPACE", ".", "⏎"}
    };

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
        rootView.setBackgroundColor(Color.parseColor("#0B1320"));
        rootView.setPadding(dp(6), dp(6), dp(6), dp(10));
        renderKeyboard();
        return rootView;
    }

    @Override
    public void onStartInput(EditorInfo attribute, boolean restarting) {
        super.onStartInput(attribute, restarting);
        inspectClipboardForPopup();
    }

    @Override
    public void onWindowShown() {
        super.onWindowShown();
        inspectClipboardForPopup();
        refreshClipboardBanner();
    }

    @Override
    public void onDestroy() {
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

        // 1. Top Smart Medical Bar: Instant Clipboard Lookup Banner + Switch Keyboard Button
        LinearLayout topBar = new LinearLayout(this);
        topBar.setOrientation(LinearLayout.HORIZONTAL);
        topBar.setGravity(Gravity.CENTER_VERTICAL);
        topBar.setPadding(dp(4), dp(2), dp(4), dp(6));

        clipboardQuickBanner = new TextView(this);
        clipboardQuickBanner.setTextColor(Color.parseColor("#A7F3D0"));
        clipboardQuickBanner.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f);
        clipboardQuickBanner.setTypeface(Typeface.DEFAULT_BOLD);
        clipboardQuickBanner.setSingleLine(true);
        clipboardQuickBanner.setEllipsize(TextUtils.TruncateAt.END);
        clipboardQuickBanner.setPadding(dp(10), dp(6), dp(10), dp(6));
        GradientDrawable bannerBg = new GradientDrawable();
        bannerBg.setColor(Color.parseColor("#064E3B"));
        bannerBg.setCornerRadius(dp(10));
        bannerBg.setStroke(dp(1), Color.parseColor("#10B981"));
        clipboardQuickBanner.setBackground(bannerBg);
        clipboardQuickBanner.setOnClickListener(v -> {
            JSONObject matched = UMEDTDictionaryPopupEngine.inspectClipboardAndShowIfMatched(this, true);
            if (matched != null) {
                refreshClipboardBanner();
            }
        });
        LinearLayout.LayoutParams bannerParams = new LinearLayout.LayoutParams(
                0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f
        );
        bannerParams.setMargins(0, 0, dp(6), 0);
        topBar.addView(clipboardQuickBanner, bannerParams);

        TextView switchImeChip = new TextView(this);
        switchImeChip.setText("🌐 الكيبورد");
        switchImeChip.setTextColor(Color.parseColor("#E2E8F0"));
        switchImeChip.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11.5f);
        switchImeChip.setTypeface(Typeface.DEFAULT_BOLD);
        switchImeChip.setPadding(dp(10), dp(6), dp(10), dp(6));
        GradientDrawable switchBg = new GradientDrawable();
        switchBg.setColor(Color.parseColor("#1E293B"));
        switchBg.setCornerRadius(dp(10));
        switchBg.setStroke(dp(1), Color.parseColor("#334155"));
        switchImeChip.setBackground(switchBg);
        switchImeChip.setOnClickListener(v -> switchKeyboardMethod());
        topBar.addView(switchImeChip);

        rootView.addView(topBar);
        refreshClipboardBanner();

        // 2. Key Rows
        String[][] rows = symbolsLayout ? SYM_ROWS : (arabicLayout ? AR_ROWS : EN_ROWS);
        for (String[] row : rows) {
            LinearLayout rowLayout = new LinearLayout(this);
            rowLayout.setOrientation(LinearLayout.HORIZONTAL);
            rowLayout.setGravity(Gravity.CENTER);
            LinearLayout.LayoutParams rowParams = new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
            );
            rowParams.bottomMargin = dp(5);
            rowLayout.setLayoutParams(rowParams);

            for (String key : row) {
                rowLayout.addView(createKeyView(key));
            }
            rootView.addView(rowLayout);
        }
    }

    private void refreshClipboardBanner() {
        if (clipboardQuickBanner == null) return;
        JSONObject matched = UMEDTDictionaryPopupEngine.peekClipboardMatchedTerm(this);
        if (matched != null) {
            String term = matched.optString("term", "");
            String trans = matched.optString("translation", "");
            clipboardQuickBanner.setText("⚡ " + term + " ← " + trans + " (اضغط للبطاقة)");
        } else {
            int count = UMEDTDictionaryPopupEngine.getSyncedTermsCount(this);
            clipboardQuickBanner.setText("📖 قاموس UMEDT جاهز (" + count + " مصطلح) · انسخ أي كلمة لترجمتها");
        }
    }

    private View createKeyView(final String label) {
        TextView keyView = new TextView(this);
        String displayLabel = label;
        if ("SPACE".equals(label)) {
            displayLabel = arabicLayout ? "مسافة · UMEDT" : "UMEDT Medical";
        } else if (!symbolsLayout && !arabicLayout && label.length() == 1 && Character.isLetter(label.charAt(0))) {
            displayLabel = shiftUppercase ? label.toUpperCase() : label.toLowerCase();
        }

        keyView.setText(displayLabel);
        keyView.setGravity(Gravity.CENTER);
        keyView.setTextColor(Color.WHITE);
        keyView.setTextSize(TypedValue.COMPLEX_UNIT_SP, "SPACE".equals(label) ? 13f : 15.5f);
        keyView.setTypeface(Typeface.DEFAULT_BOLD);

        boolean isAccentKey = "⏎".equals(label) || "AR".equals(label) || "EN".equals(label) || "AR/EN".equals(label);
        boolean isModifierKey = "⌫".equals(label) || "⇧".equals(label) || "123".equals(label) || "ABC".equals(label) || "🌐".equals(label);

        String bgColor = "#1E293B";
        if (isAccentKey) {
            bgColor = "#059669";
        } else if ("⇧".equals(label) && shiftUppercase) {
            bgColor = "#0284C7";
        } else if (isModifierKey) {
            bgColor = "#334155";
        }

        GradientDrawable keyBg = new GradientDrawable();
        keyBg.setColor(Color.parseColor(bgColor));
        keyBg.setCornerRadius(dp(8));
        keyView.setBackground(keyBg);
        keyView.setPadding(dp(4), dp(11), dp(4), dp(11));

        float weight = 1f;
        if ("SPACE".equals(label)) {
            weight = 3.6f;
        } else if ("⌫".equals(label) || "⏎".equals(label) || "⇧".equals(label) || "123".equals(label) || "ABC".equals(label)) {
            weight = 1.35f;
        }

        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                0,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                weight
        );
        params.setMargins(dp(2), 0, dp(2), 0);
        keyView.setLayoutParams(params);
        keyView.setOnClickListener(v -> handleKeyPress(label));
        return keyView;
    }

    private void handleKeyPress(String label) {
        InputConnection ic = getCurrentInputConnection();
        if ("AR".equals(label) || "EN".equals(label) || "AR/EN".equals(label)) {
            arabicLayout = !arabicLayout;
            symbolsLayout = false;
            renderKeyboard();
            return;
        }
        if ("123".equals(label)) {
            symbolsLayout = true;
            renderKeyboard();
            return;
        }
        if ("ABC".equals(label)) {
            symbolsLayout = false;
            renderKeyboard();
            return;
        }
        if ("⇧".equals(label)) {
            shiftUppercase = !shiftUppercase;
            renderKeyboard();
            return;
        }
        if ("🌐".equals(label)) {
            switchKeyboardMethod();
            return;
        }
        if (ic == null) return;

        if ("⌫".equals(label)) {
            CharSequence selected = ic.getSelectedText(0);
            if (TextUtils.isEmpty(selected)) {
                ic.deleteSurroundingText(1, 0);
            } else {
                ic.commitText("", 1);
            }
        } else if ("SPACE".equals(label)) {
            ic.commitText(" ", 1);
        } else if ("⏎".equals(label)) {
            ic.sendKeyEvent(new KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_ENTER));
            ic.sendKeyEvent(new KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_ENTER));
        } else {
            String out = label;
            if (!symbolsLayout && !arabicLayout && label.length() == 1 && Character.isLetter(label.charAt(0))) {
                out = shiftUppercase ? label.toUpperCase() : label.toLowerCase();
                if (shiftUppercase) {
                    shiftUppercase = false;
                    renderKeyboard();
                }
            }
            ic.commitText(out, 1);
        }
    }

    private void switchKeyboardMethod() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                boolean switched = switchToPreviousInputMethod();
                if (switched) return;
            }
            InputMethodManager imm = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
            if (imm != null) {
                IBinder token = getWindow() != null && getWindow().getWindow() != null
                        ? getWindow().getWindow().getAttributes().token
                        : null;
                if (token != null) {
                    imm.switchToLastInputMethod(token);
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