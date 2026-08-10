package io.github.nimbleflux.wayli

import android.app.Application
import dagger.hilt.android.HiltAndroidApp

/**
 * Wayli application — entry point for Hilt DI.
 * The fluxbase-kotlin SDK client will be provided here in B2 (auth module).
 */
@HiltAndroidApp
class WayliApplication : Application()
