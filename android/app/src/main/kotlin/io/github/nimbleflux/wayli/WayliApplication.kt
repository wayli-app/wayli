package io.github.nimbleflux.wayli

import android.app.Application
import androidx.hilt.work.HiltWorkerFactory
import androidx.work.Configuration
import coil.ImageLoader
import coil.ImageLoaderFactory
import coil.decode.SvgDecoder
import coil.disk.DiskCache
import coil.memory.MemoryCache
import dagger.hilt.android.HiltAndroidApp
import org.maplibre.android.MapLibre
import javax.inject.Inject

/**
 * Wayli application — entry point for Hilt DI.
 * The fluxbase-kotlin SDK client is provided via FluxbaseModule.
 */
@HiltAndroidApp
class WayliApplication : Application(), ImageLoaderFactory, Configuration.Provider {

    @Inject
    lateinit var workerFactory: HiltWorkerFactory

    override fun onCreate() {
        super.onCreate()
        // MapLibre MUST be initialized before any MapView is created.
        // Doing it here guarantees it's ready before Compose renders the map.
        MapLibre.getInstance(this)
    }

    /** WorkManager on-demand init with the Hilt worker factory (GpsUploadWorker). */
    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder()
            .setWorkerFactory(workerFactory)
            .build()


    /**
     * Global Coil ImageLoader: crossfade so images glide in, a 25% memory
     * cache, and a 64 MB disk cache so remote trip/wishlist images don't
     * re-download. Also supports SVGs (for the logo) so any request works.
     */
    override fun newImageLoader(): ImageLoader =
        ImageLoader.Builder(this)
            .crossfade(true)
            .components { add(SvgDecoder.Factory()) }
            .memoryCache {
                MemoryCache.Builder(this)
                    .maxSizePercent(0.25)
                    .build()
            }
            .diskCache {
                DiskCache.Builder()
                    .directory(cacheDir.resolve("image_cache"))
                    .maxSizeBytes(64L * 1024 * 1024)
                    .build()
            }
            .build()
}
