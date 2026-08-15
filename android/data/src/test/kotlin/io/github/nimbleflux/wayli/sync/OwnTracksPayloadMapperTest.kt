package io.github.nimbleflux.wayli.sync

import io.github.nimbleflux.wayli.db.PendingPointEntity
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

class OwnTracksPayloadMapperTest {

    private fun point(
        id: Long = 1,
        lat: Double = 52.1,
        lon: Double = 5.2,
        tst: Long = 1_700_000_000L,
        alt: Double? = 12.0,
        acc: Float? = 8f,
        vel: Float? = 3.5f,
        cog: Float? = 350f,
        batt: Int? = 88,
        deviceId: String = "pixel",
    ) = PendingPointEntity(
        id = id, lat = lat, lon = lon, recordedAtSec = tst,
        altitude = alt, accuracy = acc, speed = vel, heading = cog,
        battery = batt, deviceId = deviceId,
    )

    @Test
    fun `payload wraps points with OwnTracks field names`() {
        val payload = OwnTracksPayloadMapper.toPayload(listOf(point())).jsonObject
        val row = payload["points"]!!.jsonArray[0].jsonObject

        assertEquals("location", row["_type"]!!.jsonPrimitive.content)
        assertEquals(52.1, row["lat"]!!.jsonPrimitive.content.toDouble())
        assertEquals(5.2, row["lon"]!!.jsonPrimitive.content.toDouble())
        assertEquals(1_700_000_000L, row["tst"]!!.jsonPrimitive.content.toLong())
        assertEquals("pixel", row["tid"]!!.jsonPrimitive.content)
        assertEquals(12.0, (row["alt"] as kotlinx.serialization.json.JsonPrimitive).content.toDouble())
        assertEquals(8.0, (row["acc"] as kotlinx.serialization.json.JsonPrimitive).content.toDouble())
        assertEquals(3.5, (row["vel"] as kotlinx.serialization.json.JsonPrimitive).content.toDouble())
        assertEquals(88.0, (row["batt"] as kotlinx.serialization.json.JsonPrimitive).content.toDouble())
    }

    @Test
    fun `heading wraps into 0-359`() {
        val payload = OwnTracksPayloadMapper.toPayload(listOf(point(cog = 350f))).jsonObject
        // 350 stays as-is (already in range)
        assertEquals(350.0, (payload["points"]!!.jsonArray[0].jsonObject["cog"] as kotlinx.serialization.json.JsonPrimitive).content.toDouble())

        val wrapped = OwnTracksPayloadMapper.toPayload(listOf(point(cog = -10f))).jsonObject
        assertEquals(350.0, (wrapped["points"]!!.jsonArray[0].jsonObject["cog"] as kotlinx.serialization.json.JsonPrimitive).content.toDouble())
    }

    @Test
    fun `null fields serialize as JSON nulls`() {
        val payload = OwnTracksPayloadMapper.toPayload(
            listOf(point(alt = null, acc = null, vel = null, cog = null, batt = null)),
        ).jsonObject
        val row = payload["points"]!!.jsonArray[0].jsonObject
        // Fields are present but explicitly null (OwnTracks readers skip nulls).
        listOf("alt", "acc", "vel", "cog", "batt").forEach { field ->
            assertTrue(row[field] is kotlinx.serialization.json.JsonNull, "$field should be JSON null")
        }
    }

    @Test
    fun `batch preserves order`() {
        val payload = OwnTracksPayloadMapper.toPayload(
            listOf(point(id = 1, tst = 100), point(id = 2, tst = 200), point(id = 3, tst = 300)),
        ).jsonObject
        val tsts = payload["points"]!!.jsonArray.map { it.jsonObject["tst"]!!.jsonPrimitive.content.toLong() }
        assertEquals(listOf(100L, 200L, 300L), tsts)
    }

    @Test
    fun `empty batch produces empty points array`() {
        val payload = OwnTracksPayloadMapper.toPayload(emptyList()).jsonObject
        assertTrue(payload["points"]!!.jsonArray.isEmpty())
    }
}
