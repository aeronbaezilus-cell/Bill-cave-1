package com.billscave.player;

import android.content.Context;
import android.content.Intent;
import android.graphics.BitmapFactory;
import android.os.Build;
import android.util.Base64;
import android.webkit.JavascriptInterface;

import org.json.JSONObject;

/** Exposed to the web app as window.CaveNative. */
public class CaveMediaBridge {
    private final Context ctx;

    public CaveMediaBridge(Context ctx) { this.ctx = ctx; }

    @JavascriptInterface
    public void update(String json) {
        try {
            JSONObject o = new JSONObject(json);
            MediaPlaybackService.title = o.optString("title", "");
            MediaPlaybackService.artist = o.optString("artist", "");
            MediaPlaybackService.album = o.optString("album", "");
            MediaPlaybackService.durationMs = o.optLong("duration", 0);
            MediaPlaybackService.positionMs = o.optLong("position", 0);
            MediaPlaybackService.playing = o.optBoolean("playing", false);
            if (o.has("art")) {
                String b64 = o.optString("art", "");
                if (b64.isEmpty()) {
                    MediaPlaybackService.art = null;
                } else {
                    byte[] d = Base64.decode(b64, Base64.DEFAULT);
                    MediaPlaybackService.art = BitmapFactory.decodeByteArray(d, 0, d.length);
                }
            }
            Intent i = new Intent(ctx, MediaPlaybackService.class);
            if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i); else ctx.startService(i);
        } catch (Exception ignored) {
            // Never crash the player because of the notification.
        }
    }

    @JavascriptInterface
    public void clear() {
        try { ctx.stopService(new Intent(ctx, MediaPlaybackService.class)); } catch (Exception ignored) { }
    }
}
