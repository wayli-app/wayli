package io.github.nimbleflux.wayli.repo

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class GeocodingServiceTest {

    private val service = GeocodingService()

    @Test
    fun parsesPeliasAutocompleteFeatures() {
        val payload = """
            {
              "features": [
                {
                  "type": "Feature",
                  "geometry": {"type": "Point", "coordinates": [4.9041, 52.3676]},
                  "properties": {
                    "name": "Amsterdam",
                    "label": "Amsterdam, North Holland, Netherlands",
                    "locality": "Amsterdam",
                    "region": "North Holland",
                    "country": "Netherlands"
                  }
                },
                {
                  "type": "Feature",
                  "geometry": {"type": "Point", "coordinates": [13.405, 52.52]},
                  "properties": {"label": "Berlin, Germany", "country": "Germany"}
                },
                {
                  "type": "Feature",
                  "geometry": {"type": "Point", "coordinates": []},
                  "properties": {"name": "Broken"}
                }
              ]
            }
        """.trimIndent()

        val hits = service.parse(payload)

        assertEquals(2, hits.size)
        val ams = hits[0]
        assertEquals("Amsterdam", ams.name)
        assertEquals("Amsterdam, North Holland, Netherlands", ams.secondary)
        assertEquals(52.3676, ams.lat, 1e-9)
        assertEquals(4.9041, ams.lng, 1e-9)
        assertEquals("Netherlands", ams.country)

        // label-only feature: name from the label's first part, secondary from the rest
        val berlin = hits[1]
        assertEquals("Berlin", berlin.name)
        assertEquals("Germany", berlin.secondary)
    }

    @Test
    fun reverseResponseWithoutFeaturesYieldsEmpty() {
        assertEquals(emptyList(), service.parse("""{"features": []}"""))
    }

    @Test
    fun blankSecondaryFallsBackToNull() {
        val payload = """
            {"features": [{"geometry": {"coordinates": [1.0, 2.0]}, "properties": {"name": "Nowhere"}}]}
        """.trimIndent()
        val hit = service.parse(payload).single()
        assertEquals("Nowhere", hit.name)
        assertNull(hit.secondary)
    }
}
