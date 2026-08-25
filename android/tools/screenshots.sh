#!/usr/bin/env bash
# Drive the emulator through the app in demo mode and capture Play-Console-ready
# screenshots. Produces PNGs in fastlane/metadata/android/en-US/images/phoneScreenshots/.
#
# Usage:
#   tools/screenshots.sh            # assumes an emulator is already running
#   SDK=... tools/screenshots.sh    # ANDROID_HOME override
#
# Requirements: adb, a booted emulator, and app-gplay-debug.apk (built via
# `make build` or the script builds it when missing).
set -euo pipefail

restore_scales() {
  adb shell settings put global window_animation_scale 1 || true
  adb shell settings put global transition_animation_scale 1 || true
  adb shell settings put global animator_duration_scale 1 || true
}
trap restore_scales EXIT

cd "$(dirname "$0")/.."
ANDROID_HOME="${ANDROID_HOME:-$HOME/.local/android-sdk}"
ADB="$ANDROID_HOME/platform-tools/adb"
OUT="fastlane/metadata/android/en-US/images/phoneScreenshots"
APK="app/build/outputs/apk/gplay/debug/app-gplay-debug.apk"
PKG="com.nimbleflux.wayli"

mkdir -p "$OUT"
rm -f "$OUT"/*.png

if ! $ADB devices | grep -q "emulator.*device$"; then
    echo "No running emulator found. Start one first (make emu && make emu-wait)." >&2
    exit 1
fi

if [ ! -f "$APK" ]; then
    echo "APK not found — building…"
    ./gradlew :app:assembleGplayDebug
fi
$ADB install -r "$APK" >/dev/null

# Animations keep uiautomator from ever reaching "idle" (MapLibre camera,
# Coil fades) and dumps time out. Disable them globally for the run.
for setting in window_animation_scale transition_animation_scale animator_duration_scale; do
    $ADB shell settings put global "$setting" 0 || true
done

dump() {
    rm -f /tmp/wayli-shot.xml
    timeout 8 $ADB shell uiautomator dump /sdcard/wayli-shot.xml >/dev/null 2>&1 || true
    timeout 5 $ADB pull /sdcard/wayli-shot.xml /tmp/wayli-shot.xml >/dev/null 2>&1 || true
    [ -f /tmp/wayli-shot.xml ]
}

# Find a node whose text (or content-desc) contains $1; print "x y" (center).
# Exact matches beat substrings (so "Travel" doesn't hit "Alex Traveler"),
# clickable/desc nodes beat plain labels, and taps near the gesture bar are
# nudged up into the dock.
bounds_of() {
    python3 - "$1" <<'PY'
import re, sys
needle = sys.argv[1].lower()
xml = open('/tmp/wayli-shot.xml').read()
candidates = []
for m in re.finditer(r'<node[^>]*>', xml):
    n = m.group(0)
    values = [mm.group(1).lower() for mm in re.finditer(r'(?:text|content-desc)="([^"]*)"', n)]
    if not any(needle in v for v in values):
        continue
    b = re.search(r'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', n)
    if not b:
        continue
    x = (int(b.group(1)) + int(b.group(3))) // 2
    y = (int(b.group(2)) + int(b.group(4))) // 2
    exact = any(v == needle for v in values)
    clickable = 'clickable="true"' in n
    has_desc = 'content-desc="' in n
    candidates.append((not exact, not clickable, not has_desc, x, y))
if not candidates:
    sys.exit(1)
best = sorted(candidates)[0]
x, y = best[3], best[4]
if y > 2230:
    y -= 60
print(f"{x} {y}")
PY
}

# Tap the node whose text/content-desc contains $1. Retries with a small
# upward swipe between attempts — LazyColumn targets are often below the fold
# (trip cards under the hero, dock labels, etc.), and off-screen items don't
# exist in the semantics tree at all.
tap_text() {
    local attempt
    for attempt in 1 2 3 4; do
        dump
        if POS=$(bounds_of "$1"); then
            $ADB shell input tap $POS
            return 0
        fi
        $ADB shell input swipe 540 1700 540 1100 300 >/dev/null 2>&1 || true
        sleep 1
    done
    echo "  (text not found: $1)" >&2
    return 1
}

shot() {
    sleep "${2:-2}"
    $ADB exec-out screencap -p > "$OUT/$1.png"
    # Log the visible texts so the run log doubles as a per-shot verification
    # trail (the screenshots themselves can't be trusted to vision models).
    if dump; then
        python3 - "$1" <<'PY' 2>/dev/null || true
import re, sys
xml = open('/tmp/wayli-shot.xml').read()
texts = [t for t in dict.fromkeys(re.findall(r'text="([^"]+)"', xml)) if t.strip()][:6]
print(f"📸 {sys.argv[1]}   [{' | '.join(texts)}]")
PY
    else
        echo "📸 $1"
    fi
}

echo "– Resetting app into demo mode"
$ADB shell am force-stop com.android.chrome || true
$ADB shell input keyevent KEYCODE_HOME || true
sleep 1
$ADB shell pm clear "$PKG" >/dev/null
$ADB shell monkey -p "$PKG" 1 >/dev/null 2>&1
# pm clear can trigger a backup-restore of a previously configured instance
# (landing on Sign-in) — poll up to 30s for either entry point.
DEMO_ENTERED=0
for i in $(seq 1 15); do
    dump
    if POS=$(bounds_of "Try Demo"); then
        $ADB shell input tap $POS
        DEMO_ENTERED=1
        break
    fi
    if POS=$(bounds_of "Change server"); then
        $ADB shell input tap $POS
        sleep 3
        dump
        if POS=$(bounds_of "Try Demo"); then
            $ADB shell input tap $POS
            DEMO_ENTERED=1
            break
        fi
    fi
    sleep 2
done
[ "$DEMO_ENTERED" = "1" ] || { echo "Could not enter demo mode" >&2; exit 1; }
sleep 4

echo "– Capturing tour"
shot 01_home_at_a_glance 6            # Home: greeting, stats, recording, map card
$ADB shell input swipe 540 1700 540 800 400
shot 02_home_world_map 3              # Home: Where I've Been + trips carousel

tap_text "Travel" || true
shot 03_travel_trips 5                # Immersive trip cards
tap_text "With entries" || true
shot 04_travel_with_entries 2         # Entry filter active

# Open the first trip with entries — Southeast Asia Backpacking sorts first
# (newest start date) and is always on screen.
tap_text "Southeast Asia" || true
shot 05_trip_detail 6                 # Hero, meta chips, journal cards

tap_text "Arrival" || tap_text "Lisbon" || true
shot 06_entry_detail 4                # Entry read view

tap_text "Edit entry" || tap_text "Edit" || true
shot 07_entry_editor 3                # Editor (preview mode)

# Editor → entry detail → trip detail → travel list, then dock Home.
$ADB shell input keyevent 4; sleep 1; $ADB shell input keyevent 4; sleep 1; $ADB shell input keyevent 4; sleep 1
tap_text "Home" || true
tap_text "View statistics" || true
shot 08_statistics 4                  # Range label, mode shares, heatmap

$ADB shell input keyevent 4; sleep 1.5
tap_text "Wishlist" || true
shot 09_wishlist 3
tap_text "Map" || true
shot 10_wishlist_map 5                # Markers on the offline map

tap_text "List" || true
# The Add Place FAB is bottom-end and quirkily absent from the uiautomator
# semantics tree — tap its on-screen position directly (verified on the
# 1080×2400 emulator).
$ADB shell input tap 900 1900
shot 11_add_place_search 3            # Search + location helpers

$ADB shell input keyevent 4; sleep 1
tap_text "Settings" || true
shot 12_settings 3

tap_text "Home" || true
tap_text "Notifications" || true
shot 13_notifications 3 || true

echo
echo "Done — $(ls "$OUT" | wc -l) screenshots in $OUT"
