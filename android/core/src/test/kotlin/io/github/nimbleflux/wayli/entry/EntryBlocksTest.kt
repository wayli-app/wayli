package io.github.nimbleflux.wayli.entry

import io.github.nimbleflux.wayli.models.TripEntry
import io.github.nimbleflux.wayli.models.TripMedia
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class EntryBlocksTest {

    private fun media(id: String, path: String) = TripMedia(id = id, tripId = "t1", storagePath = path)
    private val m1 = media("id-1", "entries/p1.jpg")
    private val m2 = media("id-2", "entries/p2.jpg")
    private val m3 = media("id-3", "entries/p3.jpg")

    @Test
    fun derive_plainBodyIsSingleTextBlock() {
        assertEquals(
            listOf(EntryBlocks.Block.Text("Just text.")),
            EntryBlocks.derive("Just text.", emptyList())?.blocks,
        )
    }

    @Test
    fun derive_splitsTextGroupsAdjacentTokensAndAppendsRemaining() {
        val body = "First paragraph.\n\n" +
            "![photo](wayli-media:entries/p1.jpg)\n\n" +
            "![photo](wayli-media:entries/p2.jpg)\n\n" +
            "Closing text."
        assertEquals(
            listOf(
                EntryBlocks.Block.Text("First paragraph."),
                EntryBlocks.Block.Photos(listOf("id-1", "id-2")),
                EntryBlocks.Block.Text("Closing text."),
                EntryBlocks.Block.Photos(listOf("id-3")),
            ),
            EntryBlocks.derive(body, listOf(m1, m2, m3))?.blocks,
        )
    }

    @Test
    fun derive_keepsUnresolvableTokensAsLiteralText() {
        val body = "Text before.\n\n![photo](wayli-media:entries/missing.jpg)\n\nText after."
        assertEquals(
            listOf(
                EntryBlocks.Block.Text("Text before."),
                EntryBlocks.Block.Text("![photo](wayli-media:entries/missing.jpg)\n\nText after."),
            ),
            EntryBlocks.derive(body, emptyList())?.blocks,
        )
    }

    @Test
    fun derive_photosOnlyAndEmptyBodies() {
        assertEquals(
            listOf(EntryBlocks.Block.Photos(listOf("id-1", "id-2"))),
            EntryBlocks.derive("", listOf(m1, m2))?.blocks,
        )
        assertNull(EntryBlocks.derive("", emptyList()))
        assertNull(EntryBlocks.derive("  \n\n ", emptyList()))
        assertNull(EntryBlocks.derive(null, emptyList()))
    }

    @Test
    fun derive_decodesPercentEscapes() {
        val body = "![photo](wayli-media:entries/with%20space.jpg)"
        val spaced = media("id-x", "entries/with space.jpg")
        assertEquals(
            listOf(EntryBlocks.Block.Photos(listOf("id-x"))),
            EntryBlocks.derive(body, listOf(spaced))?.blocks,
        )
    }

    @Test
    fun legacyBody_projectsTokensAtPhotoBlockPositions() {
        val byId = mapOf("id-1" to m1, "id-2" to m2)
        val body = EntryBlocks.legacyBody(
            listOf(
                EntryBlocks.Block.Text("First paragraph."),
                EntryBlocks.Block.Photos(listOf("id-1", "id-2")),
                EntryBlocks.Block.Text("Closing text."),
            ),
            byId,
        )
        assertEquals(
            "First paragraph.\n\n" +
                "![photo](wayli-media:entries/p1.jpg)\n\n" +
                "![photo](wayli-media:entries/p2.jpg)\n\n" +
                "Closing text.",
            body,
        )
    }

    @Test
    fun legacyBody_skipsUnknownMediaIds() {
        assertEquals(
            "![photo](wayli-media:entries/p1.jpg)",
            EntryBlocks.legacyBody(
                listOf(EntryBlocks.Block.Photos(listOf("gone", "id-1"))),
                mapOf("id-1" to m1),
            ),
        )
    }

    @Test
    fun json_roundTrip() {
        val envelope = EntryBlocks.Envelope(
            listOf(
                EntryBlocks.Block.Text("Hi"),
                EntryBlocks.Block.Photos(listOf("a", "b")),
            ),
        )
        val decoded = EntryBlocks.fromJson(EntryBlocks.toJson(envelope))
        assertEquals(envelope, decoded)
    }

    @Test
    fun json_rejectsUnknownVersionsAndMalformedShapes() {
        assertNull(EntryBlocks.fromJson(null))
        val raw = kotlinx.serialization.json.Json.parseToJsonElement(
            """{"v":2,"blocks":[]}""",
        )
        assertNull(EntryBlocks.fromJson(raw))
    }

    @Test
    fun effective_prefersFreshStoredBlocksButReDerivesWhenBodyMovedOn() {
        val entry = TripEntry(
            id = "e1", tripId = "t1", entryDate = "2025-09-10",
            body = "Hi", title = null,
            blocks = EntryBlocks.toJson(EntryBlocks.Envelope(listOf(EntryBlocks.Block.Text("Hi")))),
        )
        assertEquals(listOf(EntryBlocks.Block.Text("Hi")), EntryBlocks.effective(entry, emptyList()))

        val legacyEdited = entry.copy(body = "New text")
        assertEquals(listOf(EntryBlocks.Block.Text("New text")), EntryBlocks.effective(legacyEdited, emptyList()))
    }

    @Test
    fun deriveThenProject_roundTrips() {
        val body = "Intro.\n\n![photo](wayli-media:entries/p1.jpg)\n\n![photo](wayli-media:entries/p2.jpg)\n\nOutro."
        val derived = EntryBlocks.derive(body, listOf(m1, m2))!!
        val projected = EntryBlocks.legacyBody(derived.blocks, mapOf("id-1" to m1, "id-2" to m2))
        assertEquals(body, projected)
        assertTrue(projected.contains("![photo](wayli-media:entries/p2.jpg)"))
    }
}
