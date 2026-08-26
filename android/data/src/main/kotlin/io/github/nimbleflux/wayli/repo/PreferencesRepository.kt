package io.github.nimbleflux.wayli.repo

import io.github.nimbleflux.fluxbase.FluxbaseClient
import io.github.nimbleflux.fluxbase.from
import io.github.nimbleflux.wayli.models.TripExclusion
import io.github.nimbleflux.wayli.models.UserPreferences
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.jsonObject

/**
 * Reads/writes the `user_preferences` row. `language`, `timezone`, and
 * `notifications_enabled` are columns; `units` lives inside the `preferences`
 * JSONB and is merged (not overwritten) to preserve any other keys.
 */
@Singleton
class PreferencesRepository @Inject constructor(
    private val client: FluxbaseClient,
) {
    suspend fun getPreferences(userId: String): Result<UserPreferences> = runCatching {
        val result = client.from<UserPreferences>("user_preferences")
            .select()
            .eq("user_id", userId)
            .maybeSingle()
        result.data ?: UserPreferences(userId = userId)
    }

    suspend fun updatePreferences(
        userId: String,
        language: String? = null,
        timezone: String? = null,
        notificationsEnabled: Boolean? = null,
        units: String? = null,
    ): Result<Unit> = runCatching {
        val fields = mutableMapOf<String, Any?>()
        language?.let { fields["language"] = it }
        timezone?.let { fields["timezone"] = it }
        notificationsEnabled?.let { fields["notifications_enabled"] = it }
        // units lives in the `preferences` JSONB — merge into the existing object.
        if (units != null) {
            val current = getPreferences(userId).getOrNull()?.preferences?.jsonObject ?: emptyMap()
            fields["preferences"] = JsonObject(current.toMutableMap().apply { put("units", JsonPrimitive(units)) })
        }
        if (fields.isNotEmpty()) {
            client.from<UserPreferences>("user_preferences").eq("user_id", userId).update(fields)
        }
    }

    /** Extract the `units` value ("metric"|"imperial") from the preferences JSONB. */
    fun unitsOf(prefs: UserPreferences): String? =
        prefs.preferences?.jsonObject?.get("units")?.let { (it as? JsonPrimitive)?.content }

    // ---- Trip exclusions (the `trip_exclusions` JSONB array on the same row) ----

    private val exclusionsSerializer = ListSerializer(TripExclusion.serializer())

    /** Read the user's trip-exclusion zones (empty if none set). */
    suspend fun getTripExclusions(userId: String): Result<List<TripExclusion>> = runCatching {
        val prefs = getPreferences(userId).getOrNull()
        val element = prefs?.tripExclusions
        when {
            element == null || element is JsonNull -> emptyList()
            else -> Json.decodeFromJsonElement(exclusionsSerializer, element)
        }
    }

    /**
     * Replace the whole trip-exclusion list (max 10). The full array is written
     * back to the `trip_exclusions` column.
     */
    suspend fun saveTripExclusions(userId: String, exclusions: List<TripExclusion>): Result<Unit> =
        runCatching {
            val array = Json.encodeToJsonElement(exclusionsSerializer, exclusions) as JsonArray
            client.from<UserPreferences>("user_preferences")
                .eq("user_id", userId)
                .update(mapOf("trip_exclusions" to array))
            Unit
        }
}
