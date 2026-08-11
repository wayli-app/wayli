package io.github.nimbleflux.wayli.repo

import io.github.nimbleflux.fluxbase.FluxbaseClient
import io.github.nimbleflux.fluxbase.from
import io.github.nimbleflux.wayli.models.Trip
import io.github.nimbleflux.wayli.models.TripEntry
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Repository for trips and journal entries. Calls the Fluxbase SDK's PostgREST
 * query builder to fetch/create/update data.
 *
 * In B7 this will be backed by Room for offline-first access. For now, it goes
 * straight to the network via the SDK.
 */
@Singleton
class TripRepository @Inject constructor(
    private val client: FluxbaseClient,
) {

    /**
     * List the current user's trips, newest first.
     * Mirrors: client.from<Trip>("trips").select().order("created_at", ascending=false).execute()
     */
    suspend fun listTrips(userId: String): Result<List<Trip>> = runCatching {
        val result = client.from<Trip>("trips")
            .select()
            .eq("user_id", userId)
            .order("created_at", ascending = false)
            .execute()
        result.data ?: emptyList()
    }

    /**
     * Get a single trip by ID.
     */
    suspend fun getTrip(tripId: String): Result<Trip> = runCatching {
        val result = client.from<Trip>("trips")
            .select()
            .eq("id", tripId)
            .single()
        result.data ?: throw Exception("Trip not found")
    }

    /**
     * Create a new trip.
     */
    suspend fun createTrip(
        userId: String,
        title: String,
        startDate: String,
        endDate: String? = null,
        description: String? = null,
        visibility: String = "private",
    ): Result<Trip> = runCatching {
        val values = buildMap {
            put("user_id", userId)
            put("title", title)
            put("start_date", startDate)
            put("status", "active")
            put("visibility", visibility)
            endDate?.let { put("end_date", it) }
            description?.let { put("description", it) }
        }
        client.from<Trip>("trips").insert(values)
        // The insert response doesn't return the created row in PostgREST by default;
        // re-query for it. In a follow-up we'll add ?select=* to the insert.
        listTrips(userId).getOrThrow().first { it.title == title }
    }

    /**
     * Create a journal entry for a trip.
     */
    suspend fun createEntry(tripId: String, title: String, entryDate: String, body: String?): Result<TripEntry> =
        runCatching {
            val values = buildMap<String, Any> {
                put("trip_id", tripId)
                put("title", title)
                put("entry_date", entryDate)
                put("status", "published")
                body?.takeIf { it.isNotBlank() }?.let { put("body", it) }
            }
            client.from<TripEntry>("trip_entries").insert(values)
            // Re-query (PostgREST insert doesn't return the row by default).
            listEntries(tripId).getOrThrow().first { it.title == title }
        }

    /**
     * List journal entries for a trip.
     */
    suspend fun listEntries(tripId: String): Result<List<TripEntry>> = runCatching {
        val result = client.from<TripEntry>("trip_entries")
            .select()
            .eq("trip_id", tripId)
            .order("entry_date")
            .execute()
        result.data ?: emptyList()
    }

    /**
     * Delete a trip.
     */
    suspend fun deleteTrip(tripId: String): Result<Unit> = runCatching {
        client.from<Trip>("trips").eq("id", tripId).delete()
    }
}
