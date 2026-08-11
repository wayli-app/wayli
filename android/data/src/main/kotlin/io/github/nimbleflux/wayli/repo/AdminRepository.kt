package io.github.nimbleflux.wayli.repo

import io.github.nimbleflux.fluxbase.FluxbaseClient
import io.github.nimbleflux.fluxbase.from
import io.github.nimbleflux.fluxbase.jobs.SubmitJobOptions
import io.github.nimbleflux.wayli.models.UserProfile
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * Server-admin operations. User listing is a direct `user_profiles` query (RLS
 * enforces admin access); add/update/delete go through the `admin-users` edge
 * function (`functions.invoke`, namespace `wayli`), which returns
 * `{ success: boolean, error?: string }`.
 *
 * Maintenance jobs are submitted via [FluxbaseClient.jobs] with namespace
 * `wayli` and the exact job names/payloads the web admin uses.
 */
@Singleton
class AdminRepository @Inject constructor(
    private val client: FluxbaseClient,
) {
    /** One page of users, newest first. */
    suspend fun listUsers(limit: Int = 100, offset: Int = 0): Result<List<UserProfile>> =
        runCatching {
            val result = client.from<UserProfile>("user_profiles")
                .select()
                .order("created_at", ascending = false)
                .range(offset, offset + limit - 1)
                .execute()
            result.data ?: emptyList()
        }

    /** Add a user via the `admin-users` edge function. */
    suspend fun addUser(
        email: String,
        firstName: String,
        lastName: String,
        password: String,
        role: String,
    ): Result<Unit> = invokeAdminAction(
        mapOf(
            "action" to "addUser",
            "email" to email,
            "firstName" to firstName,
            "lastName" to lastName,
            "password" to password,
            "role" to role,
        ),
    )

    /** Update a user's profile/role via the `admin-users` edge function. */
    suspend fun updateUser(
        userId: String,
        email: String,
        firstName: String,
        lastName: String,
        role: String,
    ): Result<Unit> = invokeAdminAction(
        mapOf(
            "action" to "updateUser",
            "userId" to userId,
            "email" to email,
            "firstName" to firstName,
            "lastName" to lastName,
            "role" to role,
        ),
    )

    /**
     * Delete a user. The web UI has no working delete handler, so the exact
     * server contract is unconfirmed — this sends `action: "deleteUser"` and
     * surfaces whatever the function returns.
     */
    suspend fun deleteUser(userId: String): Result<Unit> =
        invokeAdminAction(mapOf("action" to "deleteUser", "userId" to userId))

    private suspend fun invokeAdminAction(body: Map<String, String>): Result<Unit> = runCatching {
        val res = client.functions.invokeJson("admin-users", body = body, namespace = "wayli")
        val err = res.error
        if (err != null) throw Exception(err.message ?: "Request failed")
        val data = res.data
        if (!isSuccess(data)) {
            throw Exception(errorOf(data) ?: "Action failed")
        }
        Unit
    }

    private fun isSuccess(element: JsonElement?): Boolean =
        element?.jsonObject?.get("success")?.jsonPrimitive?.booleanOrNull == true

    private fun errorOf(element: JsonElement?): String? =
        element?.jsonObject?.get("error")?.jsonPrimitive?.contentOrNull

    // ---- Maintenance jobs (namespace = wayli) ----

    suspend fun refreshPlaceVisits(): Result<Unit> = submit("scheduled-detect-place-visits", emptyMap())
    suspend fun refreshDailyActivity(): Result<Unit> = submit("scheduled-refresh-daily-activity", emptyMap())
    suspend fun detectTransportModes(): Result<Unit> = submit("scheduled-detect-transport-mode", emptyMap())
    suspend fun reverseGeocodeAll(force: Boolean = false): Result<Unit> =
        if (force) submit("reverse-geocoding", mapOf("all_users" to true, "force" to true))
        else submit("reverse-geocoding", mapOf("all_users" to true))

    suspend fun fillCountryCodes(): Result<Unit> =
        submit("reverse-geocoding", mapOf("all_users" to true, "fill_country_codes_only" to true))

    suspend fun clearAndRebuildPlaceVisits(userId: String? = null): Result<Unit> =
        submit("clear-and-rebuild-place-visits", if (userId != null) mapOf("user_id" to userId) else emptyMap())

    private suspend fun submit(jobName: String, payload: Map<String, Any?>): Result<Unit> = runCatching {
        val filtered = payload.filterValues { it != null }
        client.jobs.submit(jobName, filtered, SubmitJobOptions(namespace = "wayli"))
        Unit
    }
}
