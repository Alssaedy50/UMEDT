package org.umed2.dictengine;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.Toast;

import org.json.JSONObject;

/**
 * Lightweight, zero-WebView translucent Activity that displays the UMEDT floating dictionary
 * translation card directly over whatever app the user is currently using (PDF reader, browser,
 * chat, notes) WITHOUT opening the main UMEDT application.
 *
 * Supports:
 * 1) ACTION_PROCESS_TEXT ("ترجمة فورية UMEDT" in Android's text selection menu next to Copy)
 * 2) ACTION_SEND (Sharing selected text to UMEDT instant popup)
 * 3) ACTION_CLIPBOARD_CHECK (Android 10+ focused clipboard inspection & instant popup if found)
 */
public class UMEDTPopupCardActivity extends Activity {
    public static final String ACTION_CLIPBOARD_CHECK = "org.umed2.dictengine.ACTION_CLIPBOARD_CHECK";
    public static final String EXTRA_FORCE_FEEDBACK = "extra_force_feedback";
    public static final String EXTRA_MATCHED_TERM_JSON = "extra_matched_term_json";

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable autoCloseRunnable = this::closeSilently;
    private boolean handledFocusClipboardCheck = false;
    private boolean waitingForClipboardFocus = false;
    private boolean forceFeedbackOnMiss = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        overridePendingTransition(0, 0);

        Window window = getWindow();
        if (window != null) {
            window.setBackgroundDrawableResource(android.R.color.transparent);
            window.addFlags(WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL);
            window.clearFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);
        }

        handleIncomingIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIncomingIntent(intent);
    }

    private void handleIncomingIntent(Intent intent) {
        if (intent == null) {
            closeSilently();
            return;
        }

        String prematchedJson = intent.getStringExtra(EXTRA_MATCHED_TERM_JSON);
        if (prematchedJson != null && !prematchedJson.trim().isEmpty()) {
            try {
                JSONObject matched = new JSONObject(prematchedJson);
                renderCardInsideTranslucentWindow(matched);
                return;
            } catch (Exception ignored) {
            }
        }

        String action = intent.getAction();
        forceFeedbackOnMiss = intent.getBooleanExtra(EXTRA_FORCE_FEEDBACK, false);

        if (Intent.ACTION_PROCESS_TEXT.equals(action)) {
            CharSequence selectedSeq = intent.getCharSequenceExtra(Intent.EXTRA_PROCESS_TEXT);
            String selectedText = selectedSeq != null ? selectedSeq.toString().trim() : "";
            if (!selectedText.isEmpty()) {
                processDirectTextLookup(selectedText, true);
                return;
            }
        } else if (Intent.ACTION_SEND.equals(action)) {
            String sharedText = intent.getStringExtra(Intent.EXTRA_TEXT);
            if (sharedText != null && !sharedText.trim().isEmpty()) {
                processDirectTextLookup(sharedText.trim(), true);
                return;
            }
        }

        // Default or ACTION_CLIPBOARD_CHECK: wait for window focus to read clipboard on Android 10+
        waitingForClipboardFocus = true;
        handledFocusClipboardCheck = false;
        // Safety timeout in case window focus doesn't arrive within 220ms
        handler.postDelayed(() -> {
            if (!handledFocusClipboardCheck) {
                performFocusedClipboardInspection();
            }
        }, 220L);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus && waitingForClipboardFocus && !handledFocusClipboardCheck) {
            handledFocusClipboardCheck = true;
            handler.postDelayed(this::performFocusedClipboardInspection, 25L);
        }
    }

    private void performFocusedClipboardInspection() {
        handledFocusClipboardCheck = true;
        waitingForClipboardFocus = false;

        String copied = readCurrentClipboardText();
        if (copied.isEmpty() || UMEDTDictionaryPopupEngine.shouldIgnoreText(copied)) {
            if (forceFeedbackOnMiss && copied.isEmpty()) {
                Toast.makeText(getApplicationContext(), "الحافظة فارغة حاليًا", Toast.LENGTH_SHORT).show();
            }
            closeSilently();
            return;
        }

        processDirectTextLookup(copied, forceFeedbackOnMiss);
    }

    private void processDirectTextLookup(String rawText, boolean notifyIfMissing) {
        if (UMEDTDictionaryPopupEngine.shouldIgnoreText(rawText)) {
            closeSilently();
            return;
        }
        JSONObject matched = UMEDTDictionaryPopupEngine.findTerm(getApplicationContext(), rawText);
        if (matched == null) {
            if (notifyIfMissing) {
                Toast.makeText(
                        getApplicationContext(),
                        "لم يتم العثور على \"" + truncate(rawText, 28) + "\" في قاموس UMEDT المحلي",
                        Toast.LENGTH_SHORT
                ).show();
            }
            closeSilently();
            return;
        }

        // If SYSTEM_ALERT_WINDOW or AccessibilityService overlay is active, render via system overlay and close Activity in 0ms
        UMEDTAutoTranslateAccessibilityService a11y = UMEDTAutoTranslateAccessibilityService.getActiveInstance();
        if (a11y != null || UMEDTDictionaryPopupEngine.canDrawOverlays(getApplicationContext())) {
            UMEDTDictionaryPopupEngine.showFloatingCard(a11y != null ? a11y : getApplicationContext(), matched, true);
            closeSilently();
            return;
        }

        // Even if neither overlay permission is granted yet, render the floating card directly inside
        // this translucent Activity so the user STILL gets the floating translation card without opening the app!
        renderCardInsideTranslucentWindow(matched);
    }

    private void renderCardInsideTranslucentWindow(JSONObject matchedTerm) {
        FrameLayout backdrop = new FrameLayout(this);
        backdrop.setBackgroundColor(Color.parseColor("#33000000"));
        backdrop.setClickable(true);
        backdrop.setOnClickListener(v -> closeSilently());

        int screenWidth = getResources().getDisplayMetrics().widthPixels;
        float density = getResources().getDisplayMetrics().density;
        int cardWidth = Math.min(screenWidth - Math.round(24 * density), Math.round(460 * density));

        View cardView = UMEDTDictionaryPopupEngine.buildTranslationCardView(
                this,
                matchedTerm,
                this::closeSilently,
                () -> {
                    handler.removeCallbacks(autoCloseRunnable);
                    handler.postDelayed(autoCloseRunnable, 11000L);
                }
        );
        cardView.setClickable(true);

        FrameLayout.LayoutParams cardParams = new FrameLayout.LayoutParams(
                cardWidth,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.TOP | Gravity.CENTER_HORIZONTAL
        );
        cardParams.topMargin = Math.round(48 * density);

        backdrop.addView(cardView, cardParams);
        setContentView(backdrop);

        handler.removeCallbacks(autoCloseRunnable);
        handler.postDelayed(autoCloseRunnable, 10000L);
    }

    private String readCurrentClipboardText() {
        try {
            ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
            if (cm == null || !cm.hasPrimaryClip()) return "";
            ClipData clip = cm.getPrimaryClip();
            if (clip == null || clip.getItemCount() == 0) return "";
            CharSequence text = clip.getItemAt(0).coerceToText(this);
            return text != null ? text.toString().trim() : "";
        } catch (Exception ignored) {
            return "";
        }
    }

    private static String truncate(String s, int maxLen) {
        if (s == null) return "";
        return s.length() <= maxLen ? s : (s.substring(0, maxLen) + "…");
    }

    private void closeSilently() {
        handler.removeCallbacks(autoCloseRunnable);
        finish();
        overridePendingTransition(0, 0);
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacks(autoCloseRunnable);
        super.onDestroy();
    }
}
