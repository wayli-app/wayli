# Wayli Android App — Plan (parked)

> **Status**: PARKED. This plan was refined in detail during planning sessions and is
> captured here so work can resume cleanly. It is **blocked on** the
> [`fluxbase-kotlin`](https://github.com/nimbleflux/fluxbase) SDK (see
> `~/Dev/fluxbase/sdk-kotlin/`), which must be built first because Fluxbase's wire
> protocol is incompatible with Supabase-Kotlin. When the SDK ships its first stable
> release, pick this plan back up and refine further before implementation.

## Confirmed decisions (from planning)

| Decision | Choice |
|---|---|
| Platform | Native Android (Kotlin + Jetpack Compose). Android first; iOS a separate later effort. |
| MVP coverage | Full parity with the web app (~10 feature areas, including authoring). |
| Distribution | Google Play + F-Droid + GitHub Releases (APK). |
| Offline | Robust offline — local DB mirror + GPS queue + offline viewing + sync engine. |
| Tracker auth | Scoped device token (long-lived, GPS-scoped, revocable) — replaces the weak per-user API key. |
| Repo layout | `android/` directory in this (wayli) monorepo. |
| Design system | Material 3 + Wayli brand tokens (navy `#233869`, Inter font, card-heavy) with opt-in Material You. |
| Mobile-native v1 | On-device Activity Recognition + real Pedometer (STEP_COUNTER). |
| Deferred mobile-native | Geofencing, Share Intent, home-screen widgets (v1.1+). |
| SDK prerequisite | `fluxbase-kotlin` (full TS-parity), built first, consumed as a Maven dependency. |

---

## 1. Functional requirements

### Instance & account
- Connect to any self-hosted Wayli instance by URL **or QR pairing** (web emits QR
  `{baseUrl, anonKey, deviceToken}`). Health-check; fetch `getAuthConfig()`.
- Sign in/up with email/password, OAuth providers, **TOTP 2FA** (Fluxbase's custom
  `setup2FA`/`enable2FA`/`verify2FA` flow) — parity with `/dashboard/account-settings`.
- Forgot/reset/verify email.
- **First-user-becomes-admin bootstrap** works from mobile (fresh instance → first
  account is admin).
- **Companion-setup** screen links to deployment docs and checks service reachability
  (Postgres, Pelias). Deploying a server instance stays server-side (containers/k8s).

### GPS tracking (OwnTracks replacement — the core)
- Foreground service with persistent notification; start/stop; start-on-boot.
- Detailed, OwnTracks-grade configuration (see §5 matrix).
- **Robust offline capture**: buffer points locally when offline; batch-upload on
  reconnect (server `ignoreDuplicates` dedups by PK `(user_id, recorded_at)`).
- Live "today" map + live stats.
- Uploads use the **scoped device token** (not the full account JWT).
- **Battery optimization** throughout: adaptive sampling, coarse-gate, WorkManager
  constraints, Doze-aware.

### Browsing parity (read)
- Statistics / Where-I've-Been: date-range map with color-coded transport-mode
  polylines, clickable points, heatmap, exclusion zones, stat cards, activity
  calendar, mode-share, country-time, train-station visits, records/streaks.
- Transport-mode **segment editor** (relabel/correct).
- Trips list/detail; journal reader (markdown + photos + lightbox + likes/comments);
  trip planner (day-by-day, booking links, map, budget).
- Want-to-visit wishlist (map + grid, search/tap-add, ratings, labels, favorites).
- Discover (stories/travelers/feed), public profiles (`/u/[username]`), friends.
- Import/export via existing Jobs; data editor (raw point browser); notifications.

### Authoring parity (write)
- Trip CRUD (cover upload/Pexels, sharing & per-axis visibility, collaborators).
- Entry editor (markdown, photo gallery, cover+focal, draft/publish).
- Auto-detect trips (submit job, approve/reject pending suggestions).
- Wishlist CRUD, trip exclusions, data-sampling config, profile/avatar/cover editing.
- Admin settings (role-gated).

---

## 2. Non-functional requirements
- **Offline-first**: local Room DB is read source of truth; background sync reconciles.
- **Performance**: cold start < 2s; map renders 5000 points; UI never blocks on network.
- **Battery**: full-day "move" tracking < 10% (target; measured in CI device tests).
- **Privacy**: tokens in EncryptedSharedPreferences/Keystore; no third-party analytics;
  geocoding only to the instance's Pelias; no data leaves the chosen instance.
- **FOSS-eligible**: the `foss` flavor contains zero proprietary deps (F-Droid ready).
- **Extensibility**: multi-module, feature-flag-friendly, clean layered architecture.
- **Testability**: unit + integration + screenshot + E2E; coverage gates (≥70% core/data,
  ≥60% features).
