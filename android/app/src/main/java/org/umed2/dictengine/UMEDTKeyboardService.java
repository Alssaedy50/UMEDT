package org.umed2.dictengine;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.Typeface;
import android.inputmethodservice.InputMethodService;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.view.inputmethod.InputConnection;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.Locale;

/** UMEDT IME and offline clipboard dictionary lookup. */
public final class UMEDTKeyboardService extends InputMethodService {
    private ClipboardManager clipboard;
    private ClipboardManager.OnPrimaryClipChangedListener clipListener;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private WindowManager windowManager;
    private View floatingCard;
    private String lastClipboard = "";
    private long lastShownAt;
    private boolean arabicLayout;
    private boolean symbolsLayout;
    private boolean shifted;

    @Override public void onCreate() {
        super.onCreate();
        clipboard = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
        clipListener = () -> handler.postDelayed(this::inspectClipboard, 180L);
        if (clipboard != null) {
            try { clipboard.addPrimaryClipChangedListener(clipListener); } catch (Exception ignored) { }
        }
    }

    @Override public View onCreateInputView() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(7), dp(6), dp(7), dp(8));
        root.setBackgroundColor(Color.rgb(19, 31, 42));
        if (Build.VERSION.SDK_INT >= 21) {
            root.setOnApplyWindowInsetsListener((view, insets) -> {
                int bottom = insets.getSystemWindowInsetBottom();
                view.setPadding(dp(7), dp(6), dp(7), dp(8) + bottom);
                return insets;
            });
            root.setFitsSystemWindows(true);
        }

        LinearLayout header = new LinearLayout(this);
        header.setGravity(Gravity.CENTER_VERTICAL);
        TextView brand = new TextView(this);
        brand.setText("UMEDT  ·  Medical Keyboard");
        brand.setTextColor(Color.WHITE);
        brand.setTextSize(13);
        brand.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        header.addView(brand, new LinearLayout.LayoutParams(0, dp(36), 1));
        Button paste = keyButton("لصق");
        paste.setOnClickListener(v -> pasteClipboard());
        header.addView(paste, new LinearLayout.LayoutParams(dp(64), dp(36)));
        root.addView(header);

        if (symbolsLayout) {
            addRow(root, new String[]{"1","2","3","4","5","6","7","8","9","0"});
            addRow(root, new String[]{"@","#","$","%","&","-","+","(",")","/"});
            addRow(root, new String[]{"=","*","\"","' ",":",";","!","?","⌫"});
        } else if (arabicLayout) {
            addRow(root, new String[]{"ض","ص","ث","ق","ف","غ","ع","ه","خ","ح"});
            addRow(root, new String[]{"ش","س","ي","ب","ل","ا","ت","ن","م","ك"});
            addRow(root, new String[]{"⇧","ئ","ء","ؤ","ر","لا","ى","ة","و","ز","⌫"});
        } else {
            addRow(root, new String[]{"q","w","e","r","t","y","u","i","o","p"});
            addRow(root, new String[]{"a","s","d","f","g","h","j","k","l"});
            addRow(root, new String[]{"⇧","z","x","c","v","b","n","m","⌫"});
        }

        LinearLayout bottom = new LinearLayout(this);
        bottom.setGravity(Gravity.CENTER_VERTICAL);
        Button mode = keyButton(symbolsLayout ? "ABC" : "?123");
        mode.setOnClickListener(v -> { symbolsLayout = !symbolsLayout; shifted = false; refreshKeyboard(); });
        bottom.addView(mode, new LinearLayout.LayoutParams(dp(58), dp(44)));
        Button language = keyButton(arabicLayout ? "EN" : "عربي");
        language.setOnClickListener(v -> { arabicLayout = !arabicLayout; symbolsLayout = false; refreshKeyboard(); });
        bottom.addView(language, new LinearLayout.LayoutParams(dp(58), dp(44)));
        Button comma = keyButton(",");
        comma.setOnClickListener(v -> commit(","));
        bottom.addView(comma, new LinearLayout.LayoutParams(dp(38), dp(44)));
        Button space = keyButton("مسافة");
        space.setOnClickListener(v -> commit(" "));
        bottom.addView(space, new LinearLayout.LayoutParams(0, dp(44), 1));
        Button period = keyButton(".");
        period.setOnClickListener(v -> commit("."));
        bottom.addView(period, new LinearLayout.LayoutParams(dp(38), dp(44)));
        Button enter = keyButton("↵");
        enter.setOnClickListener(v -> {
            InputConnection ic = getCurrentInputConnection();
            if (ic != null) {
                ic.sendKeyEvent(new KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_ENTER));
                ic.sendKeyEvent(new KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_ENTER));
            }
        });
        bottom.addView(enter, new LinearLayout.LayoutParams(dp(44), dp(44)));
        root.addView(bottom);
        return root;
    }

    private void refreshKeyboard() {
        setInputView(onCreateInputView());
    }

    private void addRow(LinearLayout parent, String[] labels) {
        LinearLayout row = new LinearLayout(this);
        row.setGravity(Gravity.CENTER);
        for (String original : labels) {
            String label = (!arabicLayout && shifted && original.length() == 1
                    && Character.isLetter(original.charAt(0))) ? original.toUpperCase(Locale.ROOT) : original;
            Button button = keyButton(label);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, dp(43), 1);
            lp.setMargins(dp(2), dp(2), dp(2), dp(2));
            button.setLayoutParams(lp);
            button.setOnClickListener(v -> {
                if ("⌫".equals(original)) {
                    InputConnection ic = getCurrentInputConnection();
                    if (ic != null) {
                        if (Build.VERSION.SDK_INT >= 24) ic.deleteSurroundingTextInCodePoints(1, 0);
                        else ic.deleteSurroundingText(1, 0);
                    }
                } else if ("⇧".equals(original)) {
                    shifted = !shifted;
                    refreshKeyboard();
                } else {
                    commit(label);
                    if (shifted && !arabicLayout) { shifted = false; refreshKeyboard(); }
                }
            });
            row.addView(button);
        }
        parent.addView(row, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(47)));
    }

    private Button keyButton(String label) {
        Button button = new Button(this);
        button.setText(label);
        button.setAllCaps(false);
        button.setTextSize(14);
        button.setMinWidth(0);
        button.setMinimumWidth(0);
        button.setMinHeight(0);
        button.setMinimumHeight(0);
        button.setPadding(dp(2), 0, dp(2), 0);
        button.setTextColor(Color.WHITE);
        button.setBackgroundTintList(android.content.res.ColorStateList.valueOf(Color.rgb(48, 65, 80)));
        return button;
    }

    private void commit(String value) {
        InputConnection ic = getCurrentInputConnection();
        if (ic != null) ic.commitText(value, 1);
    }

    private void pasteClipboard() {
        try {
            if (clipboard == null || !clipboard.hasPrimaryClip()) return;
            ClipData clip = clipboard.getPrimaryClip();
            if (clip == null || clip.getItemCount() == 0) return;
            CharSequence text = clip.getItemAt(0).coerceToText(this);
            InputConnection ic = getCurrentInputConnection();
            if (text != null && ic != null) ic.commitText(text, 1);
        } catch (Exception ignored) { }
    }

    private void inspectClipboard() {
        try {
            if (clipboard == null || !clipboard.hasPrimaryClip()) return;
            ClipData clip = clipboard.getPrimaryClip();
            if (clip == null || clip.getItemCount() == 0) return;
            CharSequence raw = clip.getItemAt(0).coerceToText(this);
            if (raw == null) return;
            String copied = raw.toString().trim();
            if (copied.isEmpty() || copied.length() > 120) return;
            long now = System.currentTimeMillis();
            if (copied.equals(lastClipboard) && now - lastShownAt < 1800L) return;
            if (now - lastShownAt < 700L) return;
            JSONObject match = findTerm(copied);
            if (match == null) return;
            lastClipboard = copied;
            lastShownAt = now;
            showFloatingCard(match);
        } catch (SecurityException ignored) {
            // Clipboard access is controlled by Android and the active input method state.
        } catch (Exception ignored) { }
    }

    private JSONObject findTerm(String copied) {
        try {
            JSONArray terms = new JSONArray(getSharedPreferences("umedt_copy_dictionary", MODE_PRIVATE)
                    .getString("terms", "[]"));
            String key = normalize(copied);
            for (int i = 0; i < terms.length(); i++) {
                JSONObject item = terms.optJSONObject(i);
                if (item == null) continue;
                if (key.equals(normalize(item.optString("term")))) return item;
                JSONArray aliases = item.optJSONArray("aliases");
                if (aliases != null) for (int j = 0; j < aliases.length(); j++) {
                    if (key.equals(normalize(aliases.optString(j)))) return item;
                }
            }
        } catch (Exception ignored) { }
        return null;
    }

    private String normalize(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT)
                .replaceAll("[^\\p{L}\\p{N}]+", " ").replaceAll("\\s+", " ").trim();
    }

    private void showFloatingCard(JSONObject term) {
        if (Build.VERSION.SDK_INT >= 23 && !Settings.canDrawOverlays(this)) return;
        handler.post(() -> {
            try {
                hideFloatingCard();
                LinearLayout panel = new LinearLayout(this);
                panel.setOrientation(LinearLayout.VERTICAL);
                panel.setPadding(dp(18), dp(14), dp(18), dp(12));
                panel.setBackgroundColor(Color.rgb(19, 45, 39));
                TextView title = new TextView(this);
                title.setText(term.optString("term", ""));
                title.setTextColor(Color.WHITE);
                title.setTextSize(18);
                title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
                panel.addView(title);
                TextView translation = new TextView(this);
                translation.setText(term.optString("translation", "لا توجد ترجمة"));
                translation.setTextColor(Color.rgb(180, 245, 210));
                translation.setTextSize(16);
                panel.addView(translation);
                String definition = term.optString("definitionAr", term.optString("definitionEn", ""));
                if (!definition.isEmpty()) {
                    TextView detail = new TextView(this);
                    detail.setText(definition);
                    detail.setTextColor(Color.WHITE);
                    detail.setTextSize(13);
                    detail.setPadding(0, dp(6), 0, 0);
                    panel.addView(detail);
                }
                Button close = keyButton("إغلاق");
                close.setOnClickListener(v -> hideFloatingCard());
                panel.addView(close);
                int type = Build.VERSION.SDK_INT >= 26
                        ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                        : WindowManager.LayoutParams.TYPE_PHONE;
                WindowManager.LayoutParams params = new WindowManager.LayoutParams(
                        WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.WRAP_CONTENT,
                        type, WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                        | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
                        | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                        PixelFormat.TRANSLUCENT);
                params.gravity = Gravity.TOP | Gravity.CENTER_HORIZONTAL;
                params.y = dp(42);
                windowManager.addView(panel, params);
                floatingCard = panel;
                handler.postDelayed(hideCardRunnable, 8500L);
            } catch (Exception ignored) { }
        });
    }

    private void hideFloatingCard() {
        handler.removeCallbacks(hideCardRunnable);
        if (floatingCard != null && windowManager != null) {
            try { windowManager.removeView(floatingCard); } catch (Exception ignored) { }
            floatingCard = null;
        }
    }

    private final Runnable hideCardRunnable = () -> {
        if (floatingCard != null && windowManager != null) {
            try { windowManager.removeView(floatingCard); } catch (Exception ignored) { }
            floatingCard = null;
        }
    };

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }

    @Override public void onDestroy() {
        if (clipboard != null && clipListener != null) {
            try { clipboard.removePrimaryClipChangedListener(clipListener); } catch (Exception ignored) { }
        }
        hideFloatingCard();
        super.onDestroy();
    }
}