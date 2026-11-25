package org.umed2.dictengine;

import android.app.PendingIntent;
import android.content.Intent;
import android.os.Build;
import android.service.quicksettings.Tile;
import android.service.quicksettings.TileService;

import androidx.annotation.RequiresApi;

/**
 * Android Quick Settings Tile ("ترجمة المنسوخ") allowing 1-tap instant translation
 * of the current clipboard over any running app without using UMEDT as a keyboard
 * and without leaving the active app.
 */
@RequiresApi(api = Build.VERSION_CODES.N)
public class UMEDTQuickTranslateTileService extends TileService {

    @Override
    public void onStartListening() {
        super.onStartListening();
        Tile tile = getQsTile();
        if (tile != null) {
            tile.setState(Tile.STATE_ACTIVE);
            tile.setLabel(getString(R.string.umedt_quick_tile_label));
            tile.updateTile();
        }
    }

    @Override
    public void onClick() {
        super.onClick();
        Intent intent = new Intent(this, UMEDTPopupCardActivity.class);
        intent.setAction(UMEDTPopupCardActivity.ACTION_CLIPBOARD_CHECK);
        intent.putExtra(UMEDTPopupCardActivity.EXTRA_FORCE_FEEDBACK, true);
        intent.addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK
                        | Intent.FLAG_ACTIVITY_CLEAR_TOP
                        | Intent.FLAG_ACTIVITY_NO_ANIMATION
                        | Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS
        );

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                PendingIntent pi = PendingIntent.getActivity(
                        this,
                        301,
                        intent,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                );
                startActivityAndCollapse(pi);
            } else {
                startActivityAndCollapse(intent);
            }
        } catch (Exception ignored) {
        }
    }
}
