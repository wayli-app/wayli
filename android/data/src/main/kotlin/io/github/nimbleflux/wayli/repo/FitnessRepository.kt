package io.github.nimbleflux.wayli.repo

import io.github.nimbleflux.fluxbase.FluxbaseClient
import io.github.nimbleflux.fluxbase.from
import java.time.Instant
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

/**
 * A row of `fitness_activities` — the session summary written by the FIT
 * import job (mirrors the web `FitnessActivity` interface).
 */
@Serializable
data class FitnessActivity(
    val id: String,
    @SerialName("user_id") val userId: String? = null,
    val title: String? = null,
    val description: String? = null,
    val sport: String? = null,
    @SerialName("sub_sport") val subSport: String? = null,
    @SerialName("started_at") val startedAt: String = "",
    @SerialName("ended_at") val endedAt: String? = null,
    @SerialName("total_distance_m") val totalDistanceM: Double? = null,
    @SerialName("elapsed_time_s") val elapsedTimeS: Double? = null,
    @SerialName("moving_time_s") val movingTimeS: Double? = null,
    @SerialName("avg_heartrate") val avgHeartrate: Double? = null,
    @SerialName("max_heartrate") val maxHeartrate: Double? = null,
    @SerialName("avg_power") val avgPower: Double? = null,
    @SerialName("max_power") val maxPower: Double? = null,
    @SerialName("avg_cadence") val avgCadence: Double? = null,
    val calories: Double? = null,
    val manufacturer: String? = null,
    val product: String? = null,
    @SerialName("serial_number") val serialNumber: String? = null,
    @SerialName("source_file") val sourceFile: String? = null,
    /** Sharing audience override: "private" | "friends" | "public"; NULL = inherit the global default. */
    val visibility: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
)

/** Slim `tracker_data` row for the analyzer track. */
@Serializable
private data class TrackerTrackRow(
    @SerialName("recorded_at") val recordedAt: String,
    val location: JsonElement? = null,
    val altitude: Double? = null,
    /** km/h, derived by a DB trigger from consecutive-point geometry. */
    val speed: Double? = null,
)

/** Slim `fitness_records` row — per-point metrics keyed by recorded_at. */
@Serializable
private data class FitnessRecordRow(
    @SerialName("recorded_at") val recordedAt: String,
    @SerialName("heart_rate") val heartRate: Double? = null,
    val power: Double? = null,
    val cadence: Double? = null,
    @SerialName("cumulative_distance_m") val cumulativeDistanceM: Double? = null,
)

/**
 * One merged analyzer sample: a GPS fix joined (on recorded_at) with the
 * device metrics of the same instant. Speeds are km/h; distances meters.
 */
data class FitnessTrackPoint(
    val epochMs: Long,
    val lat: Double,
    val lon: Double,
    val altitude: Double? = null,
    val speed: Double? = null,
    /** ~30 s centered average of [speed] — charts and map colors use this. */
    val speedSmooth: Double? = null,
    /** Cumulative distance: device-reported, geometry fallback. */
    val distM: Double = 0.0,
    /** Device-reported cumulative distance before the fallback (nullable). */
    val fitDistM: Double? = null,
    val hr: Double? = null,
    val power: Double? = null,
    val cadence: Double? = null,
)

/**
 * Fitness activities (`fitness_activities`) + analyzer track loading — the
 * same data pipeline as the web's fitness pages: RLS-scoped table access via
 * the Fluxbase client, tracker_data + fitness_records merged on recorded_at.
 */
