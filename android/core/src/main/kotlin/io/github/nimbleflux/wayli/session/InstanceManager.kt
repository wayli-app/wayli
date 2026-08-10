package io.github.nimbleflux.wayli.session

import android.content.Context
import android.content.SharedPreferences

/**
 * Stores the Wayli instance configuration (URL + anon key) that the user
 * enters during onboarding. Persists across app restarts via SharedPreferences.
 *
 * The anon key is the Fluxbase pre-signed JWT with `role: "anon"` — it's not
 * a secret (it's embedded in the web app's HTML), but we store it here so the
 * FluxbaseClient can be reconstructed on app launch.
 */
class InstanceManager(context: Context) {
    private val prefs: SharedPreferences =
        context.getSharedPreferences("wayli-instance", Context.MODE_PRIVATE)

    data class InstanceConfig(
        val url: String,
        val anonKey: String,
    )

    fun getConfig(): InstanceConfig? {
        val url = prefs.getString(KEY_URL, null) ?: return null
        val anonKey = prefs.getString(KEY_ANON_KEY, null) ?: return null
        return InstanceConfig(url, anonKey)
    }

    fun setConfig(url: String, anonKey: String) {
        prefs.edit()
            .putString(KEY_URL, url.trimEnd('/'))
            .putString(KEY_ANON_KEY, anonKey)
            .apply()
    }

    fun clear() {
        prefs.edit().clear().apply()
    }

    val isConfigured: Boolean get() = getConfig() != null

    companion object {
        private const val KEY_URL = "instance_url"
        private const val KEY_ANON_KEY = "instance_anon_key"
    }
}
