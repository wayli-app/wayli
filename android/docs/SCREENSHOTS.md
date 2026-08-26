# Play Store Screenshots

Play Console screenshots are generated automatically from the emulator in
**demo mode** — no real account or server is involved.

## Captured screenshots

PNGs land in `fastlane/metadata/android/en-US/images/phoneScreenshots/`
(1080×2400, phone form factor):

| File | Screen |
| --- | --- |
| `01_home_at_a_glance.png` | Home dashboard — stats cards + recent map |
| `02_home_world_map.png` | Home — "Where I've Been" world map |
| `03_travel_trips.png` | Travel — immersive trip covers |
| `04_travel_with_entries.png` | Travel — "with entries" filter (all demo trips have entries) |
| `05_trip_detail.png` | Trip detail — hero cover, route map, journal timeline |
| `06_entry_detail.png` | Journal entry with hero photo |
| `07_entry_editor.png` | Entry editor with photo attachments |
| `08_statistics.png` | Statistics — charts, transport breakdown, heatmap |
| `09_wishlist.png` | Wishlist — list view |
| `10_wishlist_map.png` | Wishlist — map view with markers |
| `11_add_place_search.png` | Add-place sheet — Pelias search + location helpers |
| `12_settings.png` | Settings — demo mode banner, appearance |
| `13_notifications.png` | Notifications center |

## Regenerating

```bash
cd android
./gradlew :app:assembleGplayDebug
bash tools/screenshots.sh        # or: make screenshots
```

Requirements:
- A running emulator at 1080×2400 (e.g. Pixel 7, API 35) visible as
  `emulator-5554` in `adb devices`.
- The gplay debug APK built (script installs it).

The script wipes app data, taps **Try Demo** on the setup screen, then drives
every screen with `adb` + `uiautomator dump` (tap targets are resolved from the
accessibility tree, with scroll-aware retries) and captures each screen with
`adb exec-out screencap`. Each captured shot logs its visible texts to stdout —
scan the log line `📸 <name> [<texts>]` to verify every PNG shows the right
screen.

Quirks the script already handles (don't "fix" these away):
- `pm clear` triggers auto-backup restore, which can land on the Sign-in screen
  instead of setup — the script polls for either and taps "Change server" →
  "Try Demo" when needed.
- Chrome can steal the foreground after `pm clear`; the script force-stops it
  and returns HOME first.
- Dock labels sit near the gesture bar; taps are nudged up so they register.
- The wishlist **Add Place** FAB is oddly absent from the uiautomator semantics
  tree, so the script taps its fixed on-screen position (900, 1900 on 1080×2400).

## Uploading to Play Console

- Play Console accepts **max 8 phone screenshots** per release — pick the best 8
  of the 13 (suggested: 01, 03, 04, 05, 06, 08, 09, 10).
- Still manual design items (not generatable): **hi-res icon** (512×512 PNG,
  32-bit alpha) and **feature graphic** (1024×500) in the same `fastlane` tree.
- Demo data keeps all images on Unsplash URLs — the emulator needs network
  access on first capture so images warm up before the shot is taken (the
  script waits for content to settle).
