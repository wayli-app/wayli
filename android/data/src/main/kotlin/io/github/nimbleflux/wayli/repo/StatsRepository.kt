package io.github.nimbleflux.wayli.repo

import io.github.nimbleflux.fluxbase.FluxbaseClient
import io.github.nimbleflux.fluxbase.from
import io.github.nimbleflux.wayli.models.TrackerPoint
import kotlinx.serialization.Serializable
import javax.inject.Inject
import javax.inject.Singleton

@Serializable
data class DailyActivity(
    val userId: String,
    val day: String,
    val distance: Double? = null,
    val timeSpent: Double? = null,
    val points: Int? = null,
)

@Singleton
class StatsRepository @Inject constructor(
    private val client: dagger.Lazy<FluxbaseClient?>,
) {
    private fun flux() = client.get()
        ?: throw IllegalStateException("FluxbaseClient not configured")

    /**
     * Fetch tracker points for a date range (for map rendering + stats).
     * Mirrors the web's tracker_data service with 1000-row pagination.
     */
    suspend fun fetchPoints(
        userId: String,
        startDate: String,
        endDate: String,
    ): Result<List<TrackerPoint>> = runCatching {
        val result = flux().from<TrackerPoint>("tracker_data")
            .select()
            .eq("user_id", userId)
            .gte("recorded_at", startDate)
            .lte("recorded_at", endDate)
            .order("recorded_at")
            .limit(5000) // Match web's client-side cap
            .execute()
        result.data ?: emptyList()
    }

    /**
     * Fetch daily activity summary for the activity calendar.
     */
    suspend fun fetchDailyActivity(
        userId: String,
        startDate: String,
        endDate: String,
    ): Result<List<DailyActivity>> = runCatching {
        val result = flux().from<DailyActivity>("tracker_daily_activity")
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
        val result = flux().rpc.invoke(
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
