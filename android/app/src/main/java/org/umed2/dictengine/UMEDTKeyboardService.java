package org.umed2.dictengine;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.inputmethodservice.InputMethodService;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.InputConnection;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.content.SharedPreferences;
import android.graphics.PixelFormat;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.net.Uri;
import android.content.Intent;
import android.view.WindowManager;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.Locale;

public class UMEDTKeyboardService extends InputMethodService {
    private static final String PREFS = "umedt_keyboard";
    private static final String DICTIONARY_KEY = "dictionary_json";
    private ClipboardManager clipboard;
    private LinearLayout root;
    private LinearLayout suggestionRow;
    private boolean arabic = false;
    private boolean shifted = true;
    private String matchedTerm = "";
    private WindowManager windowManager;
    private View floatingCard;
    private final Handler overlayHandler = new Handler(Looper.getMainLooper());

    @Override public void onCreate() {
        super.onCreate();
        clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
        if (clipboard != null) clipboard.addPrimaryClipChangedListener(clipListener);
    }

    @Override public void onDestroy() {
        if (clipboard != null) clipboard.removePrimaryClipChangedListener(clipListener);
        removeFloatingCard();
        super.onDestroy();
    }

    @Override public View onCreateInputView() {
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(10), dp(10), dp(10), dp(12));
        root.setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
                new int[]{Color.rgb(12, 24, 39), Color.rgb(5, 13, 25)}));
        root.setElevation(dp(12));

        LinearLayout header = new LinearLayout(this);
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.setPadding(dp(4), 0, dp(4), dp(8));
        TextView brand = text("UMEDT", 15, Color.WHITE, true);
        brand.setLetterSpacing(.12f);
        header.addView(brand, new LinearLayout.LayoutParams(0, dp(34), 1));
        TextView language = key(arabic ? "عربي" : "EN", true);
        language.setOnClickListener(v -> { arabic = !arabic; renderKeys(); });
        header.addView(language, new LinearLayout.LayoutParams(dp(64), dp(34)));
        TextView switcher = key("⌨", true);
        switcher.setOnClickListener(v -> {
            try {
                android.view.inputmethod.InputMethodManager manager =
                        (android.view.inputmethod.InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
                if (manager != null) manager.showInputMethodPicker();
            } catch (Exception ignored) {}
        });
        LinearLayout.LayoutParams sp = new LinearLayout.LayoutParams(dp(42), dp(34));
        sp.leftMargin = dp(6); header.addView(switcher, sp);
        TextView hide = key("⌄", true);
        hide.setOnClickListener(v -> requestHideSelf(0));
        LinearLayout.LayoutParams hp = new LinearLayout.LayoutParams(dp(42), dp(34));
        hp.leftMargin = dp(6); header.addView(hide, hp);
        root.addView(header);

        suggestionRow = new LinearLayout(this);
        suggestionRow.setGravity(Gravity.CENTER_VERTICAL);
        suggestionRow.setPadding(dp(8), dp(4), dp(8), dp(4));
        suggestionRow.setBackground(round(Color.rgb(22, 43, 57), dp(12), Color.rgb(37, 75, 83)));
        root.addView(suggestionRow, new LinearLayout.LayoutParams(-1, dp(42)));
        renderKeys();
        inspectClipboard();
        return root;
    }

    @Override public void onStartInputView(android.view.inputmethod.EditorInfo info, boolean restarting) {
        super.onStartInputView(info, restarting);
        inspectClipboard();
    }

    private void renderKeys() {
        if (root == null) return;
        while (root.getChildCount() > 2) root.removeViewAt(2);
        String[][] rows = arabic
          ? new String[][]{{"ض","ص","ث","ق","ف","غ","ع","ه","خ","ح","ج"},{"ش","س","ي","ب","ل","ا","ت","ن","م","ك"},{"ئ","ء","ؤ","ر","لا","ى","ة","و","ز","ظ","د"}}
          : new String[][]{{"q","w","e","r","t","y","u","i","o","p"},{"a","s","d","f","g","h","j","k","l"},{"⇧","z","x","c","v","b","n","m","⌫"}};
        for (String[] row : rows) {
            LinearLayout line = new LinearLayout(this);
            line.setGravity(Gravity.CENTER);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, dp(48));
            lp.topMargin = dp(5); root.addView(line, lp);
            for (String label : row) {
                boolean special = label.equals("⇧") || label.equals("⌫");
                TextView button = key(label, special);
                LinearLayout.LayoutParams kp = new LinearLayout.LayoutParams(0, -1, 1f);
                kp.setMargins(dp(2), 0, dp(2), 0);
                line.addView(button, kp);
                button.setOnClickListener(v -> {
                    if (label.equals("⇧")) { shifted = !shifted; return; }
                    if (label.equals("⌫")) { InputConnection ic = getCurrentInputConnection(); if (ic != null) ic.deleteSurroundingText(1,0); return; }
                    String value = shifted && !arabic ? label.toUpperCase(Locale.ROOT) : label;
                    commit(value);
                    if (!arabic) shifted = false;
                });
            }
        }
        LinearLayout bottom = new LinearLayout(this);
        bottom.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams bp = new LinearLayout.LayoutParams(-1, dp(48));
        bp.topMargin = dp(5); root.addView(bottom, bp);
        addBottomKey(bottom, "⌫", 1, () -> {
            InputConnection ic = getCurrentInputConnection();
            if (ic != null) ic.deleteSurroundingText(1, 0);
        });
        addBottomKey(bottom, arabic ? "EN" : "عربي", 1, () -> { arabic = !arabic; renderKeys(); });
        addBottomKey(bottom, "،", 0.7f, () -> commit(arabic ? "،" : ","));
        addBottomKey(bottom, "مسافة", 3.2f, () -> commit(" "));
        addBottomKey(bottom, "↵", 1, () -> {
            InputConnection ic = getCurrentInputConnection();
            if (ic != null) ic.sendKeyEvent(new android.view.KeyEvent(android.view.KeyEvent.ACTION_DOWN, android.view.KeyEvent.KEYCODE_ENTER));
        });
    }

    private void addBottomKey(LinearLayout row, String label, float weight, Runnable action) {
        TextView v = key(label, true);
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(0, -1, weight);
        p.setMargins(dp(2),0,dp(2),0); row.addView(v,p); v.setOnClickListener(w -> action.run());
    }

    private void commit(String value) {
        InputConnection ic = getCurrentInputConnection();
        if (ic != null) ic.commitText(value, 1);
    }

    private TextView key(String label, boolean special) {
        TextView v = text(label, special ? 13 : 18, Color.WHITE, true);
        v.setGravity(Gravity.CENTER);
        v.setBackground(round(special ? Color.rgb(28, 67, 78) : Color.rgb(31, 45, 62), dp(9),
                special ? Color.rgb(47, 119, 126) : Color.rgb(51, 67, 87)));
        v.setClickable(true); v.setFocusable(true);
        return v;
    }

    private TextView text(String value, int size, int color, boolean bold) {
        TextView v = new TextView(this); v.setText(value); v.setTextSize(size);
        v.setTextColor(color); v.setTypeface(Typeface.DEFAULT, bold ? Typeface.BOLD : Typeface.NORMAL);
        return v;
    }

    private GradientDrawable round(int color, int radius, int stroke) {
        GradientDrawable d = new GradientDrawable(); d.setColor(color); d.setCornerRadius(radius);
        d.setStroke(dp(1), stroke); return d;
    }

    private int dp(float value) { return (int)(value * getResources().getDisplayMetrics().density + .5f); }

    private final ClipboardManager.OnPrimaryClipChangedListener clipListener = this::inspectClipboard;

    private void inspectClipboard() {
        if (clipboard == null || root == null) return;
        try {
            if (!clipboard.hasPrimaryClip()) return;
            ClipData clip = clipboard.getPrimaryClip();
            if (clip == null || clip.getItemCount() == 0) return;
            CharSequence raw = clip.getItemAt(0).coerceToText(this);
            if (raw == null) return;
            String candidate = raw.toString().trim();
            if (candidate.isEmpty() || candidate.length() > 180) return;
            String match = findDictionaryMatch(candidate);
            if (!match.isEmpty() && !match.equals(matchedTerm)) {
                matchedTerm = match;
                showDictionaryCard(match);
                showFloatingCard(match);
            }
        } catch (SecurityException ignored) {
        } catch (Exception ignored) {
        }
    }

    private String findDictionaryMatch(String candidate) {
        try {
            SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
            JSONArray entries = new JSONArray(prefs.getString(DICTIONARY_KEY, "[]"));
            String needle = candidate.toLowerCase(Locale.ROOT);
            for (int i=0; i<entries.length(); i++) {
                JSONObject item = entries.optJSONObject(i);
                if (item == null) continue;
                String term = item.optString("term", "").trim();
                String alias = item.optString("aliasName", "").trim();
                String translation = item.optString("translation", "").trim();
                String definition = item.optString("definitionAr", "").trim();
                if (!term.isEmpty() && (term.equalsIgnoreCase(needle) || translation.equalsIgnoreCase(needle) || alias.equalsIgnoreCase(needle))) {
                    return term + "|" + translation + "|" + definition;
                }
            }
        } catch (Exception ignored) {}
        return "";
    }


    private void showFloatingCard(String payload) {
        if (Build.VERSION.SDK_INT < 23 || !Settings.canDrawOverlays(this) || windowManager == null) return;
        overlayHandler.post(() -> {
            try {
                removeFloatingCard();
                String[] parts = payload.split("\\|", 3);
                LinearLayout card = new LinearLayout(this);
                card.setOrientation(LinearLayout.HORIZONTAL);
                card.setGravity(Gravity.CENTER_VERTICAL);
                card.setPadding(dp(16), dp(12), dp(12), dp(12));
                GradientDrawable bg = new GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT,
                        new int[]{Color.rgb(10, 37, 48), Color.rgb(15, 23, 42)});
                bg.setCornerRadius(dp(18));
                bg.setStroke(dp(1), Color.rgb(16, 185, 129));
                card.setBackground(bg);
                card.setElevation(dp(12));
                LinearLayout info = new LinearLayout(this);
                info.setOrientation(LinearLayout.VERTICAL);
                TextView title = text(parts[0], 15, Color.rgb(110, 231, 183), true);
                TextView translation = text(parts.length > 1 ? parts[1] : "مصطلح في قاموس UMEDT", 12, Color.WHITE, false);
                info.addView(title); info.addView(translation);
                card.addView(info, new LinearLayout.LayoutParams(0, -2, 1));
                TextView close = text("×", 24, Color.WHITE, true);
                close.setGravity(Gravity.CENTER);
                card.addView(close, new LinearLayout.LayoutParams(dp(36), dp(36)));
                close.setOnClickListener(v -> removeFloatingCard());
                card.setOnClickListener(v -> removeFloatingCard());
                WindowManager.LayoutParams params = new WindowManager.LayoutParams(
                        WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.WRAP_CONTENT,
                        Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                                ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                                : WindowManager.LayoutParams.TYPE_PHONE,
                        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                                | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
                                | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                        PixelFormat.TRANSLUCENT);
                params.gravity = Gravity.TOP | Gravity.CENTER_HORIZONTAL;
                params.y = dp(54);
                params.width = getResources().getDisplayMetrics().widthPixels - dp(24);
                floatingCard = card;
                windowManager.addView(floatingCard, params);
                overlayHandler.postDelayed(this::removeFloatingCard, 9000);
            } catch (Exception ignored) {
                removeFloatingCard();
            }
        });
    }

    private void removeFloatingCard() {
        try {
            if (floatingCard != null && windowManager != null) {
                windowManager.removeView(floatingCard);
                floatingCard = null;
            }
        } catch (Exception ignored) {
            floatingCard = null;
        }
    }

    private void showDictionaryCard(String payload) {
        if (suggestionRow == null) return;
        suggestionRow.removeAllViews();
        String[] parts = payload.split("\\|", 3);
        LinearLayout info = new LinearLayout(this); info.setOrientation(LinearLayout.VERTICAL);
        TextView term = text(parts[0], 13, Color.rgb(110, 231, 183), true);
        TextView translation = text(parts.length > 1 ? parts[1] : "مصطلح في قاموس UMEDT", 11, Color.WHITE, false);
        info.addView(term); info.addView(translation);
        suggestionRow.addView(info, new LinearLayout.LayoutParams(0, -2, 1));
        TextView tag = text("قاموس UMEDT  •  ✓", 10, Color.rgb(110, 231, 183), true);
        suggestionRow.addView(tag);
    }
}
