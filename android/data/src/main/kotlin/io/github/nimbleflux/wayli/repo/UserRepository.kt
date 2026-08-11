package io.github.nimbleflux.wayli.repo

import io.github.nimbleflux.fluxbase.FluxbaseClient
import io.github.nimbleflux.fluxbase.from
import io.github.nimbleflux.wayli.models.UserProfile
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Reads and updates the current user's profile in `user_profiles`. Updates use a
 * strict column whitelist — `role` is NEVER sent, mirroring the web app's
 * `updateProfile` guard against privilege escalation.
 */
@Singleton
class UserRepository @Inject constructor(
    private val client: FluxbaseClient,
) {
    suspend fun getProfile(userId: String): Result<UserProfile> = runCatching {
        val result = client.from<UserProfile>("user_profiles")
            .select()
            .eq("id", userId)
            .single()
        result.data ?: throw Exception("Profile not found")
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
