plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.hilt)
    alias(libs.plugins.ksp)
    alias(libs.plugins.detekt)
}

android {
    namespace = "io.github.nimbleflux.wayli"
    compileSdk = 35

    defaultConfig {
        applicationId = "io.github.nimbleflux.wayli"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    flavorDimensions += "distribution"
    productFlavors {
        create("gplay") {
            dimension = "distribution"
            // Google Play flavor: may use Google Play Services
        }
        create("foss") {
            dimension = "distribution"
            // FOSS flavor: zero proprietary dependencies (F-Droid eligible)
        }
    }

    buildTypes {
        debug { }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
            // Signing: read keystore from env vars (CI) or gradle.properties (local).
            // For local release builds, create a debug-compatible keystore or
            // set WAYLI_KEYSTORE_FILE, WAYLI_KEYSTORE_PASSWORD, WAYLI_KEY_ALIAS,
            // WAYLI_KEY_PASSWORD in ~/.gradle/gradle.properties.
            val keystoreFile = providers.gradleProperty("wayli.keystore.file").orNull
                ?: System.getenv("WAYLI_KEYSTORE_FILE")
            if (keystoreFile != null) {
                signingConfig = signingConfigs.create("release") {
                    storeFile = file(keystoreFile)
                    storePassword = providers.gradleProperty("wayli.keystore.password").orNull
                        ?: System.getenv("WAYLI_KEYSTORE_PASSWORD")
                    keyAlias = providers.gradleProperty("wayli.key.alias").orNull
                        ?: System.getenv("WAYLI_KEY_ALIAS")
                    keyPassword = providers.gradleProperty("wayli.key.password").orNull
                        ?: System.getenv("WAYLI_KEY_PASSWORD")
                }
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_21
        targetCompatibility = JavaVersion.VERSION_21
    }

    kotlin {
        jvmToolchain(21)
    }

    buildFeatures {
        compose = true
    }
}

dependencies {
    implementation(project(":core"))
    implementation(project(":data"))
    implementation(project(":gps-engine"))
    implementation(project(":sensors"))

    // Compose
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.ui.graphics)
    implementation(libs.compose.ui.tooling.preview)
    implementation(libs.compose.material3)
    implementation(libs.compose.material.icons)
    implementation(libs.activity.compose)
    implementation(libs.lifecycle.viewmodel.compose)
    implementation(libs.lifecycle.runtime.compose)
    debugImplementation(libs.compose.ui.tooling)

    // Navigation
    implementation(libs.navigation.compose)

    // Hilt
    implementation(libs.hilt.android)
    ksp(libs.hilt.compiler)
    implementation(libs.hilt.navigation.compose)
    implementation(libs.hilt.work)
    ksp(libs.hilt.androidx.compiler)

    // WorkManager
    implementation(libs.work.runtime)

    // Fluxbase SDK
    implementation(libs.fluxbase.kotlin)

    // Kotlinx
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.datetime)

    // Image loading (Coil + SVG support for logo)
    implementation(libs.coil.compose)
    implementation(libs.coil.svg)

    // MapLibre (needed in :app for WayliApplication.onCreate initialization)
    implementation(libs.maplibre.android)

    // Testing
    testImplementation(libs.kotlin.test)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.mockk)
    testImplementation(libs.turbine)

    // gplay-only dependencies
    "gplayImplementation"(libs.play.services.location)
}

detekt {
    buildUponDefaultConfig = true
    config.setFrom(files("$rootDir/detekt.yml"))
}
