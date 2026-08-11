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
server needed.

### Connecting to a real instance
1. Enter your Wayli instance URL (e.g., `https://flux.example.com`)
2. Enter the anon key (from your instance settings)
3. Sign in or create an account

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

## Release
See [RELEASING.md](RELEASING.md) for signing, publishing to Play/F-Droid, and
reproducible builds.
