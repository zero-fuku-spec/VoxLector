package com.voxlector.ai;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

public class PlaybackForegroundService extends Service {
    static final String ACTION_START = "com.voxlector.ai.playback.START";
    static final String EXTRA_TITLE = "playback_title";
    private static final String CHANNEL_ID = "voxlector_playback";
    private static final int NOTIFICATION_ID = 7314;

    private PowerManager.WakeLock wakeLock;
    private MediaSession mediaSession;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        mediaSession = new MediaSession(this, "VoxLectorPlayback");
        mediaSession.setPlaybackToLocal(new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_MEDIA)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
            .build());
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String title = intent == null ? "VoxLector" : intent.getStringExtra(EXTRA_TITLE);
        activateMediaSession(title);
        startForeground(NOTIFICATION_ID, createNotification(title));
        acquireWakeLock();
        return START_NOT_STICKY;
    }

    private void activateMediaSession(String title) {
        if (mediaSession == null) return;
        // Expose WebView TTS as active media so Android keeps playback available while locked.
        mediaSession.setMetadata(new MediaMetadata.Builder()
            .putString(MediaMetadata.METADATA_KEY_TITLE,
                title == null || title.trim().isEmpty() ? "VoxLector" : title)
            .putString(MediaMetadata.METADATA_KEY_ARTIST, "VoxLector")
            .build());
        mediaSession.setPlaybackState(new PlaybackState.Builder()
            .setState(PlaybackState.STATE_PLAYING, PlaybackState.PLAYBACK_POSITION_UNKNOWN, 1f)
            .setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_STOP)
            .build());
        mediaSession.setActive(true);
    }

    private Notification createNotification(String title) {
        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(this, CHANNEL_ID)
            : new Notification.Builder(this);
        builder
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle(title == null || title.trim().isEmpty() ? "VoxLector" : title)
            .setContentText("Lectura en reproducción")
            .setCategory(Notification.CATEGORY_TRANSPORT)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setVisibility(Notification.VISIBILITY_PUBLIC);
        if (mediaSession != null) {
            builder.setStyle(new Notification.MediaStyle().setMediaSession(mediaSession.getSessionToken()));
        }
        return builder.build();
    }

    private void acquireWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) return;
        PowerManager powerManager = (PowerManager) getSystemService(POWER_SERVICE);
        if (powerManager == null) return;
        wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "VoxLector:Playback");
        wakeLock.setReferenceCounted(false);
        wakeLock.acquire();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Reproducción de VoxLector",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Estado de lectura en voz alta");
            NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) manager.createNotificationChannel(channel);
        }
    }

    @Override
    public void onDestroy() {
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        if (mediaSession != null) {
            mediaSession.setActive(false);
            mediaSession.release();
            mediaSession = null;
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
