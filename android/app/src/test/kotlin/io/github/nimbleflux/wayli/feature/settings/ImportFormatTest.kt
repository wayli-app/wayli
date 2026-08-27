package io.github.nimbleflux.wayli.feature.settings

import kotlin.test.Test
import kotlin.test.assertEquals

class ImportFormatTest {

    @Test
    fun `file extensions map to job formats`() {
        assertEquals("geojson", detectImportFormat("export.geojson"))
        assertEquals("geojson", detectImportFormat("data.json"))
        assertEquals("geojson", detectImportFormat("UPPER.JSON"))
        assertEquals("gpx", detectImportFormat("route.gpx"))
        assertEquals("kml", detectImportFormat("places.kml"))
        assertEquals("owntracks", detectImportFormat("history.rec"))
        assertEquals("polarsteps", detectImportFormat("trip.zip"))
    }

    @Test
    fun `fit files map to the fitness import format`() {
        assertEquals("fit", detectImportFormat("260816195715.fit"))
        assertEquals("fit", detectImportFormat("RIDE.FIT"))
    }

    @Test
    fun `unknown extensions fall back to geojson`() {
        assertEquals("geojson", detectImportFormat("noext"))
        assertEquals("geojson", detectImportFormat("file.txt"))
    }
}
