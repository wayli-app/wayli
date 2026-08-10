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
        // fluxbase-kotlin SDK (GitHub Packages) — uncomment when gpr.user/gpr.key
        // are set in ~/.gradle/gradle.properties. For now, the composite build
        // below substitutes the dependency locally.
        // maven {
        //     url = uri("https://maven.pkg.github.com/nimbleflux/fluxbase")
        //     credentials {
        //         username = providers.gradleProperty("gpr.user").orNull
        //         password = providers.gradleProperty("gpr.key").orNull
        //     }
        // }
    }
}

// Dev: consume fluxbase-kotlin from source via composite build.
// Comment this out and enable the maven repo above to use the published version.
includeBuild("../../fluxbase/sdk-kotlin") {
    dependencySubstitution {
        substitute(module("io.github.nimbleflux:fluxbase-kotlin")).using(project(":"))
    }
}

include(":app", ":core", ":data", ":gps-engine", ":sensors")
