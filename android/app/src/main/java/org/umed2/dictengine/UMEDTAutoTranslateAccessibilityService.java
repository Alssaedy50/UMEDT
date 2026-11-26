package org.umed2.dictengine;

import android.accessibilityservice.AccessibilityService;
import android.content.Intent;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;

import org.json.JSONObject;

import java.util.List;
import java.util.Locale;

/**
 * Zero-Keyboard Automatic Translation Accessibility Service for UMEDT.
 * Allows automatic floating translation cards on Copy or Text Selection across ALL apps
 * (PDF readers, Chrome, Telegram, WhatsApp, Notes) while letting the user keep using
 * ANY keyboard (Gboard, Samsung Keyboard, SwiftKey, Xiaomi Keyboard) — even when UMEDT is completely closed.
 *
 * Privacy guarantee:
 * - Does NOT subscribe to TYPE_VIEW_TEXT_CHANGED (zero keystroke logging).
 * - Ignores password fields and UMEDT's own WebView window.
 */
public class UMEDTAutoTranslateAccessibilityService extends AccessibilityService {

    private static volatile boolean serviceConnected = false;
    private static volatile UMEDTAutoTranslateAccessibilityService activeInstance = null;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private volatile String lastSelectedText = "";
    private volatile long lastSelectedTimestampMs = 0L;
    private String lastHandledTermKey = "";
    private long lastHandledTimestampMs = 0L;
    private long lastCopyTriggerTimestampMs = 0L;

    public static boolean isServiceConnected() {
        return serviceConnected && activeInstance != null;
    }

    public static UMEDTAutoTranslateAccessibilityService getActiveInstance() {
        return activeInstance;
    }

    public String getRecentSelectedText(long maxAgeMs) {
        if (lastSelectedText == null || lastSelectedText.isEmpty()) return "";
        if (System.currentTimeMillis() - lastSelectedTimestampMs <= maxAgeMs) {
            return lastSelectedText;
        }
        return "";
    }

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        activeInstance = this;
        serviceConnected = true;

