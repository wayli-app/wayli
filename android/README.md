# Wayli Android App

A native Android client for [Wayli](https://github.com/nimbleflux/wayli), the
privacy-first self-hostable location tracking and trip analysis app.

## Quick start

### Prerequisites
- JDK 21
- Android SDK (API 35, build-tools 35.0.0)
- Android emulator or device

### Build
```bash
cd android

# Debug build (gplay flavor — Google Play Services)
./gradlew :app:assembleGplayDebug

# Debug build (foss flavor — no Google deps, F-Droid eligible)
./gradlew :app:assembleFossDebug

# Install on emulator/device
adb install app/build/outputs/apk/gplay/debug/app-gplay-debug.apk
```

### Demo mode
The app has a built-in demo mode for app store reviewers. On the instance setup
screen, tap **"Try Demo"** to explore the app with realistic sample data — no
server needed. The Play Store screenshots are generated from demo mode; see
[docs/SCREENSHOTS.md](docs/SCREENSHOTS.md).

### Connecting to a real instance
1. Enter your Wayli URL (e.g., `https://track.example.com`) — just the Wayli
   address; no keys needed. The app discovers the Fluxbase URL and anon key
   automatically: it checks the `wayli-app.json` manifest, then a
   `window.WAYLI_CONFIG` snippet in the landing page HTML, then
   `/api/v1/auth/config`.
2. If discovery fails (unusual setups), tap **Enter Fluxbase URL manually** and
   provide the backend URL and anon key yourself.
3. Sign in with OAuth (system browser) or e-mail + password.

For OAuth sign-in, the backend validates the app's redirect URI before
contacting the identity provider: add `wayli://oauth/callback` to the
**Redirect URIs** of your OAuth provider in the Wayli **server admin** (not only
in Authelia/your IdP), or sign-in will fail with "Server rejected the app's
redirect URI".

## Feature overview
Dashboard with "Where I've Been" world map, immersive trip covers with journal
entries and photo attachments, statistics (transport breakdown, activity
heatmap, countries), wishlist with place search, notifications center, a jobs
monitor with live logs, full offline caching (Room, serve-stale), app shortcuts
and a system share-target for quick capture. See
[docs/FEATURE_MATRIX.md](docs/FEATURE_MATRIX.md) for Android vs web parity.

## Architecture

```
:app          — Application, MainActivity, navigation, ViewModels, feature screens
:core         — Design system (Wayli theme), data models, demo data, session storage
:data         — Room DB, repositories (Trip, Wishlist, Stats), sync engine
:gps-engine   — TrackingService (foreground), LocationProvider, TrackingConfig
:sensors      — Activity Recognition + StepCounter providers (stubs)
```

**Build flavors**:
- `gplay` — Google Play Services (FusedLocationProvider, ActivityRecognitionClient)
- `foss` — Framework-only APIs (LocationManager, system ActivityRecognition) — zero Google deps

## SDK dependency
The app consumes `io.github.nimbleflux:fluxbase-kotlin` from GitHub Packages or
via composite build for local development. See `settings.gradle.kts`.

## Screenshots
Regenerate Play Store screenshots from the emulator (demo mode) with
`bash tools/screenshots.sh` — see [docs/SCREENSHOTS.md](docs/SCREENSHOTS.md).

## Release
See [RELEASING.md](RELEASING.md) for signing, publishing to Play/F-Droid, and
reproducible builds.