- **Security**: scoped device tokens, constant-time server compare, revocable,
  EncryptedFile/Keystore, network security config, no token in query strings, optional
  cert pinning per instance.
- **i18n**: ship the web's 11 locales (`en, nl, es, de, fr, it, ja, ko, pt, ru, zh`).
- **Accessibility**: 48dp targets, TalkBack labels, dynamic type, high-contrast.

---

## 3. Architecture

```
┌─────────────────────────── Android app (Kotlin/Compose) ───────────────────────────┐
│  :app  (Compose UI, navigation, DI entry)                                            │
│   ├── flavor: gplay  (FusedLocationProvider, ActivityRecognitionClient, GMS steps)  │
│   └── flavor: foss   (framework LocationManager, system ActivityRecognition, sensor)│
│  :feature:*  (onboarding, tracking, stats, travel, wishlist, social, import, …)      │
│  :data       Room DB · repositories · sync engine · upload queue                     │
│  :sensors    ActivityRecognition + StepCounter (flavor-specific providers)           │
│  :gps-engine LocationStrategy · sampling rules · foreground service                 │
│  :core       design-system, models, utils                                            │
│        ↑ Fluxbase access via the fluxbase-kotlin SDK (Maven dep / composite build)   │
└──────────────────────────────────────────────────────────────────────────────────────┘
                    │ HTTPS (PostgREST + RPC + Functions + Realtime)
                    ▼
            Fluxbase (Supabase-compatible) → PostgreSQL 18 + PostGIS + RLS
```

- **Client = `fluxbase-kotlin`** (Maven dep `io.github.nimbleflux:fluxbase-kotlin`).
  No bespoke Fluxbase adapter in the app.
- Hilt DI; flavor-specific `LocationProvider`, `ActivityRecognitionProvider`,
  `StepCounterProvider` via `@FossApp`/`@GplayApp` qualifiers. The `foss` flavor uses
  the system ActivityRecognition API + Sensor `TYPE_STEP_COUNTER`; `gplay` uses GMS
  equivalents. `foss` stays Google-free.
- PostGIS: `GeoPoint(lon,lat)` ↔ `"SRID=4326;POINT(lon lat)"`; pagination honors the
  1000-row cap; renderer downsamples to 5000.

---

## 4. Core infrastructure (app)

### Offline-first (`:data`)
- **Room DB** mirrors read/written tables + sync metadata:
  `local_tracker_data` (`sync_state: PENDING|SYNCING|SYNCED|FAILED` + retry),
  `local_trips`, `local_trip_entries`, `local_trip_media`, `local_want_to_visit`,
  `local_place_visits`, `local_user_profile/preferences`, `local_notifications`,
  `local_daily_activity`, `device_tokens_cache`, `instance_profile`. Room is read
  source of truth. Full-text/indexes for offline search.
- **Sync engine**: WorkManager `CoroutineWorker`s:
  - `GpsUploadWorker` — drain PENDING → ingestion endpoint, device-token auth, backoff.
  - `TripsSyncWorker` — pull since `last_synced_at`, push dirty, last-write-wins via
    `updated_at`.
  - `MediaUploadWorker` — resumable, to `trip-images`.
- **Conflicts**: `tracker_data` idempotent by PK + server `ignoreDuplicates` (none);
  trips/entries `updated_at` server-wins-on-stale, user-prompted only if local newer.
- Realtime subscriptions refresh Room when online (job progress, notifications, friend
  entries).
- Notifications: in-app from `notifications` table (Realtime+poll). Native push = FCM
  (gplay) + UnifiedPush (foss); server fan-out hook is a small follow-up.

---

## 5. GPS engine — OwnTracks-grade config (`:gps-engine`)

Foreground service (`TrackingService`, persistent notification + "Stop" action +
tap→map + start-on-boot) reading user config → `LocationRequest`s.

| Setting | Range / options | Default |
|---|---|---|
| Tracking mode | Move / Significant / Manual | Move |
| Min update interval | 1s–60min | 30s |
| Min distance | 0–5000 m | 50 m |
| Desired accuracy | High / Balanced / Low / Power | Balanced |
| Stationary pause | off / 1–60 min | 5 min |
| Stationary resume radius | 25–1000 m | 100 m |
| Battery threshold (stop) | off / 5–50% | 15% |
| Only while charging | on/off | off |
| Payload toggles (alt/heading/speed/batt) | each | all on |
| Device label (`tid`) | text | model-based |
| Foreground notification | title/text | "Wayli tracking" |
| Start on boot | on/off | off |
| Exclusion zones | from `trip_exclusions` | — |
| Geofencing (deferred to v1.1) | `{name,lat,lon,radius,notify}` | — |

