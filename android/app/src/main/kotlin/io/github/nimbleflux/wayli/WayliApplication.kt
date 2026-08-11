package io.github.nimbleflux.wayli

import android.app.Application
import dagger.hilt.android.HiltAndroidApp
import org.maplibre.android.MapLibre

/**
 * Wayli application — entry point for Hilt DI.
 * The fluxbase-kotlin SDK client is provided via FluxbaseModule.
 */
@HiltAndroidApp
class WayliApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        // MapLibre MUST be initialized before any MapView is created.
        // Doing it here guarantees it's ready before Compose renders the map.
        MapLibre.getInstance(this)
    }
}
