#!/usr/bin/env python3
"""Adds Musicolet-style permissions and lock-screen flags to the generated AndroidManifest.xml."""
import re, sys, os, glob, shutil

path = sys.argv[1]
s = open(path, encoding='utf-8').read()

PERMS = """
    <!-- Music, photos & videos -->
    <uses-permission android:name="android.permission.READ_MEDIA_AUDIO" />
    <uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
    <uses-permission android:name="android.permission.READ_MEDIA_VIDEO" />
    <uses-permission android:name="android.permission.READ_MEDIA_VISUAL_USER_SELECTED" />
    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />
    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="28" />

    <!-- Nearby devices (Bluetooth headsets / speakers, Wi-Fi cast) -->
    <uses-permission android:name="android.permission.BLUETOOTH" android:maxSdkVersion="30" />
    <uses-permission android:name="android.permission.BLUETOOTH_ADMIN" android:maxSdkVersion="30" />
    <uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
    <uses-permission android:name="android.permission.BLUETOOTH_SCAN" android:usesPermissionFlags="neverForLocation" />
    <uses-permission android:name="android.permission.NEARBY_WIFI_DEVICES" android:usesPermissionFlags="neverForLocation" />

    <!-- Notifications & lock screen -->
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <uses-permission android:name="android.permission.USE_FULL_SCREEN_INTENT" />
    <uses-permission android:name="android.permission.DISABLE_KEYGUARD" />
    <uses-permission android:name="android.permission.WAKE_LOCK" />
    <uses-permission android:name="android.permission.VIBRATE" />

    <!-- Background playback -->
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK" />
    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
    <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
    <uses-permission android:name="android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS" />

    <!-- Alarms & reminders (sleep timer) and system settings -->
    <uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />
    <uses-permission android:name="android.permission.WRITE_SETTINGS" />

    <!-- Network -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
"""

# Remove any permission we are about to re-add, then insert the block before <application
names = re.findall(r'android:name="(android\.permission\.[A-Z_]+)"', PERMS)
for n in set(names):
    s = re.sub(r'\s*<uses-permission[^>]*android:name="%s"[^>]*/>' % re.escape(n), '', s)
s = s.replace('<application', PERMS + '\n    <application', 1)

# Lock-screen behaviour on the main activity
def patch_activity(m):
    tag = m.group(0)
    for attr, val in (('android:showWhenLocked', 'true'), ('android:turnScreenOn', 'false'),
                      ('android:keepScreenOn', None)):
        if val is None or attr in tag:
            continue
        tag = tag.replace('<activity', '<activity %s="%s"' % (attr, val), 1)
    return tag

s = re.sub(r'<activity[^>]*\.MainActivity[^>]*>', patch_activity, s, count=1)

# Allow uncompressed/unrestricted media + legacy storage on old devices
if 'android:requestLegacyExternalStorage' not in s:
    s = s.replace('<application', '<application android:requestLegacyExternalStorage="true"', 1)

# Native media service (lock-screen / notification controls)
if 'MediaPlaybackService' not in s:
    s = s.replace('</application>',
        '    <service android:name=".MediaPlaybackService" android:exported="false"\n'
        '             android:foregroundServiceType="mediaPlayback" />\n    </application>', 1)

# Copy every native Java helper next to MainActivity
here = os.path.dirname(os.path.abspath(__file__))
dst = os.path.join(os.path.dirname(path), 'java', 'com', 'billscave', 'player')
os.makedirs(dst, exist_ok=True)
for f in glob.glob(os.path.join(here, 'java', '*.java')):
    shutil.copy(f, dst)

open(path, 'w', encoding='utf-8').write(s)
print('Manifest patched')