**Battery tactics**: adaptive sampling (faster while moving); coarse provider as
low-power wake gate; batch + coalesce sub-min-distance moves; WorkManager constraints
for non-critical syncs (unmetered+charging+idle); defer all heavy processing to server
Jobs (app uploads raw points only); Doze-aware. Permission flow: fg→bg→precise with
in-app rationale.

---

## 6. Mobile-native sensors (`:sensors`, in-scope v1)
- **Activity Recognition**: provider (system API on foss / `ActivityRecognitionClient`
  on gplay) → "in-vehicle / on-foot / on-bike / still / running / walking" attached to
  each `tracker_data` point as a high-confidence `transport_mode` hint + `activity_type`,
  feeding the live "today" map (instant mode color) and lightening server-side HMM
  detection. Paused while stationary (aligned with GPS stationary-pause).
- **Pedometer**: `StepCounterProvider` reads `TYPE_STEP_COUNTER` (cumulative hardware
  counter, near-zero extra battery) → daily step counts stored locally
  (`local_daily_activity.steps`) and surfaced in Stats, replacing the web's GPS-guessed
  steps with real pedometry. Counted even while tracking is off (passive sensor), with a
  dedicated "fitness tracking" toggle.

---

## 7. Screens — mobile-adapted design
Web = desktop-first left sidebar → mobile = **bottom tabs (5): Map · Travel · Discover ·
Wishlist · Settings** + top bar (wordmark, instance, notifications, avatar).

| Mobile screen(s) | Web source |
|---|---|
| Instance setup / QR pairing | (new) |
| Sign in/up/2FA/forgot/verify | `/auth/*` |
| Map (home) — live today map + today stats + tracking FAB | `/dashboard/location-data` (live slice) |
| Tracking settings (+ AR + Pedometer toggles) | (new, OwnTracks-grade) |
| Trips (list) / Trip detail / Journal reader / Entry editor | `/dashboard/travel` + public reader + `showEditor` |
| Trip planner / Auto-detect | `travel/[id]/plan` + `TripGenerationModal` |
| Stats / Where-I've-Been (+ segment editor, real steps) | `/dashboard/location-data` |
| Wishlist / Discover (stories/travelers/feed) / Public profile / Friends | `/dashboard/want-to-visit`, `/stories`, `/travelers`, `/dashboard/feed`, `/u/[user]`, `/dashboard/friends` |
| Import/Export / Data editor | `/dashboard/import-export`, `/dashboard/data-editor` |
| Connections/Devices (**device tokens**) | `/dashboard/connections` |
| Account settings (multi-screen) / Server admin / Notifications | `/dashboard/account-settings`, `/dashboard/server-admin-settings` |

**Map rendering**: MapLibre Native (vector tiles, FOSS, themeable to CartoDB look, both
flavors); optional gplay Google Maps behind a `MapRenderer` interface.

**Design system**: M3 (NavigationBar, Cards, Sheets, Scaffold); Wayli tokens into
`ColorScheme` (navy `#233869` / `#60a5fa`); self-hosted Inter; transport-mode palette
(car=red/train=purple/airplane=black/cycling=orange/walking=green/unknown=grey);
card-heavy `rounded-2xl`; opt-in Material You; dark + high-contrast; bottom sheets.

---

## 8. Backend modifications (additive, in existing `fluxbase/`)
No changes to `tracker_data`, RLS, Jobs, or existing RPCs.

### Device tokens (replaces the API-key)
- New table `device_tokens(id, user_id FK→auth.users, label, token_hash,
  scopes text[] default '{gps:write}', last_used_at, created_at, expires_at, revoked_at)`
  + RLS (owner SELECT/INSERT-revoke; service_role full).
- New RPCs: `create-device-token(label)` (returns plaintext once, stores SHA-256),
  `revoke-device-token(id)`, `list-device-tokens()`.
- Extend `owntracks-points.ts` to accept **either** legacy `?api_key=` (backward-compat)
  **or** `Authorization: Bearer <deviceToken>`: SHA-256 incoming, look up non-revoked,
  **constant-time compare**, set effective `user_id`, bump `last_used_at`, then run the
  unchanged geocode/enrich/upsert pipeline.

### QR pairing
Web Connections page emits QR with plaintext token (once).

### Optional activity/steps
- Add nullable population of the existing `tracker_data.activity_type` from app payload.
- Add a `steps` column to `tracker_daily_activity` (additive).

### Push fan-out
FCM (gplay) / UnifiedPush (foss) server hook — follow-up; v1 uses in-app + Realtime.

---

