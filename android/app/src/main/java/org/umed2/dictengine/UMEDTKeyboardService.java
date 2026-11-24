package org.umed2.dictengine;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.Typeface;
import android.inputmethodservice.InputMethodService;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.view.inputmethod.InputConnection;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.Locale;

/**
 * UMEDT native IME. The IME is the Android-authorized clipboard reader while it is
 * active as the default input method. Dictionary data is mirrored locally by the app.
 */
public final class UMEDTKeyboardService extends InputMethodService {
    private ClipboardManager clipboard;
    private ClipboardManager.OnPrimaryClipChangedListener clipListener;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private WindowManager windowManager;
    private View floatingCard;
    private String lastClipboard = "";
    private long lastShownAt;
    private boolean keyboardVisible;

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
        root.setPadding(dp(8), dp(8), dp(8), dp(10));
        root.setBackgroundColor(Color.rgb(19, 31, 42));

        LinearLayout header = new LinearLayout(this);
        header.setGravity(Gravity.CENTER_VERTICAL);
        TextView brand = new TextView(this);
        brand.setText("UMEDT  ·  Medical Keyboard");
        brand.setTextColor(Color.WHITE);
        brand.setTextSize(13);
        brand.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        header.addView(brand, new LinearLayout.LayoutParams(0, dp(38), 1));
        Button clipboardButton = keyButton("لصق");
        clipboardButton.setOnClickListener(v -> {
            try {
                if (clipboard != null && clipboard.hasPrimaryClip()) {
                    ClipData clip = clipboard.getPrimaryClip();
                    if (clip != null && clip.getItemCount() > 0) {
                        CharSequence text = clip.getItemAt(0).coerceToText(this);
                        if (text != null) {
                            InputConnection ic = getCurrentInputConnection();
                            if (ic != null) ic.commitText(text, 1);
                        }
                    }
                }
            } catch (Exception ignored) { }
        });
        header.addView(clipboardButton, new LinearLayout.LayoutParams(dp(64), dp(38)));
        root.addView(header);

        addRow(root, new String[]{"q","w","e","r","t","y","u","i","o","p"});
        addRow(root, new String[]{"a","s","d","f","g","h","j","k","l"});
        addRow(root, new String[]{"⇧","z","x","c","v","b","n","m","⌫"});
        LinearLayout bottom = new LinearLayout(this);
        Button symbols = keyButton("?123");
        symbols.setOnClickListener(v -> { });
        bottom.addView(symbols, new LinearLayout.LayoutParams(dp(58), dp(48)));
        Button comma = keyButton(",");
        comma.setOnClickListener(v -> commit(","));
        bottom.addView(comma, new LinearLayout.LayoutParams(dp(42), dp(48)));
        Button space = keyButton("English / العربية");
        space.setOnClickListener(v -> commit(" "));
        bottom.addView(space, new LinearLayout.LayoutParams(0, dp(48), 1));
        Button period = keyButton(".");
        period.setOnClickListener(v -> commit("."));
        bottom.addView(period, new LinearLayout.LayoutParams(dp(42), dp(48)));
        Button enter = keyButton("↵");
        enter.setOnClickListener(v -> {
            InputConnection ic = getCurrentInputConnection();
            if (ic != null) ic.sendKeyEvent(new android.view.KeyEvent(android.view.KeyEvent.ACTION_DOWN, android.view.KeyEvent.KEYCODE_ENTER));
        });
        bottom.addView(enter, new LinearLayout.LayoutParams(dp(48), dp(48)));
        root.addView(bottom);
        return root;
    }

    private void addRow(LinearLayout parent, String[] labels) {
        LinearLayout row = new LinearLayout(this);
        row.setGravity(Gravity.CENTER);
        for (String label : labels) {
            Button button = keyButton(label);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, dp(46), 1);
            lp.setMargins(dp(2), dp(3), dp(2), dp(3));
            button.setLayoutParams(lp);
            button.setOnClickListener(v -> {
                if ("⌫".equals(label)) {
                    InputConnection ic = getCurrentInputConnection();
                    if (ic != null) ic.deleteSurroundingText(1, 0);
                } else if (!"⇧".equals(label)) commit(label);
            });
            row.addView(button);
        }
        parent.addView(row);
    }

    private Button keyButton(String label) {
        Button button = new Button(this);
        button.setText(label);
        button.setAllCaps(false);
        button.setTextSize(15);
        button.setTextColor(Color.WHITE);
        button.setBackgroundTintList(android.content.res.ColorStateList.valueOf(Color.rgb(48, 65, 80)));
        return button;
    }

    private void commit(String value) {
        InputConnection ic = getCurrentInputConnection();
        if (ic != null) ic.commitText(value, 1);
    }

    private void inspectClipboard() {
        try {
            if (clipboard == null || !clipboard.hasPrimaryClip()) return;
            ClipData clip = clipboard.getPrimaryClip();
            if (clip == null || clip.getItemCount() == 0) return;
            CharSequence raw = clip.getItemAt(0).coerceToText(this);
            if (raw == null) return;
            String copied = raw.toString().trim();
            if (copied.isEmpty() || copied.length() > 120 || copied.equals(lastClipboard)) return;
            long now = System.currentTimeMillis();
            if (now - lastShownAt < 700) return;
            JSONObject match = findTerm(copied);
            if (match == null) return;
            lastClipboard = copied;
            lastShownAt = now;
            showFloatingCard(match);
        } catch (SecurityException ignored) {
            // Android/ROM clipboard policy can still deny access outside an active IME session.
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
        if (BuildVersion.sdk() >= 23 && !Settings.canDrawOverlays(this)) return;
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
                int type = BuildVersion.sdk() >= 26
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

    @Override public void onWindowShown() { keyboardVisible = true; super.onWindowShown(); }
    @Override public void onWindowHidden() { keyboardVisible = false; super.onWindowHidden(); }

    @Override public void onDestroy() {
        if (clipboard != null && clipListener != null) {
            try { clipboard.removePrimaryClipChangedListener(clipListener); } catch (Exception ignored) { }
        }
        hideFloatingCard();
        super.onDestroy();
    }

    private static final class BuildVersion {
        static int sdk() { return android.os.Build.VERSION.SDK_INT; }
    }
}