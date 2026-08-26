package io.github.nimbleflux.wayli.repo

import io.github.nimbleflux.fluxbase.FluxbaseClient
import io.github.nimbleflux.fluxbase.from
import io.github.nimbleflux.wayli.models.UserProfile
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

/**
 * Reads and updates the current user's profile in `user_profiles`. Updates use a
 * strict column whitelist — `role` is NEVER sent, mirroring the web app's
 * `updateProfile` guard against privilege escalation.
 */
@Singleton
class UserRepository @Inject constructor(
    private val client: FluxbaseClient,
    private val cache: CacheStore,
) {
    suspend fun getProfile(userId: String): Result<UserProfile> =
        cache.withCache("profile:$userId", UserProfile.serializer()) {
            runCatching {
                val result = client.from<UserProfile>("user_profiles")
                    .select()
                    .eq("id", userId)
                    .single()
                result.data ?: throw Exception("Profile not found")
            }
        }

    /**
     * Insert a `user_profiles` row when missing — the Android port of the
     * web's `ensureUserProfile`. Android sign-ups never created one, which
     * left the greeting stuck on "Traveler" forever (getProfile is a
     * `.single()`, so no row = hard failure). Idempotent: select first,
     * insert only when absent; names fall back to the OAuth session
     * metadata's full_name.
     */
    suspend fun ensureProfile(
        userId: String,
        firstName: String? = null,
        lastName: String? = null,
    ): Result<UserProfile?> = runCatching {
        val existing = client.from<UserProfile>("user_profiles")
            .select()
            .eq("id", userId)
            .maybeSingle()
        existing.error?.let { throw it }
        existing.data?.let { return@runCatching it }

        val fallback = sessionNames()
        val values = buildMap<String, Any?> {
            put("id", userId)
            put("first_name", (firstName ?: fallback?.first).orEmpty())
            put("last_name", (lastName ?: fallback?.second).orEmpty())
        }
        val inserted = client.from<UserProfile>("user_profiles").insert(values)
        inserted.error?.let { throw it }
        // Read back so server-side defaults (role, discoverable, …) are applied.
        client.from<UserProfile>("user_profiles")
            .select()
            .eq("id", userId)
            .maybeSingle()
            .data
    }

    /** OAuth identity providers stuff the display name into user metadata. */
    private fun sessionNames(): Pair<String?, String?>? {
        val metadata = client.auth?.currentSession?.user?.metadata as? JsonObject ?: return null
        val full = (metadata["full_name"] as? JsonPrimitive)?.contentOrNull
            ?: (metadata["name"] as? JsonPrimitive)?.contentOrNull
        if (!full.isNullOrBlank()) {
            val parts = full.trim().split(" ", limit = 2)
            return parts.first() to (parts.getOrNull(1) ?: "")
        }
        val first = (metadata["first_name"] as? JsonPrimitive)?.contentOrNull
        val last = (metadata["last_name"] as? JsonPrimitive)?.contentOrNull
        return if (first != null || last != null) first to last else null
    }

    /** Whitelisted profile update. Null fields are ignored; `role` is never sent. */
    suspend fun updateProfile(
        userId: String,
        firstName: String? = null,
        lastName: String? = null,
        username: String? = null,
        discoverable: String? = null,
        avatarUrl: String? = null,
    ): Result<Unit> = runCatching {
        val fields = buildMap<String, Any?> {
            firstName?.let { put("first_name", it) }
            lastName?.let { put("last_name", it) }
            username?.let { put("username", it) }
            discoverable?.let { put("discoverable", it) }
            avatarUrl?.let { put("avatar_url", it) }
        }
        if (fields.isNotEmpty()) {
            client.from<UserProfile>("user_profiles").eq("id", userId).update(fields)
        }
    }

    /** True if [username] is free or already owned by [currentUserId]. */
    suspend fun isUsernameAvailable(username: String, currentUserId: String): Result<Boolean> = runCatching {
        val result = client.from<UserProfile>("user_profiles")
            .select()
            .eq("username", username)
            .maybeSingle()
        val other = result.data
        other == null || other.id == currentUserId
    }
}
