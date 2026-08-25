package io.github.nimbleflux.wayli.repo

import io.github.nimbleflux.fluxbase.FluxbaseClient
import io.github.nimbleflux.fluxbase.settings.UserSecretMetadata
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Manages encrypted Fluxbase user secrets (`settings.setUserSecret` /
 * `listUserSecrets` / `deleteUserSecret`). Secret *values* are write-only — the
 * API only ever returns metadata (key, description, updated_at). Used for the
 * OwnTracks API key and the per-user Pexels API key.
 */
@Singleton
class SecretsRepository @Inject constructor(
    private val client: FluxbaseClient,
) {
    /** List metadata for all of the current user's secrets. */
    suspend fun listSecrets(): Result<List<UserSecretMetadata>> = runCatching {
        val response = client.settings.listUserSecrets()
        // `data ?: emptyList()` would mask a 401/404/network failure as "no
        // secrets configured" — the Connections screen then shows 'Not
        // configured' for keys that exist. Propagate the error instead.
        response.error?.let { throw it }
        response.data ?: emptyList()
    }

    /** Metadata for a single key, or null if it isn't set. */
    suspend fun getSecret(key: String): Result<UserSecretMetadata?> = runCatching {
        listSecrets().getOrDefault(emptyList()).firstOrNull { it.key == key }
    }

    /** True when a secret with [key] has been stored. */
    suspend fun hasSecret(key: String): Boolean =
        getSecret(key).getOrNull() != null

    /** Set (or replace) an encrypted user secret. */
    suspend fun setSecret(key: String, value: String, description: String? = null): Result<Unit> =
        runCatching { client.settings.setUserSecret(key, value, description) }

    /** Delete an encrypted user secret. */
    suspend fun deleteSecret(key: String): Result<Unit> =
        runCatching { client.settings.deleteUserSecret(key) }
}
