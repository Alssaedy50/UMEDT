package org.umed2.dictengine;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

import org.json.JSONObject;

/**
 * Persistent background/foreground clipboard watcher service for UMEDT.
 * Listens for copy events across all apps and triggers the floating translation card
 * immediately when a copied word exists in the local medical dictionary, without opening MainActivity.
 */
public class UMEDTClipboardMonitorService extends Service {
    public static final String ACTION_START_MONITOR = "org.umed2.dictengine.ACTION_START_CLIPBOARD_MONITOR";
    public static final String ACTION_STOP_MONITOR = "org.umed2.dictengine.ACTION_STOP_CLIPBOARD_MONITOR";
    private static final String CHANNEL_ID = "umedt_instant_copy_channel";
    private static final int NOTIFICATION_ID = 20503;

    private ClipboardManager clipboardManager;
    private long lastClipEventMs = 0L;

    private final ClipboardManager.OnPrimaryClipChangedListener clipListener = () -> {
        long now = System.currentTimeMillis();
        if (now - lastClipEventMs < 450L) {
            return;
        }
        lastClipEventMs = now;
        handleClipboardChanged();
    };

    public static void startMonitorIfEnabled(Context context) {
        if (context == null) return;
        if (!UMEDTDictionaryPopupEngine.isClipboardMonitorEnabled(context)) return;
        try {
            Intent intent = new Intent(context, UMEDTClipboardMonitorService.class);
            intent.setAction(ACTION_START_MONITOR);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent);
            } else {
                context.startService(intent);
            }
        } catch (Exception ignored) {
            // Fallback to normal startService if background startForegroundService is restricted
            try {
                Intent intent = new Intent(context, UMEDTClipboardMonitorService.class);
                intent.setAction(ACTION_START_MONITOR);
                context.startService(intent);
            } catch (Exception ignored2) {
            }
        }
    }

    public static void stopMonitor(Context context) {
        if (context == null) return;
        try {
            Intent intent = new Intent(context, UMEDTClipboardMonitorService.class);
            context.stopService(intent);
        } catch (Exception ignored) {
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        registerClipboardListener();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP_MONITOR.equals(intent.getAction())) {
            UMEDTDictionaryPopupEngine.setClipboardMonitorEnabled(this, false);
            stopForeground(true);
            stopSelf();
            return START_NOT_STICKY;
        }

        UMEDTDictionaryPopupEngine.setClipboardMonitorEnabled(this, true);
        startForegroundSafely();
        registerClipboardListener();
        return START_STICKY;
    }

    private void registerClipboardListener() {
        if (clipboardManager == null) {
            clipboardManager = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
            if (clipboardManager != null) {
                try {
                    clipboardManager.removePrimaryClipChangedListener(clipListener);
                } catch (Exception ignored) {
                }
                clipboardManager.addPrimaryClipChangedListener(clipListener);
            }
        }
    }

    private void handleClipboardChanged() {
        if (!UMEDTDictionaryPopupEngine.isClipboardMonitorEnabled(this)) {
            return;
        }

        // 1. Try direct clipboard inspection first (succeeds on Android <= 9 or when app/IME has focus)
        JSONObject directMatch = UMEDTDictionaryPopupEngine.inspectClipboardAndShowIfMatched(this, false);
        if (directMatch != null) {
            return;
        }

        // 2. On Android 10+ (API 29+), background services cannot read getPrimaryClip() directly unless focused.
        // If SYSTEM_ALERT_WINDOW permission is granted, launch the zero-UI translucent UMEDTPopupCardActivity
        // which gains focus for ~15ms, reads clipboard, shows the overlay card if found in dictionary, and exits.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && UMEDTDictionaryPopupEngine.canDrawOverlays(this)) {
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
        }
    }

    private void startForegroundSafely() {
        try {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm != null) {
                NotificationChannel channel = new NotificationChannel(
                        CHANNEL_ID,
                        "الترجمة الفورية للمصطلحات المنسوخة",
                        NotificationManager.IMPORTANCE_LOW
                );
                channel.setDescription("مراقبة الحافظة لإظهار بطاقة ترجمة المصطلحات الطبية المنسوخة فورًا بدون فتح التطبيق");
                channel.setShowBadge(false);
                channel.enableVibration(false);
                channel.setSound(null, null);
                nm.createNotificationChannel(channel);
            }

            int pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT
                    | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);

            // Tapping the notification or action button checks the clipboard immediately and shows the floating card
            Intent checkIntent = new Intent(this, UMEDTPopupCardActivity.class);
            checkIntent.setAction(UMEDTPopupCardActivity.ACTION_CLIPBOARD_CHECK);
            checkIntent.putExtra(UMEDTPopupCardActivity.EXTRA_FORCE_FEEDBACK, true);
            checkIntent.addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK
                            | Intent.FLAG_ACTIVITY_CLEAR_TOP
                            | Intent.FLAG_ACTIVITY_NO_ANIMATION
            );
            PendingIntent checkPendingIntent = PendingIntent.getActivity(this, 101, checkIntent, pendingFlags);

            Intent stopIntent = new Intent(this, UMEDTClipboardMonitorService.class);
            stopIntent.setAction(ACTION_STOP_MONITOR);
            PendingIntent stopPendingIntent = PendingIntent.getService(this, 102, stopIntent, pendingFlags);

            Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                    ? new Notification.Builder(this, CHANNEL_ID)
                    : new Notification.Builder(this);

            int termsCount = UMEDTDictionaryPopupEngine.getSyncedTermsCount(this);
            String contentText = "انسخ أي مصطلح طبي أو اضغط هنا لإظهار بطاقة الترجمة العائمة (" + termsCount + " مصطلح)";

            builder.setSmallIcon(android.R.drawable.ic_menu_search)
                    .setContentTitle("قاموس UMEDT الفوري نشط")
                    .setContentText(contentText)
                    .setContentIntent(checkPendingIntent)
                    .setOngoing(true)
                    .addAction(android.R.drawable.ic_menu_search, "ترجمة المنسوخ الآن", checkPendingIntent)
                    .addAction(android.R.drawable.ic_menu_close_clear_cancel, "إيقاف", stopPendingIntent);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN) {
                builder.setPriority(Notification.PRIORITY_LOW);
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                startForeground(NOTIFICATION_ID, builder.build(), ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            } else {
                startForeground(NOTIFICATION_ID, builder.build());
            }
        } catch (Exception ignored) {
        }
    }

    @Override
    public void onDestroy() {
        if (clipboardManager != null) {
            try {
                clipboardManager.removePrimaryClipChangedListener(clipListener);
            } catch (Exception ignored) {
            }
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
