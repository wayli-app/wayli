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
        if (altitude != null) put("alt", altitude) else put("alt", JsonNull)
        if (accuracy != null) put("acc", accuracy) else put("acc", JsonNull)
        if (speed != null) put("vel", speed) else put("vel", JsonNull)
        if (heading != null) put("cog", ((heading % 360f) + 360f) % 360f) else put("cog", JsonNull)
        if (battery != null) put("batt", battery) else put("batt", JsonNull)
        // Activity-recognition hint (Wayli extension; ignored by real OwnTracks).
        if (activityType != null) put("act", activityType) else put("act", JsonNull)
    }
}
