package com.billscave.player;

import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

import org.json.JSONObject;

/** Exposed to the web app as window.CaveNative (and also reachable through the CaveMedia plugin). */
public class CaveMediaBridge {
    private static boolean announced = false;
    private final Context ctx;

    public CaveMediaBridge(Context ctx) { this.ctx = ctx.getApplicationContext(); }

    @JavascriptInterface
    public void update(String json) {
        try { apply(ctx, new JSONObject(json)); } catch (Exception ignored) { }
    }

    @JavascriptInterface
    public void clear() { stop(ctx); }

    static void stop(Context ctx) {
        try { ctx.stopService(new Intent(ctx, MediaPlaybackService.class)); } catch (Exception ignored) { }
    }

    static void apply(final Context ctx, JSONObject o) {
        try {
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
            announce(ctx);
            Intent i = new Intent(ctx, MediaPlaybackService.class);
            if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i); else ctx.startService(i);
        } catch (Exception e) {
            toast(ctx, "Media controls error: " + e.getClass().getSimpleName());
        }
    }

    /** One-time message per app start: proves the native bridge works, or tells you what is blocked. */
    private static void announce(Context ctx) {
        if (announced) return;
        announced = true;
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null && !nm.areNotificationsEnabled()) {
            toast(ctx, "Notifications are blocked for Bill's Cave. Turn them on to see the player.");
            try {
                Intent s = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                        .putExtra(Settings.EXTRA_APP_PACKAGE, ctx.getPackageName())
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(s);
            } catch (Exception ignored) { }
        } else {
            toast(ctx, "Media controls ready");
        }
    }

    private static void toast(final Context ctx, final String msg) {
        new Handler(Looper.getMainLooper()).post(new Runnable() {
            @Override public void run() { Toast.makeText(ctx, msg, Toast.LENGTH_LONG).show(); }
        });
    }
}