        // The Accessibility service is managed by Android and remains active even when
        // the UMEDT app is completely closed. Ensure clipboard monitoring is started.
        UMEDTClipboardMonitorService.startMonitorIfEnabled(getApplicationContext());
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null) return;
        activeInstance = this;
        serviceConnected = true;

        CharSequence pkgSeq = event.getPackageName();
        String pkgName = pkgSeq != null ? pkgSeq.toString() : "";
        // Skip our own app window since WebView handles copy/selection translation internally
        if (pkgName.startsWith("org.umed2.dictengine")) {
            return;
        }

        if (!UMEDTDictionaryPopupEngine.isClipboardMonitorEnabled(this)) {
            return;
        }

        int eventType = event.getEventType();

        // 1. Track text selection in any external app (works even without background clipboard access)
        if (eventType == AccessibilityEvent.TYPE_VIEW_TEXT_SELECTION_CHANGED) {
            String selected = extractSelectedText(event);
            if (!selected.isEmpty() && selected.length() <= 180 && !UMEDTDictionaryPopupEngine.shouldIgnoreText(selected)) {
                lastSelectedText = selected;
                lastSelectedTimestampMs = System.currentTimeMillis();

                if (UMEDTDictionaryPopupEngine.isAutoTranslateOnSelectEnabled(this)) {
                    tryShowTranslationForText(selected, false);
                }
            }
            return;
        }

        // 2. Detect "Copy / نسخ" action button clicks OR system "Copied to clipboard / تم النسخ" announcements
        if (eventType == AccessibilityEvent.TYPE_VIEW_CLICKED) {
            if (isCopyButtonEvent(event)) {
                triggerCopyLookup();
            }
            return;
        }

        if (eventType == AccessibilityEvent.TYPE_NOTIFICATION_STATE_CHANGED
                || eventType == AccessibilityEvent.TYPE_ANNOUNCEMENT) {
            if (isCopiedToastEvent(event)) {
                triggerCopyLookup();
            }
        }
    }

    public void triggerCopyLookup() {
        long now = System.currentTimeMillis();
        if (now - lastCopyTriggerTimestampMs < 400L) {
            return;
        }
        lastCopyTriggerTimestampMs = now;

        // Priority 1: If we just captured the highlighted text before the user tapped Copy, look it up directly in 0ms!
        if (!lastSelectedText.isEmpty() && (now - lastSelectedTimestampMs) < 20000L) {
            if (tryShowTranslationForText(lastSelectedText, false)) {
                return;
            }
        }

        // Priority 1b: Try scanning active window root for any active text selection
        String windowSelected = extractActiveWindowSelection();
        if (!windowSelected.isEmpty() && tryShowTranslationForText(windowSelected, false)) {
            return;
        }

        // Priority 2: Direct clipboard inspection (works on Android <= 9 or when OEM allows AccessibilityService)
        JSONObject direct = UMEDTDictionaryPopupEngine.inspectClipboardAndShowIfMatched(this, false);
        if (direct != null) {
            return;
        }

        // Priority 3: On Android 10+, an active AccessibilityService is explicitly permitted by Android OS
        // to start an Activity from the background even when the main UMEDT app is completely closed!
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            mainHandler.postDelayed(() -> {
                try {
                    Intent popupIntent = new Intent(this, UMEDTPopupCardActivity.class);
                    popupIntent.setAction(UMEDTPopupCardActivity.ACTION_CLIPBOARD_CHECK);
                    popupIntent.putExtra(UMEDTPopupCardActivity.EXTRA_FORCE_FEEDBACK, false);
                    popupIntent.addFlags(
                            Intent.FLAG_ACTIVITY_NEW_TASK
                                    | Intent.FLAG_ACTIVITY_CLEAR_TOP
                                    | Intent.FLAG_ACTIVITY_SINGLE_TOP
                                    | Intent.FLAG_ACTIVITY_NO_ANIMATION
                                    | Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS
                    );
                    startActivity(popupIntent);
                } catch (Exception ignored) {
                }
            }, 70L);
        }
    }

    private boolean tryShowTranslationForText(String rawText, boolean forceShow) {
        if (rawText == null || rawText.trim().isEmpty()) return false;
        if (UMEDTDictionaryPopupEngine.shouldIgnoreText(rawText)) return false;

        JSONObject matched = UMEDTDictionaryPopupEngine.findTerm(this, rawText.trim());
        if (matched == null) return false;

        String termKey = matched.optString("term", "") + "|" + matched.optString("translation", "");
        long now = System.currentTimeMillis();
        if (!forceShow && termKey.equals(lastHandledTermKey) && (now - lastHandledTimestampMs) < 1600L) {
            return true;
        }
        lastHandledTermKey = termKey;
        lastHandledTimestampMs = now;

        // Pass 'this' (AccessibilityService context) so showFloatingCard can use TYPE_ACCESSIBILITY_OVERLAY directly!
        UMEDTDictionaryPopupEngine.showFloatingCard(this, matched, forceShow);
        return true;
    }

    private String extractSelectedText(AccessibilityEvent event) {
        try {
            AccessibilityNodeInfo source = event.getSource();
            if (source != null) {
                try {
                    if (source.isPassword()) {
                        return "";
                    }
                    String fromNode = extractSelectionFromNode(source, 0);
                    if (!fromNode.isEmpty()) {
                        return fromNode;
                    }
                } finally {
                    source.recycle();
                }
            }

            int from = event.getFromIndex();
            int to = event.getToIndex();
            List<CharSequence> texts = event.getText();
            if (texts != null && !texts.isEmpty() && texts.get(0) != null) {
                CharSequence t = texts.get(0);
                int len = t.length();
                if (from >= 0 && to > from) {
                    if (to <= len) {
                        return t.subSequence(from, to).toString().trim();
                    }
                    // In Chrome, WebViews, and PDF readers, event.getText().get(0) is often ALREADY
                    // the selected substring while from/to are full-document character offsets!
                    int selLen = to - from;
                    if (len == selLen || (len <= 160 && selLen <= 160)) {
                        return t.toString().trim();
                    }
                } else if (len > 0 && len <= 120) {
                    return t.toString().trim();
                }
            }

            CharSequence desc = event.getContentDescription();
            if (desc != null && desc.length() > 0 && desc.length() <= 120) {
                if (from >= 0 && to > from && to <= desc.length()) {
                    return desc.subSequence(from, to).toString().trim();
                }
            }
        } catch (Exception ignored) {
        }
        return "";
    }

    private String extractActiveWindowSelection() {
        try {
            AccessibilityNodeInfo root = getRootInActiveWindow();
            if (root == null) return "";
            try {
                return extractSelectionFromNode(root, 0);
            } finally {
                root.recycle();
            }
        } catch (Exception ignored) {
            return "";
        }
    }

    private String extractSelectionFromNode(AccessibilityNodeInfo node, int depth) {
        if (node == null || depth > 8) return "";
        try {
            if (node.isPassword()) return "";
            CharSequence fullText = node.getText();
            int start = node.getTextSelectionStart();
            int end = node.getTextSelectionEnd();
            if (fullText != null && start >= 0 && end >= 0 && start != end) {
                int min = Math.min(start, end);
                int max = Math.max(start, end);
                if (max <= fullText.length()) {
                    String sub = fullText.subSequence(min, max).toString().trim();
                    if (!sub.isEmpty()) return sub;
                } else if (fullText.length() <= 160) {
                    return fullText.toString().trim();
                }
            }
            int count = Math.min(node.getChildCount(), 24);
            for (int i = 0; i < count; i++) {
                AccessibilityNodeInfo child = node.getChild(i);
                if (child != null) {
                    try {
                        String res = extractSelectionFromNode(child, depth + 1);
                        if (!res.isEmpty()) return res;
                    } finally {
                        child.recycle();
                    }
                }
            }
        } catch (Exception ignored) {
        }
        return "";
    }

    private boolean isCopyButtonEvent(AccessibilityEvent event) {
        try {
            StringBuilder combined = new StringBuilder();
            if (event.getContentDescription() != null) {
                combined.append(event.getContentDescription()).append(' ');
            }
            List<CharSequence> texts = event.getText();
            if (texts != null) {
                for (CharSequence c : texts) {
                    if (c != null) combined.append(c).append(' ');
                }
            }
            AccessibilityNodeInfo source = event.getSource();
            if (source != null) {
                try {
                    if (source.getText() != null) combined.append(source.getText()).append(' ');
                    if (source.getContentDescription() != null) combined.append(source.getContentDescription()).append(' ');
                    if (source.getViewIdResourceName() != null) combined.append(source.getViewIdResourceName()).append(' ');
                } finally {
                    source.recycle();
                }
            }
            String s = combined.toString().toLowerCase(Locale.ROOT);
            return s.contains("copy") || s.contains("نسخ") || s.contains("clipboard");
        } catch (Exception ignored) {
            return false;
        }
    }

    private boolean isCopiedToastEvent(AccessibilityEvent event) {
        try {
            List<CharSequence> texts = event.getText();
            if (texts == null || texts.isEmpty()) return false;
            StringBuilder combined = new StringBuilder();
            for (CharSequence c : texts) {
                if (c != null) combined.append(c).append(' ');
            }
            String s = combined.toString().toLowerCase(Locale.ROOT);
            return s.contains("copied") || s.contains("تم النسخ") || s.contains("نسخ النص") || s.contains("clipboard");
        } catch (Exception ignored) {
            return false;
        }
    }

    @Override
    public void onInterrupt() {
        serviceConnected = false;
    }

    @Override
    public boolean onUnbind(Intent intent) {
        serviceConnected = false;
        if (activeInstance == this) {
            activeInstance = null;
        }
        return super.onUnbind(intent);
    }

    @Override
    public void onDestroy() {
        serviceConnected = false;
        if (activeInstance == this) {
            activeInstance = null;
        }
        super.onDestroy();
    }
}
