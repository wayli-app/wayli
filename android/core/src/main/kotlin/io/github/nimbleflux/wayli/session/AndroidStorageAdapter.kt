package io.github.nimbleflux.wayli.session

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import io.github.nimbleflux.fluxbase.auth.StorageAdapter

/**
 * Android [StorageAdapter] backed by [EncryptedSharedPreferences].
 *
 * Stores the Fluxbase auth session (JWT + refresh token) encrypted at rest
 * using Android Keystore-backed AES-256. This is the Android equivalent of
 * the TS SDK's localStorage session persistence.
 */
class EncryptedStorageAdapter(context: Context) : StorageAdapter {
    private val prefs = run {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context,
            "wayli-auth-session",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    override fun getItem(key: String): String? = prefs.getString(key, null)

    override fun setItem(key: String, value: String) {
        prefs.edit().putString(key, value).apply()
    }

    override fun removeItem(key: String) {
        prefs.edit().remove(key).apply()
    }
}
