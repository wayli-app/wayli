package io.github.nimbleflux.wayli.feature.travel

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class InlineMediaTest {

    @Test
    fun `appendDraftImage adds a standalone paragraph`() {
        assertEquals("![photo](wayli-draft:0)", InlineMedia.appendDraftImage("", 0))
        assertEquals(
            "Story text.\n\n![photo](wayli-draft:1)\n",
            InlineMedia.appendDraftImage("Story text.", 1),
        )
    }

    @Test
    fun `rewriteDraftTokens swaps draft indexes for storage paths and drops vanished photos`() {
        val body = "A\n\n![photo](wayli-draft:0)\n\nB\n\n![photo](wayli-draft:2)\n\nC"
        val paths = listOf("u1/trip7/a.jpg", "u1/trip7/b.jpg")
        val rewritten = InlineMedia.rewriteDraftTokens(body) { index -> paths.getOrNull(index) }
        assertTrue("![photo](wayli-media:u1/trip7/a.jpg)" in rewritten)
        // Index 2 has no photo anymore — its token disappears, text stays.
        assertTrue("wayli-draft:2" !in rewritten)
        assertTrue(rewritten.contains("A") && rewritten.contains("B") && rewritten.contains("C"))
    }

    @Test
    fun `inlineMediaPaths extracts referenced storage paths`() {
        val body = "x ![caption](wayli-media:u/t/one.jpg) y ![p](wayli-media:u/t/two.jpg) z"
        assertEquals(setOf("u/t/one.jpg", "u/t/two.jpg"), InlineMedia.inlineMediaPaths(body))
        assertEquals(emptySet<String>(), InlineMedia.inlineMediaPaths(null))
    }

    @Test
    fun `resolve maps refs to urls and drops unresolvable ones`() {
        val body = "A ![photo](wayli-media:u/t/one.jpg) B ![photo](wayli-media:gone.jpg) C ![photo](wayli-draft:0) D"
        val resolved = InlineMedia.resolve(
            body,
            resolveMedia = { path -> if (path == "u/t/one.jpg") "https://srv/signed/one" else null },
            resolveDraft = { index -> if (index == 0) "file:///data/photo.jpg" else null },
        )
        assertTrue("![photo](https://srv/signed/one)" in resolved)
        assertTrue("![photo](file:///data/photo.jpg)" in resolved)
        assertTrue("wayli-media:gone.jpg" !in resolved)
        assertTrue(resolved.contains("A") && resolved.contains("B") && resolved.contains("D"))
    }
}
