package io.github.nimbleflux.wayli.sync

import io.github.nimbleflux.wayli.db.PendingPointEntity
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Maps queued [PendingPointEntity]s to the OwnTracks batch payload accepted
 * by the `owntracks-points` function:
 * `{"points": [{"_type":"location","lat":…,"lon":…,"tst":…,"tid":…,…}]}`
 *
 * Pure function — unit-testable without Android.
 */
object OwnTracksPayloadMapper {

    fun toPayload(points: List<PendingPointEntity>): JsonObject = buildJsonObject {
        put("points", JsonArray(points.map { it.toOwnTracksLocation() }))
    }

    private fun PendingPointEntity.toOwnTracksLocation(): JsonObject = buildJsonObject {
        put("_type", "location")
        put("lat", lat)
        put("lon", lon)
        put("tst", recordedAtSec)
        put("tid", deviceId)
        altitude?.let { put("alt", it) } ?: put("alt", JsonNull)
        accuracy?.let { put("acc", it) } ?: put("acc", JsonNull)
        speed?.let { put("vel", it) } ?: put("vel", JsonNull)
        heading?.let { put("cog", ((it % 360f) + 360f) % 360f) } ?: put("cog", JsonNull)
        battery?.let { put("batt", it) } ?: put("batt", JsonNull)
    }
}
