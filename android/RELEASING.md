# Releasing the Wayli Android App

## Release pipeline (automated)

The `Release` workflow (`.github/workflows/release.yml`) has a **Publish Android
APKs** toggle (`publish_android`, on by default). When enabled, every release
(RC or stable):

1. Builds signed `gplay` + `foss` release APKs **and the `gplay` AAB** at the
   release tag
2. Stamps `versionName` from the release version and `versionCode` from the date
3. Attaches `wayli-<version>-gplay.apk`, `wayli-<version>-foss.apk` and
   `wayli-<version>-gplay.aab` to the GitHub release

Without the keystore secrets (below) the job still runs and attaches **unsigned**
artifacts — set up signing before announcing a release.

### CI signing secrets
- `WAYLI_KEYSTORE_BASE64` — `base64 -w0 wayli-release.jks` output
- `WAYLI_KEYSTORE_PASSWORD`
- `WAYLI_KEY_ALIAS`
- `WAYLI_KEY_PASSWORD`

The app resolves `fluxbase-kotlin` from GitHub Packages using the workflow's
`GITHUB_TOKEN` (needs `packages: read`, granted by the job).

## Google Play deploy (manual pipeline)

After a release cut its artifacts, the **Play Deploy** workflow
(`.github/workflows/play-deploy.yml`) pushes the AAB to a Play track — manual
trigger only:

1. Actions → Play Deploy → Run workflow
2. Pick the release **tag** (e.g. `v2.5.0-rc.1`), the **track**
   (internal/alpha/beta/production; default `internal`) and the release
   status (`draft` keeps the release unreviewed in the track — recommended
   for a first look)
3. The job downloads `wayli-<version>-gplay.aab` from the GitHub release and
   uploads it together with the store metadata + screenshots in
   `fastlane/metadata/android/` via `fastlane supply`

Without the `PLAY_SERVICE_ACCOUNT_JSON` secret the workflow skips gracefully.

### One-time Play Console setup (you do this once, by hand)
1. Play Console → **All apps → Create app** with package
   `com.nimbleflux.wayli`.
2. **The API cannot create a release for an app that has none yet** — upload
   the first AAB manually once: Internal testing → Release → upload
   `wayli-<version>-gplay.aab` from the GitHub release. Enroll in
   **Play App Signing** when prompted (Google holds the app signing key; the
   upload keystore above stays ours).
3. Play Console → **Setup → API access** → link (or create) a Google Cloud
   service account with Play release permissions, create a JSON key.
4. Add the JSON as the repo secret **`PLAY_SERVICE_ACCOUNT_JSON`** (raw JSON
   contents, single line is fine).

From then on, every Play deploy is the manual button above — including
metadata and screenshot refreshes (already capped to Play's 8-per-device
screenshot limit in `fastlane/metadata/`).

## Signing

### Generate a release keystore
```bash
keytool -genkey -v -keystore wayli-release.jks \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias wayli
```

### Configure signing (local)
Add to `~/.gradle/gradle.properties`:
```
wayli.keystore.file=/path/to/wayli-release.jks
wayli.keystore.password=*****
wayli.key.alias=wayli
wayli.key.password=*****
```

### Configure signing (CI)
Set environment variables in GitHub Actions secrets:
- `WAYLI_KEYSTORE_FILE` — base64-encoded keystore file (decoded in CI)
- `WAYLI_KEYSTORE_PASSWORD`
- `WAYLI_KEY_ALIAS`
- `WAYLI_KEY_PASSWORD`

## Building a release APK/AAB

```bash
# Release AAB (for Google Play)
./gradlew :app:bundleGplayRelease

# Release APK (for F-Droid / GitHub Releases)
./gradlew :app:assembleFossRelease
```

## Google Play

Automated via the Play Deploy workflow — see "Google Play deploy" above.

## F-Droid

The `foss` flavor contains zero proprietary dependencies (no Google Play Services).

1. Build the `foss` release APK
2. Verify reproducibility (see below)
3. Submit/update the F-Droid metadata MR

### FOSS purity check
```bash
# Verify no Google dependencies in the foss flavor
./gradlew :app:dependencies --configuration fossDebugRuntimeClasspath | grep -i "google\|gms\|firebase"
# Should return nothing
```

## Reproducible builds

For F-Droid verification:
```bash
./gradlew :app:assembleFossRelease --no-build-cache --no-configuration-cache
sha256sum app/build/outputs/apk/foss/release/app-foss-release.apk
```

Pinned versions in `gradle/libs.versions.toml`. Gradle 8.11.1, JDK 21.
