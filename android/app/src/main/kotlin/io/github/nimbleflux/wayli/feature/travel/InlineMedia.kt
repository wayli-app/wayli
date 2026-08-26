package io.github.nimbleflux.wayli.feature.travel

/**
 * Inline image tokens embedded in entry bodies (markdown image syntax), so
 * photos can sit BETWEEN paragraphs instead of only in the bottom gallery.
 *
 * Two reference forms:
 * - `![caption](wayli-media:<storagePath>)` — an uploaded photo (server media).
 * - `![photo](wayli-draft:<index>)` — a not-yet-uploaded local pick; the index
 *   points into the editor session's local photo list and is rewritten to the
 *   final `wayli-media:` form when the entry publishes (online or via the
 *   sync worker). This keeps composing fully offline-capable.
 *
 * Both apps' markdown renderers already draw `![…](…)` images; renderers just
 * pre-resolve the `wayli-media:`/`wayli-draft:` destinations to display URLs.
 */
object InlineMedia {
    private val DRAFT_TOKEN = Regex("""!\[([^\]]*)\]\(wayli-draft:(\d+)\)""")
    private val MEDIA_TOKEN = Regex("""!\[([^\]]*)\]\(wayli-media:([^)\s]+)\)""")

    fun draftToken(index: Int): String = "![photo](wayli-draft:$index)"

    /** Append a local-pick token as its own paragraph at the end of the body. */
    fun appendDraftImage(body: String, index: Int): String {
        val token = draftToken(index)
        if (body.isBlank()) return token
        return body.trimEnd() + "\n\n" + token + "\n"
    }

    /**
     * Replace every `wayli-draft:<i>` token with the final `wayli-media:` form
     * using [storagePathByIndex]; tokens whose photo vanished (removed before
     * publish) are dropped.
     */
    fun rewriteDraftTokens(body: String, storagePathByIndex: (Int) -> String?): String =
        DRAFT_TOKEN.replace(body) { m ->
            val idx = m.groupValues[2].toIntOrNull()
            val path = idx?.let(storagePathByIndex)
            if (path != null) "![${m.groupValues[1]}](wayli-media:$path)" else ""
        }

    /** Storage paths referenced by inline media tokens (for gallery filtering). */
    fun inlineMediaPaths(body: String?): Set<String> =
        body?.let { MEDIA_TOKEN.findAll(it).map { m -> m.groupValues[2] }.toSet() } ?: emptySet()

    /** Local-photo indexes referenced by inline draft tokens (editor preview filtering). */
    fun inlineDraftIndexes(body: String?): Set<Int> =
        body?.let { DRAFT_TOKEN.findAll(it).mapNotNull { m -> m.groupValues[2].toIntOrNull() }.toSet() } ?: emptySet()

    /**
     * Turn tokens into renderable markdown: `wayli-media:` destinations go
     * through [resolveMedia] (signed/public URL by storage path), draft tokens
     * through [resolveDraft] (local file URL by index). Unresolvable images are
     * dropped rather than rendered as broken placeholders.
     */
    fun resolve(body: String, resolveMedia: (String) -> String?, resolveDraft: (Int) -> String? = { null }): String {
        var resolved = MEDIA_TOKEN.replace(body) { m ->
            resolveMedia(m.groupValues[2])?.let { url -> "![${m.groupValues[1]}]($url)" } ?: ""
        }
        resolved = DRAFT_TOKEN.replace(resolved) { m ->
            val idx = m.groupValues[2].toIntOrNull()
            idx?.let(resolveDraft)?.let { url -> "![${m.groupValues[1]}]($url)" } ?: ""
        }
        return resolved
    }
}
