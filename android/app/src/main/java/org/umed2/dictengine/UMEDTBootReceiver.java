package org.umed2.dictengine;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Starts UMEDTClipboardMonitorService automatically on device boot or package update
 * so the instant translation popup card works even before the user opens MainActivity.
 */
public class UMEDTBootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null || intent == null) return;
        String action = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(action)
                || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)
                || "android.intent.action.QUICKBOOT_POWERON".equals(action)
                || "com.htc.intent.action.QUICKBOOT_POWERON".equals(action)) {
            UMEDTClipboardMonitorService.startMonitorIfEnabled(context.getApplicationContext());
        }
    }
}