## 9. Testing
| Layer | Tools |
|---|---|
| Unit | JUnit5, MockK, Turbine, Kotest — repos, sync logic, GPS sampling, sensor fusion, PostGIS mappers, conflict resolution, token hashing |
| Room | Robolectric, MigrationTestHelper — DAO queries, sync-state transitions |
| App↔Fluxbase | MockWebServer against the fluxbase-kotlin contract; integration tests vs a live local Fluxbase |
| GPS + sensors | provider fakes — simulated streams, stationary pause/resume, battery threshold, exclusion filtering, AR-mode mapping |
| Compose UI | Compose UI tests + Paparigma screenshots — states × dark/light × locales × dynamic type |
| Integration | Hilt+Room+MockWebServer — offline→online sync, sensor→GPS→upload pipeline |
| E2E | Maestro — instance setup→sign in→track (walk/bike)→verify uploads+AR hints; create trip→entry+photo→publish; offline→reconnect→sync |
| Coverage | Kover gates (`:core`/`:data` ≥70%, `:feature:*` ≥60%) |
| Static | detekt, ktlint, Android Lint, LeakCanary, dependency-analysis plugin |
| FOSS purity | CI check: `foss` flavor tree contains no proprietary/com.google artifacts |

---

## 10. CI/CD (GitHub Actions, in this repo)
**PR/push to main** (`android-ci.yml`, on `android/**` changes): lint (detekt+ktlint+Lint,
both flavors) · unit-test (+Kover) · foss-purity-check · build (`gplayDebug`+`fossDebug`) ·
screenshot (Paparigma baseline diff).

**Tag `android-v*`** (`android-release.yml`): unit+lint gated → build-release (signed
`gplayRelease` AAB + `fossRelease` APK, version from tag) → publish-github-release (foss
APK + signed gplay APK) → publish-play (`fastlane supply`→internal/beta) → publish-fdroid
(metadata MR / reproducible verification; F-Droid builds foss from source).

Signing: keystores as GH secrets (base64). Reproducible: pin versions
(`libs.versions.toml`), `--no-build-cache`, fixed Gradle/JDK; publish APK for F-Droid
verification; document in `android/REPRODUCIBLE_BUILDS.md`. Caching: Gradle wrapper +
caches + config cache + Konan.

---

## 11. Phasing (Wayli app — after SDK ships)
- **B1 Foundations**: module skeleton, Hilt, design tokens, Room schema+mappers, instance
  setup+QR+auth+device-token (consuming fluxbase-kotlin).
- **B2 Tracking core** (OwnTracks-replacement): `:gps-engine` full config, fg service,
  `local_tracker_data`+`GpsUploadWorker`, live today map.
- **B3 Sensors**: Activity Recognition + Pedometer (both flavors), fusion into
  tracker_data + daily_activity + live map.
- **B4 Browsing parity (read)**: stats, trips, journal reader, wishlist, discover,
  profiles, friends (read), notifications, data editor.
- **B5 Authoring parity (write)**: trip/entry/media CRUD, planner, auto-detect, social,
  import/export, settings+admin.
- **B6 Hardening**: offline conflicts, battery profiling, sensor calibration, a11y pass,
  screenshot baselines (all locales), FOSS purity, F-Droid metadata.
- **B7 Release**: tag `android-v1.0.0` → GitHub → Play internal → F-Droid MR.

---

## 12. Risks & mitigations
- **Fluxbase wire divergence** → de-risked by the SDK (built first) + compat tests.
- **F-Droid reproducibility** → pinned versions + foss purity CI + documented recipe.
- **Battery drain** → adaptive sampling + coarse-gate + WorkManager constraints + passive
  step counter (near-zero cost) + AR suspended while stationary; CI battery test.
- **Background-kill (OEMs)** → fg service + onboarding to disable battery optimization +
  start-on-boot.
- **PostGIS edge cases** → unit tests for `POINT` round-trip; client-side clamps
  (`heading<360`, `speed≤1000`, `battery 0–100`).
- **Sensor availability** (foss devices without AR/step sensors) → graceful degradation:
  provider returns empty; UI hides dependent stats.
- **Token revoked while offline** → 401 → stop tracking + re-auth prompt.

---

## 13. Files to create/change (when implementation starts)
**In `/home/bart/dev/wayli`**: `android/` (full Gradle multi-module project as in §3).
`fluxbase/schema/public.sql` (additive `device_tokens` + optional
`tracker_daily_activity.steps`). `fluxbase/rpc/{create,revoke,list}-device-token.sql`.
`fluxbase/functions/owntracks-points.ts` (accept `Authorization: Bearer <deviceToken>`,
constant-time; preserve legacy `?api_key=`). `web/.../connections/+page.svelte` (Devices
section + QR pairing). `.github/workflows/android-{ci,release}.yml`.
`android/{README.md,REPRODUCIBLE_BUILDS.md}`.
