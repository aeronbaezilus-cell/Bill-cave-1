package com.billscave.player;

import android.Manifest;
import android.app.AlarmManager;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;

import com.getcapacitor.BridgeActivity;

import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {
    private static final int REQ_RUNTIME = 4242;
    private static final String PREFS = "cave_permissions";
    private boolean runtimeInFlight = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestRuntimePermissionsOnce();
    }

    @Override
    public void onResume() {
        super.onResume();
        if (!runtimeInFlight) askNextSpecialAccess();
    }

    /* ---------- Runtime permissions: audio, photos/videos, notifications, nearby devices ---------- */
    private void requestRuntimePermissionsOnce() {
        SharedPreferences sp = getSharedPreferences(PREFS, MODE_PRIVATE);
        if (sp.getBoolean("runtime_asked", false)) return;
        sp.edit().putBoolean("runtime_asked", true).apply();

        List<String> wanted = new ArrayList<>();
        if (Build.VERSION.SDK_INT >= 33) {
            wanted.add(Manifest.permission.READ_MEDIA_AUDIO);
            wanted.add(Manifest.permission.READ_MEDIA_IMAGES);
            wanted.add(Manifest.permission.READ_MEDIA_VIDEO);
            wanted.add(Manifest.permission.POST_NOTIFICATIONS);
            wanted.add("android.permission.NEARBY_WIFI_DEVICES");
        } else {
            wanted.add(Manifest.permission.READ_EXTERNAL_STORAGE);
            if (Build.VERSION.SDK_INT <= 28) wanted.add(Manifest.permission.WRITE_EXTERNAL_STORAGE);
        }
        if (Build.VERSION.SDK_INT >= 31) {
            wanted.add(Manifest.permission.BLUETOOTH_CONNECT);
            wanted.add(Manifest.permission.BLUETOOTH_SCAN);
        }

        List<String> missing = new ArrayList<>();
        for (String p : wanted) {
            if (checkSelfPermission(p) != PackageManager.PERMISSION_GRANTED) missing.add(p);
        }
        if (!missing.isEmpty()) {
            runtimeInFlight = true;
            requestPermissions(missing.toArray(new String[0]), REQ_RUNTIME);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_RUNTIME) {
            runtimeInFlight = false;
            askNextSpecialAccess();
        }
    }

    /* ---------- Special access screens (asked one at a time, once each) ---------- */
    private boolean markAsked(String key) {
        SharedPreferences sp = getSharedPreferences(PREFS, MODE_PRIVATE);
        if (sp.getBoolean(key, false)) return false;
        sp.edit().putBoolean(key, true).apply();
        return true;
    }

    private void askNextSpecialAccess() {
        try {
            // 1. Modify system settings
            if (!Settings.System.canWrite(this) && markAsked("asked_write_settings")) {
                Intent i = new Intent(Settings.ACTION_MANAGE_WRITE_SETTINGS, Uri.parse("package:" + getPackageName()));
                startActivity(i);
                return;
            }
            // 2. Alarms & reminders
            if (Build.VERSION.SDK_INT >= 31) {
                AlarmManager am = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
                if (am != null && !am.canScheduleExactAlarms() && markAsked("asked_exact_alarm")) {
                    Intent i = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + getPackageName()));
                    startActivity(i);
                    return;
                }
            }
            // 3. Full-screen notifications (lock-screen controls)
            if (Build.VERSION.SDK_INT >= 34) {
                NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                if (nm != null && !nm.canUseFullScreenIntent() && markAsked("asked_full_screen")) {
                    Intent i = new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:" + getPackageName()));
                    startActivity(i);
                    return;
                }
            }
            // 4. Unrestricted battery use (keeps playback alive in background)
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null && !pm.isIgnoringBatteryOptimizations(getPackageName()) && markAsked("asked_battery")) {
                Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + getPackageName()));
                startActivity(i);
            }
        } catch (Exception ignored) {
            // Some OEMs lack these screens; skip silently.
        }
    }
}
