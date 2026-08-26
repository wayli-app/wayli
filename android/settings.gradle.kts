rootProject.name = "wayli"

pluginManagement {
    repositories {
        google()
        gradlePluginPortal()
        mavenCentral()
    }
}

dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
        // fluxbase-kotlin SDK (GitHub Packages). Requires auth even for public
        // packages — credentials resolve from (in order):
        //   1. ~/.gradle/gradle.properties: gpr.user / gpr.key
        //   2. env: GPR_USER / GPR_TOKEN
        //   3. env: GITHUB_ACTOR / GITHUB_TOKEN (what CI provides)
        // For local development from source instead, pass -PuseLocalSdk.
        maven {
            url = uri("https://maven.pkg.github.com/nimbleflux/fluxbase")
            credentials {
                username = providers.gradleProperty("gpr.user").orNull
                    ?: System.getenv("GPR_USER")
                    ?: System.getenv("GITHUB_ACTOR")
                password = providers.gradleProperty("gpr.key").orNull
                    ?: System.getenv("GPR_TOKEN")
                    ?: System.getenv("GITHUB_TOKEN")
            }
            content {
                includeGroup("io.github.nimbleflux")
            }
        }
    }
}

// Consume fluxbase-kotlin from local source when explicitly requested
// (-PuseLocalSdk) or when no GitHub Packages credentials are available
// (plain local checkout without gpr.user/gpr.key or GITHUB_* env vars).
// CI always has GITHUB_TOKEN and resolves the published artifact.
val gprUser = providers.gradleProperty("gpr.user").orNull
    ?: System.getenv("GPR_USER")
    ?: System.getenv("GITHUB_ACTOR")
val gprToken = providers.gradleProperty("gpr.key").orNull
    ?: System.getenv("GPR_TOKEN")
    ?: System.getenv("GITHUB_TOKEN")

if (
    providers.gradleProperty("useLocalSdk").isPresent ||
    ((gprUser == null || gprToken == null) && file("../../fluxbase/sdk-kotlin").exists())
) {
    println(
        "wayli: using LOCAL fluxbase-kotlin source (../../fluxbase/sdk-kotlin). " +
            "Set gpr.user/gpr.key in ~/.gradle/gradle.properties to use the published artifact.",
    )
    includeBuild("../../fluxbase/sdk-kotlin") {
        dependencySubstitution {
            substitute(module("io.github.nimbleflux:fluxbase-kotlin")).using(project(":"))
        }
    }
}

include(":app", ":core", ":data", ":gps-engine", ":sensors")