@Singleton
class FitnessRepository @Inject constructor(
    private val client: FluxbaseClient,
) {

    /** Activities newest-first (the list tab + prev/next navigation source). */
    suspend fun listActivities(limit: Int = 200): Result<List<FitnessActivity>> = runCatching {
        val result = client.from<FitnessActivity>("fitness_activities")
            .select()
            .order("started_at", ascending = false)
            .limit(limit)
            .execute()
        result.dataOrThrow() ?: emptyList()
    }

    suspend fun getActivity(id: String): Result<FitnessActivity?> = runCatching {
        client.from<FitnessActivity>("fitness_activities")
            .select()
            .eq("id", id)
            .maybeSingle()
            .data
    }

    /** Neighbour sessions (prev = earlier, next = later) for the detail top bar. */
    suspend fun getNeighbours(
        userId: String,
        startedAt: String,
    ): Result<Pair<FitnessActivity?, FitnessActivity?>> = runCatching {
        val prev = client.from<FitnessActivity>("fitness_activities")
            .select()
            .eq("user_id", userId)
            .lt("started_at", startedAt)
            .order("started_at", ascending = false)
            .limit(1)
            .execute()
            .dataOrThrow()?.firstOrNull()
        val next = client.from<FitnessActivity>("fitness_activities")
            .select()
            .eq("user_id", userId)
            .gt("started_at", startedAt)
            .order("started_at", ascending = true)
            .limit(1)
            .execute()
            .dataOrThrow()?.firstOrNull()
        prev to next
    }

    suspend fun updateActivity(id: String, title: String?, description: String?): Result<Unit> =
        runCatching {
            client.from<FitnessActivity>("fitness_activities")
                .eq("id", id)
                .update(mapOf("title" to title, "description" to description))
            Unit
        }

    /**
     * Set (or clear, when null) an activity's sharing audience override.
     * null = inherit the global fitness_sharing.default preference.
     */
    suspend fun updateVisibility(id: String, visibility: String?): Result<Unit> = runCatching {
        client.from<FitnessActivity>("fitness_activities")
            .eq("id", id)
            .update(mapOf("visibility" to visibility))
        Unit
    }

    suspend fun deleteActivity(id: String): Result<Unit> = runCatching {
        client.from<FitnessActivity>("fitness_activities").eq("id", id).delete()
        Unit
    }

    /**
     * Load the analyzer track: paginated `tracker_data` range read joined with
     * the activity's `fitness_records` on recorded_at, downsampled to ≤6000
     * points with ~30 s smoothed speed and a cumulative-distance series
     * (device-reported, haversine fallback). A port of the web `loadTrack()`.
     */
    suspend fun loadTrack(activity: FitnessActivity): Result<List<FitnessTrackPoint>> = runCatching {
        val from = activity.startedAt
        val to = activity.endedAt
            ?: Instant.parse(from).plusMillis(24L * 3600 * 1000).toString()

        // GPS fixes, paginated by 1000 (server caps any single response).
        val fixes = LinkedHashMap<String, FitnessTrackPoint>()
        var offset = 0
        while (true) {
            val batch = client.from<TrackerTrackRow>("tracker_data")
                .select("recorded_at, location, altitude, speed")
                .gte("recorded_at", from)
                .lte("recorded_at", to)
                .order("recorded_at", ascending = true)
                .range(offset, offset + PAGE_SIZE - 1)
                .execute()
                .dataOrThrow() ?: break
            for (row in batch) {
                val (lat, lon) = StatsAggregator.parseLocation(row.location) ?: continue
                fixes[row.recordedAt] = FitnessTrackPoint(
                    epochMs = runCatching { Instant.parse(row.recordedAt).toEpochMilli() }
                        .getOrElse { 0L },
                    lat = lat,
                    lon = lon,
                    altitude = row.altitude,
                    speed = row.speed,
                )
            }
            if (batch.size < PAGE_SIZE) break
            offset += PAGE_SIZE
        }

        // Per-point metrics, same pagination; joined on recorded_at equality.
        var mOffset = 0
        while (true) {
            val batch = client.from<FitnessRecordRow>("fitness_records")
                .select("recorded_at, heart_rate, power, cadence, cumulative_distance_m")
                .eq("activity_id", activity.id)
                .order("recorded_at", ascending = true)
                .range(mOffset, mOffset + PAGE_SIZE - 1)
                .execute()
                .dataOrThrow() ?: break
            for (row in batch) {
                fixes[row.recordedAt] = fixes[row.recordedAt]?.copy(
                    fitDistM = row.cumulativeDistanceM,
                    hr = row.heartRate,
                    power = row.power,
                    cadence = row.cadence,
                ) ?: continue
            }
            if (batch.size < PAGE_SIZE) break
            mOffset += PAGE_SIZE
        }

        var merged = fixes.values
            .filter { it.epochMs > 0 }
            .sortedBy { it.epochMs }

        // Downsample for rendering if enormous (keep the tail intact).
        val stride = maxOf(1, (merged.size + MAX_TRACK_POINTS - 1) / MAX_TRACK_POINTS)
        if (stride > 1) {
            merged = merged.filterIndexed { i, _ -> i % stride == 0 }
        }

        // ~30 s centered speed average (window scales with the stride).
        val halfWindow = maxOf(3, Math.round(15.0 / stride).toInt())
        val smoothed = movingAverage(merged.map { it.speed }, halfWindow)

        // Cumulative distance: prefer device-reported values, fall back to
        // geometry-derived for points (or files) without them.
        val geoDistances = cumulativeDistances(merged.map { it.lat to it.lon })
        var lastFit: Double? = null
        merged = merged.mapIndexed { i, p ->
            val fit = p.fitDistM ?: lastFit
            if (p.fitDistM != null) lastFit = p.fitDistM
            p.copy(
                speedSmooth = smoothed[i],
                distM = fit ?: geoDistances[i],
            )
        }
        merged
    }

    private companion object {
        const val PAGE_SIZE = 1000
        const val MAX_TRACK_POINTS = 6000
    }
}
