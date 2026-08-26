package io.github.nimbleflux.wayli.demo

import android.content.Context
import android.content.SharedPreferences

/**
 * Controls demo mode — when enabled, the app shows fake data instead of
 * connecting to a live Wayli instance. Used for app store review and
 * first-run exploration.
 *
 * Enable: tap "Try Demo" on the instance setup screen.
 * Disable: "Exit demo" in Settings (clears the demo flag only — instance
 * config and any real session are untouched by demo mode).
 */
class DemoManager(context: Context) {
    private val prefs: SharedPreferences =
        context.getSharedPreferences("wayli-demo", Context.MODE_PRIVATE)

    val isDemoMode: Boolean get() = prefs.getBoolean(KEY_DEMO_MODE, false)

    fun enableDemoMode() {
        prefs.edit().putBoolean(KEY_DEMO_MODE, true).apply()
    }

    fun disableDemoMode() {
        prefs.edit().putBoolean(KEY_DEMO_MODE, false).apply()
    }

    companion object {
        private const val KEY_DEMO_MODE = "demo_mode"
    }
}
