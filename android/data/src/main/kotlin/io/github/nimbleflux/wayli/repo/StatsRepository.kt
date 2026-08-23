package io.github.nimbleflux.wayli.repo

import io.github.nimbleflux.fluxbase.FluxbaseClient
import io.github.nimbleflux.fluxbase.from
import io.github.nimbleflux.wayli.models.TrackerPoint
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.PairSerializer
import kotlinx.serialization.builtins.serializer
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
    private val cache: CacheStore,
) {

    /**
     * Fetch tracker points for a date range (for map rendering + stats).
     * Mirrors the web's tracker_data service with 1000-row pagination.
     */
    suspend fun fetchPoints(
        userId: String,
        startDate: String,
        endDate: String,
    ): Result<List<TrackerPoint>> =
        cache.withCacheList("points:$userId:$startDate:$endDate", TrackerPoint.serializer()) {
            fetchPointsLive(userId, startDate, endDate)
        }

    private suspend fun fetchPointsLive(
        userId: String,
        startDate: String,
        endDate: String,
    ): Result<List<TrackerPoint>> = runCatching {
        val result = client.from<TrackerPoint>("tracker_data")
            .select()
            .eq("user_id", userId)
            .gte("recorded_at", "${startDate}T00:00:00Z")
            .lte("recorded_at", "${endDate}T23:59:59Z")
            // Newest N points (web's client-side cap) — an ascending order
            // would keep the OLDEST 5000 and starve the recent-weeks heatmap.
            .order("recorded_at", ascending = false)
            .limit(5000)
            .execute()
        (result.data ?: emptyList()).reversed() // back to chronological order
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
    ): Result<List<Pair<Double, Double>>> =
        cache.withCache("track:$userId:$startDate:$endDate", ListSerializer(PairSerializer(Double.serializer(), Double.serializer()))) {
            runCatching {
                val result = client.from<TrackPoint>("tracker_data")
                    .select("location")
                    .eq("user_id", userId)
                    .gte("recorded_at", "${startDate}T00:00:00Z")
                    .lte("recorded_at", "${endDate}T23:59:59Z")
                    .order("recorded_at", ascending = false)
                    .limit(5000)
                    .execute()
                (result.data ?: emptyList())
                    .reversed()
                    .mapNotNull { StatsAggregator.parseLocation(it.location) }
            }
        }

    /**
     * Fetch daily activity summary for the activity calendar.
     */
    suspend fun fetchDailyActivity(
        userId: String,
        startDate: String,
        endDate: String,
    ): Result<List<DailyActivity>> =
        cache.withCacheList("daily:$userId:$startDate:$endDate", DailyActivity.serializer()) {
            runCatching {
                val result = client.from<DailyActivity>("tracker_daily_activity")
                    .select()
                    .eq("user_id", userId)
                    .gte("day", startDate)
                    .lte("day", endDate)
                    .order("day")
                    .execute()
                result.data ?: emptyList()
            }
        }

    /**
     * Activity calendar via RPC (server-side aggregation over
     * tracker_daily_activity) — the same call the web heatmap uses. Covers a
     * trailing window of [days] regardless of the selected range, so the
     * 12-week grid always has data even when the range is narrower.
     */
    suspend fun getActivityCalendar(
        userId: String,
        days: Int = 371,
    ): Result<List<DailyActivity>> =
        cache.withCacheList("calendar:$userId", DailyActivity.serializer()) {
            runCatching {
                val res = client.rpc.invoke(
                    "activity-calendar",
                    mapOf(
                        "user_id" to userId,
                        "days" to days,
                    ),
                    io.github.nimbleflux.fluxbase.rpc.RpcInvokeOptions(namespace = "wayli"),
                )
                res.error?.let { error(it.message ?: "activity-calendar failed") }
                parseCalendarRows(res.data?.result)
            }
        }

    /**
     * RPC results arrive as a JsonElement that may be an array of rows, a
     * JSON-encoded string, or nested — unwrap defensively (the web app does
     * the same).
     */
    private fun parseCalendarRows(result: kotlinx.serialization.json.JsonElement?): List<DailyActivity> {
        val element = when (result) {
            null -> return emptyList()
            is kotlinx.serialization.json.JsonPrimitive ->
                runCatching { kotlinx.serialization.json.Json.parseToJsonElement(result.content) }
                    .getOrElse { return emptyList() }
            else -> result
        }
        val array = when (element) {
            is kotlinx.serialization.json.JsonArray -> element
            is kotlinx.serialization.json.JsonObject ->
                element["result"] as? kotlinx.serialization.json.JsonArray
                    ?: element["rows"] as? kotlinx.serialization.json.JsonArray
                    ?: return emptyList()
            else -> return emptyList()
        }
        return array.mapNotNull { row ->
            runCatching {
                kotlinx.serialization.json.Json.decodeFromJsonElement(DailyActivity.serializer(), row)
            }.getOrNull()
        }
    }
}
