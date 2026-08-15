# Releasing the Wayli Android App

## Release pipeline (automated)

The `Release` workflow (`.github/workflows/release.yml`) has a **Publish Android
APKs** toggle (`publish_android`, on by default). When enabled, every release
(RC or stable):

1. Builds signed `gplay` + `foss` release APKs at the release tag
2. Stamps `versionName` from the release version and `versionCode` from the date
3. Attaches `wayli-<version>-gplay.apk` / `wayli-<version>-foss.apk` to the GitHub release

Without the keystore secrets (below) the job still runs and attaches **unsigned**
APKs — set up signing before announcing a release.

### CI signing secrets
- `WAYLI_KEYSTORE_BASE64` — `base64 -w0 wayli-release.jks` output
- `WAYLI_KEYSTORE_PASSWORD`
- `WAYLI_KEY_ALIAS`
- `WAYLI_KEY_PASSWORD`

The app resolves `fluxbase-kotlin` from GitHub Packages using the workflow's
`GITHUB_TOKEN` (needs `packages: read`, granted by the job).

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

1. Build the `gplay` release AAB
2. Upload to Play Console → Internal testing
3. Promote to production after review

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
