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
        return serviceConnected ? activeInstance : null;
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

        int eventType = event.getEventType();

        // Track the highlighted text without translating it. A translation is shown
        // only after an explicit Copy action, or through UMEDT's PROCESS_TEXT menu item.
        if (eventType == AccessibilityEvent.TYPE_VIEW_TEXT_SELECTION_CHANGED) {
            String selected = extractSelectedText(event);
            if (!selected.isEmpty() && selected.length() <= 180
                    && !UMEDTDictionaryPopupEngine.shouldIgnoreText(selected)) {
                lastSelectedText = selected;
                lastSelectedTimestampMs = System.currentTimeMillis();
            }
            return;
        }
        if (eventType == AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED) {
            String selected = extractActiveWindowSelection();
            if (!selected.isEmpty() && selected.length() <= 180
                    && !UMEDTDictionaryPopupEngine.shouldIgnoreText(selected)) {
                lastSelectedText = selected;
                lastSelectedTimestampMs = System.currentTimeMillis();
            }
            return;
        }

        // Copy monitoring can be disabled independently from explicit selection translation.
        if (!UMEDTDictionaryPopupEngine.isClipboardMonitorEnabled(this)) {
            return;
        }

        // Copy toolbar actions are explicit user intent. Use the just-highlighted
        // word first, then fall back to the clipboard when available.
        if (eventType == AccessibilityEvent.TYPE_VIEW_CLICKED) {
            if (isCopyButtonEvent(event)) {
                triggerCopyLookup();
            }
            return;
        }

        // Clipboard-change events are handled by UMEDTClipboardMonitorService.
        // Accessibility announcements are only a fallback after Android confirms a copy.
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

        // A fresh selection is eligible only after the user activates Copy.
        // This also works on Android versions that block background clipboard reads.
        if (!lastSelectedText.isEmpty()
                && now - lastSelectedTimestampMs <= 5000L
                && UMEDTDictionaryPopupEngine.isSingleWordLookup(lastSelectedText)) {
            JSONObject selectedMatch = UMEDTDictionaryPopupEngine.findTerm(this, lastSelectedText);
            if (selectedMatch != null) {
                UMEDTDictionaryPopupEngine.showFloatingCard(this, selectedMatch, false);
                return;
            }
        }

        // If accessibility could not capture the selected word, inspect the actual clipboard.
        JSONObject direct = UMEDTDictionaryPopupEngine.inspectClipboardAndShowIfMatched(this, false);
        if (direct != null) {
            return;
        }

        // Do not open UMEDTPopupCardActivity as a background clipboard reader.
        // Even a transparent Activity takes window focus away from the current IME,
        // which causes the keyboard to flicker. The selection/copy paths above
        // render a matched term directly through the non-focusable overlay.
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
        if (activeInstance == this) {
            activeInstance = null;
        }
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
