package com.billscave.player;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.drawable.Icon;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.IBinder;
import android.os.SystemClock;

/**
 * Native media notification + lock-screen / quick-settings media card.
 * The web app pushes its state through CaveMediaBridge; button presses are sent back
 * to the web app through {@link #sink}.
 */
public class MediaPlaybackService extends Service {
    public interface ActionSink { void onAction(String action, long positionMs); }

    public static volatile ActionSink sink;
    public static volatile String title = "";
    public static volatile String artist = "";
    public static volatile String album = "";
    public static volatile Bitmap art;
    public static volatile long durationMs = 0;
    public static volatile long positionMs = 0;
    public static volatile boolean playing = false;

    private static final String CHANNEL = "cave_playback";
    private static final int NOTIF_ID = 7771;
    private static final String PKG = "com.billscave.player.";

    private MediaSession session;
    private boolean foreground = false;

    @Override
    public void onCreate() {
        super.onCreate();
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Now playing", NotificationManager.IMPORTANCE_LOW);
            ch.setShowBadge(false);
            ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(ch);
        }
        session = new MediaSession(this, "BillsCave");
        session.setCallback(new MediaSession.Callback() {
            @Override public void onPlay() { handle("play", 0); }
            @Override public void onPause() { handle("pause", 0); }
            @Override public void onSkipToNext() { handle("nexttrack", 0); }
            @Override public void onSkipToPrevious() { handle("previoustrack", 0); }
            @Override public void onFastForward() { handle("seekforward", 0); }
            @Override public void onRewind() { handle("seekbackward", 0); }
            @Override public void onStop() { handle("stop", 0); }
            @Override public void onSeekTo(long pos) { handle("seekto", pos); }
        });
        session.setActive(true);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String a = intent == null ? null : intent.getAction();
        if (a != null && a.startsWith(PKG)) {
            String act = a.substring(PKG.length());
            if (act.equals("dismiss")) { shutdown(); return START_NOT_STICKY; }
            handle(act, 0);
            return START_NOT_STICKY;
        }
        // Started by the app: must enter the foreground right away.
        startFg(buildNotification());
        refresh();
        return START_NOT_STICKY;
    }

    private void handle(String action, long pos) {
        switch (action) {
            case "play": playing = true; break;
            case "pause": playing = false; break;
            case "seekto": positionMs = pos; break;
            case "stop": playing = false; break;
            default: break;
        }
        ActionSink s = sink;
        if (s != null) s.onAction(action, pos);
        if (action.equals("stop")) { shutdown(); } else { refresh(); }
    }

    private void refresh() {
        MediaMetadata.Builder mb = new MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, title)
                .putString(MediaMetadata.METADATA_KEY_ARTIST, artist)
                .putString(MediaMetadata.METADATA_KEY_ALBUM, album)
                .putLong(MediaMetadata.METADATA_KEY_DURATION, durationMs);
        Bitmap b = art;
        if (b != null) {
            mb.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, b);
            mb.putBitmap(MediaMetadata.METADATA_KEY_ART, b);
        }
        session.setMetadata(mb.build());

        long actions = PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE
                | PlaybackState.ACTION_SKIP_TO_NEXT | PlaybackState.ACTION_SKIP_TO_PREVIOUS
                | PlaybackState.ACTION_SEEK_TO | PlaybackState.ACTION_STOP
                | PlaybackState.ACTION_FAST_FORWARD | PlaybackState.ACTION_REWIND;
        session.setPlaybackState(new PlaybackState.Builder()
                .setActions(actions)
                .setState(playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED,
                        positionMs, playing ? 1f : 0f, SystemClock.elapsedRealtime())
                .build());

        Notification n = buildNotification();
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (playing && !foreground) startFg(n);
        if (!playing && foreground) {
            // Paused: let the notification be swiped away, but keep the session alive.
            try {
                if (Build.VERSION.SDK_INT >= 24) stopForeground(Service.STOP_FOREGROUND_DETACH); else stopForeground(false);
            } catch (Exception ignored) { }
            foreground = false;
        }
        nm.notify(NOTIF_ID, n);
    }

    private void startFg(Notification n) {
        try {
            if (Build.VERSION.SDK_INT >= 29) {
                startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            } else {
                startForeground(NOTIF_ID, n);
            }
            foreground = true;
        } catch (Exception e) {
            foreground = false;
        }
    }

    private PendingIntent svc(String act) {
        Intent i = new Intent(this, MediaPlaybackService.class).setAction(PKG + act);
        return PendingIntent.getService(this, act.hashCode(), i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private Notification buildNotification() {
        Notification.Builder b = Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent content = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        b.setSmallIcon(android.R.drawable.ic_media_play)
                .setContentTitle(title)
                .setContentText(artist)
                .setSubText(album)
                .setLargeIcon(art)
                .setContentIntent(content)
                .setDeleteIntent(svc("dismiss"))
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setOnlyAlertOnce(true)
                .setShowWhen(false)
                .setOngoing(playing)
                .addAction(new Notification.Action.Builder(
                        Icon.createWithResource(this, android.R.drawable.ic_media_previous), "Previous", svc("previoustrack")).build())
                .addAction(new Notification.Action.Builder(
                        Icon.createWithResource(this, playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play),
                        playing ? "Pause" : "Play", svc(playing ? "pause" : "play")).build())
                .addAction(new Notification.Action.Builder(
                        Icon.createWithResource(this, android.R.drawable.ic_media_next), "Next", svc("nexttrack")).build())
                .setStyle(new Notification.MediaStyle()
                        .setMediaSession(session.getSessionToken())
                        .setShowActionsInCompactView(0, 1, 2));
        return b.build();
    }

    private void shutdown() {
        try {
            if (Build.VERSION.SDK_INT >= 24) stopForeground(Service.STOP_FOREGROUND_REMOVE); else stopForeground(true);
        } catch (Exception ignored) { }
        foreground = false;
        ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).cancel(NOTIF_ID);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        try { ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).cancel(NOTIF_ID); } catch (Exception ignored) { }
        if (session != null) { session.setActive(false); session.release(); }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
