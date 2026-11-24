package org.umed2.dictengine;

import android.accessibilityservice.AccessibilityService;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.graphics.PixelFormat;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.view.accessibility.AccessibilityEvent;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Locale;

public class DictionaryAccessibilityService extends AccessibilityService {
    private ClipboardManager clipboard;
    private ClipboardManager.OnPrimaryClipChangedListener clipListener;
    private WindowManager windowManager;
    private View card;
    private String lastText = "";
    private long lastShownAt = 0L;
    private final Handler handler = new Handler(Looper.getMainLooper());

    @Override public void onServiceConnected() {
        super.onServiceConnected();
        clipboard = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
        clipListener = () -> handler.postDelayed(this::inspectClipboard, 180);
        if (clipboard != null) clipboard.addPrimaryClipChangedListener(clipListener);
    }

    @Override public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null) return;
        int type = event.getEventType();
        if (type == AccessibilityEvent.TYPE_VIEW_TEXT_SELECTION_CHANGED ||
            type == AccessibilityEvent.TYPE_VIEW_TEXT_CHANGED ||
            type == AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED ||
            type == AccessibilityEvent.TYPE_VIEW_CLICKED) {
            handler.postDelayed(this::inspectClipboard, 220);
        }
    }

    @Override public void onInterrupt() { hideCard(); }

    private void inspectClipboard() {
        try {
            if (clipboard == null || !clipboard.hasPrimaryClip()) return;
            ClipData data = clipboard.getPrimaryClip();
            if (data == null || data.getItemCount() == 0) return;
            CharSequence value = data.getItemAt(0).coerceToText(this);
            if (value == null) return;
            String copied = value.toString().trim();
            if (copied.isEmpty() || copied.length() > 100) return;
            long now = System.currentTimeMillis();
            if (copied.equals(lastText) && now - lastShownAt < 1800) return;
            JSONObject match = findTerm(copied);
            if (match != null) {
                lastText = copied;
                lastShownAt = now;
                showCard(match);
            }
        } catch (SecurityException ignored) {
            // Android may restrict background clipboard access on some OS builds.
        } catch (Exception ignored) { }
    }

    private JSONObject findTerm(String copied) {
        try {
            String key = normalize(copied);
            String rawTerms = getSharedPreferences("umedt_copy_dictionary", MODE_PRIVATE)
                    .getString("terms", "[]");
            JSONArray terms = new JSONArray(rawTerms);
            for (int i = 0; i < terms.length(); i++) {
                JSONObject term = terms.optJSONObject(i);
                if (term == null) continue;
                String name = term.optString("term", "");
                if (key.equals(normalize(name))) return term;
                JSONArray aliases = term.optJSONArray("aliases");
                if (aliases != null) for (int j = 0; j < aliases.length(); j++) {
                    if (key.equals(normalize(aliases.optString(j)))) return term;
                }
            }
        } catch (Exception ignored) { }
        return null;
    }

    private String normalize(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT)
                .replaceAll("[^\\p{L}\\p{N}]+", " ").replaceAll("\\s+", " ").trim();
    }

    private void showCard(JSONObject term) {
        handler.post(() -> {
            try {
                hideCard();
                LinearLayout panel = new LinearLayout(this);
                panel.setOrientation(LinearLayout.VERTICAL);
                panel.setPadding(28, 22, 28, 18);
                panel.setBackgroundColor(0xFF10251F);

                TextView title = new TextView(this);
                title.setText(term.optString("term", ""));
                title.setTextColor(0xFFFFFFFF);
                title.setTextSize(19);
                title.setPadding(0, 0, 0, 8);
                panel.addView(title);

                TextView translation = new TextView(this);
                translation.setText(term.optString("translation", "لا توجد ترجمة"));
                translation.setTextColor(0xFFB9F6D4);
                translation.setTextSize(16);
                panel.addView(translation);

                String definition = term.optString("definitionAr",
                        term.optString("definitionEn", ""));
                if (!definition.isEmpty()) {
                    TextView detail = new TextView(this);
                    detail.setText(definition);
                    detail.setTextColor(0xFFE5E7EB);
                    detail.setTextSize(13);
                    detail.setPadding(0, 10, 0, 4);
                    panel.addView(detail);
                }

                Button close = new Button(this);
                close.setText("إغلاق");
                close.setOnClickListener(v -> hideCard());
                panel.addView(close);

                WindowManager.LayoutParams params = new WindowManager.LayoutParams(
                        WindowManager.LayoutParams.MATCH_PARENT,
                        WindowManager.LayoutParams.WRAP_CONTENT,
                        WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
                        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE |
                                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                        PixelFormat.TRANSLUCENT);
                params.gravity = Gravity.TOP | Gravity.CENTER_HORIZONTAL;
                params.y = (int) (getResources().getDisplayMetrics().density * 48);
                windowManager.addView(panel, params);
                card = panel;
                handler.postDelayed(this::hideCard, 9000);
            } catch (Exception ignored) { }
        });
    }

    private void hideCard() {
        handler.removeCallbacksAndMessages(null);
        if (card != null && windowManager != null) {
            try { windowManager.removeView(card); } catch (Exception ignored) { }
            card = null;
        }
    }

    @Override public void onDestroy() {
        if (clipboard != null && clipListener != null) {
            try { clipboard.removePrimaryClipChangedListener(clipListener); } catch (Exception ignored) { }
        }
        hideCard();
        super.onDestroy();
    }
}
