package io.github.nimbleflux.wayli.repo

import io.github.nimbleflux.fluxbase.FluxbaseClient
import io.github.nimbleflux.fluxbase.from
import io.github.nimbleflux.wayli.models.TrackerPoint
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import javax.inject.Inject
import javax.inject.Singleton

@Serializable
data class DailyActivity(
    @SerialName("user_id") val userId: String = "",
    val day: String,
    /** Meters. */
    val distance: Double? = null,
    /** Seconds. */
    @SerialName("time_spent") val timeSpent: Double? = null,
    val points: Int? = null,
)

/** Slim tracker_data row for polyline rendering — only the location column. */
@Serializable
data class TrackPoint(val location: kotlinx.serialization.json.JsonElement? = null)

@Singleton
class StatsRepository @Inject constructor(
    private val client: FluxbaseClient,
) {

    /**
     * Fetch tracker points for a date range (for map rendering + stats).
     * Mirrors the web's tracker_data service with 1000-row pagination.
     */
    suspend fun fetchPoints(
        userId: String,
        startDate: String,
        endDate: String,
    ): Result<List<TrackerPoint>> = runCatching {
        val result = client.from<TrackerPoint>("tracker_data")
            .select()
            .eq("user_id", userId)
            .gte("recorded_at", "${startDate}T00:00:00Z")
            .lte("recorded_at", "${endDate}T23:59:59Z")
            .order("recorded_at")
            .limit(5000) // Match web's client-side cap
            .execute()
        result.data ?: emptyList()
    }

    /**
     * Fetch just the track coordinates for a date range — a fraction of the
     * payload of [fetchPoints] (18 columns → 1), used for map polylines.
     * Returns ordered (lat, lng) pairs.
     */
    suspend fun fetchTrack(
        userId: String,
        startDate: String,
        endDate: String,
    ): Result<List<Pair<Double, Double>>> = runCatching {
        val result = client.from<TrackPoint>("tracker_data")
            .select("location")
            .eq("user_id", userId)
            .gte("recorded_at", "${startDate}T00:00:00Z")
            .lte("recorded_at", "${endDate}T23:59:59Z")
            .order("recorded_at")
            .limit(5000)
            .execute()
        (result.data ?: emptyList()).mapNotNull { StatsAggregator.parseLocation(it.location) }
    }

    /**
     * Fetch daily activity summary for the activity calendar.
     */
    suspend fun fetchDailyActivity(
        userId: String,
        startDate: String,
        endDate: String,
    ): Result<List<DailyActivity>> = runCatching {
        val result = client.from<DailyActivity>("tracker_daily_activity")
            .select()
            .eq("user_id", userId)
            .gte("day", startDate)
            .lte("day", endDate)
            .order("day")
            .execute()
        result.data ?: emptyList()
    }

    /**
     * Get the activity-calendar data via RPC (server-side aggregation).
     */
    suspend fun getActivityCalendar(
        userId: String,
        startDate: String,
        endDate: String,
    ): Result< kotlinx.serialization.json.JsonElement> = runCatching {
        val result = client.rpc.invoke(
            "activity-calendar",
            mapOf(
                "user_id" to userId,
                "start_date" to startDate,
                "end_date" to endDate,
            ),
            io.github.nimbleflux.fluxbase.rpc.RpcInvokeOptions(namespace = "wayli"),
        )
        result.data?.result ?: kotlinx.serialization.json.JsonNull
    }
}
