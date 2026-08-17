package io.github.nimbleflux.wayli.repo

import io.github.nimbleflux.wayli.models.WantToVisit
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json

/**
 * The tables API serializes the PostGIS `location` column as a GeoJSON
 * Point object — the whole-list decode used to fail when the model typed
 * it as a String (empty wishlist list + map in real mode).
 */
class WantToVisitWireTest {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    @Test
    fun decodesWireRowsWithGeoJsonLocation() {
        val payload = """
            [
              {
                "id": "p1",
                "user_id": "u1",
                "title": "Kyoto",
                "location": {"type": "Point", "coordinates": [135.8, 35.0]},
                "address": "Kyoto, Japan",
                "country_code": "JP",
                "marker_type": "building",
                "marker_color": "#8B5CF6",
                "favorite": false,
                "rating": 5
              },
              {
                "id": "p2",
                "user_id": "u1",
                "title": "Marrakech",
                "location": {"type": "Point", "coordinates": [-8.0, 31.6]}
              }
            ]
        """.trimIndent()

        val places = json.decodeFromString(ListSerializer(WantToVisit.serializer()), payload)

        assertEquals(2, places.size)
        assertEquals("Kyoto", places[0].title)
        val (lat, lng) = assertNotNull(StatsAggregator.parseLocation(places[0].location))
        assertEquals(35.0, lat, 1e-9)
        assertEquals(135.8, lng, 1e-9)
    }

    @Test
    fun parsesWktStringLocationsFromDemoData() {
        val place = WantToVisit(
            id = "local-1",
            userId = "local",
            title = "Added offline",
            location = kotlinx.serialization.json.JsonPrimitive("POINT(4.9 52.35)"),
        )
        val (lat, lng) = assertNotNull(StatsAggregator.parseLocation(place.location))
        assertEquals(52.35, lat, 1e-9)
        assertEquals(4.9, lng, 1e-9)
    }
}
