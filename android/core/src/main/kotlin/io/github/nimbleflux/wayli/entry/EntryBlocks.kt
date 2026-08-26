package io.github.nimbleflux.wayli.entry

import io.github.nimbleflux.wayli.models.TripEntry
import io.github.nimbleflux.wayli.models.TripMedia
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

/**
 * Block-based journal entry content — the source of truth for what an entry
 * renders: an ordered list of text (markdown) and photo (ordered trip_media
 * ids) blocks.
 *
 * Wire/storage shape (trip_entries.blocks jsonb):
 * `{"v":1,"blocks":[{"t":"text","md":"…"},{"t":"photos","ids":["…"]}]}`
 *
 * The flat markdown `body` is a *projection* of the blocks (photo blocks
 * become inline `wayli-media:` tokens at their position) kept for legacy
 * clients, search RPCs and feed excerpts. When [effective] sees stored
 * blocks whose projection doesn't match `body` (a legacy client rewrote the
 * body), it re-derives blocks from the legacy representation instead.
 */
object EntryBlocks {

    const val VERSION = 1

    sealed interface Block {        data class Text(val md: String) : Block

        data class Photos(val ids: List<String>) : Block
    }

    data class Envelope(val blocks: List<Block>) {
        val version: Int get() = VERSION
    }

    // ---- (De)serialization ----

    /** Defensive decode: unknown versions or malformed shapes yield null. */
    fun fromJson(element: JsonElement?): Envelope? {
        if (element == null) return null
        val obj = element as? JsonObject ?: return null
        if ((obj["v"] as? JsonPrimitive)?.contentOrNull?.toIntOrNull() != VERSION) return null
        val arr = obj["blocks"] as? JsonArray ?: return null
        val blocks = arr.mapNotNull { el ->
            val b = el as? JsonObject ?: return@mapNotNull null
            when (b["t"]?.jsonPrimitive?.contentOrNull) {
                "text" -> b["md"]?.jsonPrimitive?.contentOrNull?.takeIf { it.isNotBlank() }
                    ?.let { Block.Text(it) }

                "photos" -> (b["ids"] as? JsonArray)
                    ?.mapNotNull { id -> id.jsonPrimitive.contentOrNull }
                    ?.takeIf { it.isNotEmpty() }
                    ?.let { Block.Photos(it) }

                else -> null
            }
        }
        if (blocks.isEmpty()) return null
        return Envelope(blocks)
    }

    fun toJson(envelope: Envelope): JsonObject = buildJsonObject {
        put("v", VERSION)
        put(
            "blocks",
            buildJsonArray {
                for (block in envelope.blocks) {
                    add(
                        when (block) {
                            is Block.Text -> buildJsonObject {
                                put("t", "text")
                                put("md", block.md)
                            }

                            is Block.Photos -> buildJsonObject {
                                put("t", "photos")
                                put(
                                    "ids",
                                    buildJsonArray {
                                        block.ids.forEach { add(JsonPrimitive(it)) }
                                    },
                                )
                            }
                        },
                    )
                }
            },
        )
    }

    // ---- Derive / project (legacy representation ⇄ blocks) ----

    private val TOKEN_REGEX = Regex("""!\[[^\]]*\]\(wayli-media:([^)\s]+)\)""")

    /**
     * Derive blocks from a legacy body + the entry's media rows: runs of
     * tokens separated only by whitespace become ONE photo block; token refs
     * resolve to media ids by exact storage_path match; unresolvable tokens
     * stay as literal text; unreferenced media is appended as a trailing
     * photo block. Mirrors the SQL `wayli_entry_blocks_for_entry`.
     */
    fun derive(body: String?, media: List<TripMedia>): Envelope? {
        val byPath = media.associateBy { it.storagePath }
        val blocks = mutableListOf<Block>()
        var text = ""
        var ids = mutableListOf<String>()
        val remaining = media.map { it.id }.toMutableList()

        fun flushPhotos() {
            if (ids.isNotEmpty()) {
                blocks.add(Block.Photos(ids.toList()))
                ids = mutableListOf()
            }
        }
        fun flushText() {
            if (text.isNotBlank()) blocks.add(Block.Text(text.trim()))
            text = ""
        }

        val src = body.orEmpty()
        var cursor = 0
        for (match in TOKEN_REGEX.findAll(src)) {
            val between = src.substring(cursor, match.range.first)
            val ref = decodeRef(match.groupValues[1])
            val mediaRow = byPath[ref]
            if (between.isNotBlank()) {
                flushPhotos()
                text += between
                flushText()
            } else {
                // Whitespace-only run between tokens keeps the group open.
                text += between
            }
            if (mediaRow == null) {
                // Unresolvable ref: keep the token as literal text.
                text += match.value
            } else {
                ids.add(mediaRow.id)
                remaining.remove(mediaRow.id)
            }
            cursor = match.range.last + 1
        }
        val tail = src.substring(cursor)
        if (tail.isNotBlank()) {
            flushPhotos()
            text += tail
            flushText()
        }
        flushPhotos()
        if (remaining.isNotEmpty()) blocks.add(Block.Photos(remaining.toList()))

        if (blocks.isEmpty()) return null
        return Envelope(blocks)
    }

    private val PERCENT_ESCAPE = Regex("%([0-9A-Fa-f]{2})")

    /** Percent-decode a token ref (only ASCII escapes — parens, spaces). */
    private fun decodeRef(ref: String): String =
        PERCENT_ESCAPE.replace(ref) { it.groupValues[1].toInt(16).toChar().toString() }

    /**
     * Project blocks to the legacy flat body: text blocks verbatim, photo
     * blocks as consecutive inline tokens. Media ids missing from the map are
     * skipped.
     */
    fun legacyBody(blocks: List<Block>, mediaById: Map<String, TripMedia>): String {
        val out = mutableListOf<String>()
        for (block in blocks) {
            when (block) {
                is Block.Text -> if (block.md.isNotBlank()) out.add(block.md.trim())
                is Block.Photos -> {
                    val tokens = block.ids
                        .mapNotNull { mediaById[it] }
                        .map { mediaToken(it.storagePath) }
                    if (tokens.isNotEmpty()) out.add(tokens.joinToString("\n\n"))
                }
            }
        }
        return out.joinToString("\n\n")
    }

    /** `![caption](wayli-media:<ref>)` with parens in the ref encoded. */
    fun mediaToken(storagePath: String, caption: String = "photo"): String =
        "![${caption.replace("[", "").replace("]", "")}](wayli-media:${storagePath.replace("(", "%28").replace(")", "%29")})"

    /**
     * The read-compat rule: stored blocks win unless missing or stale (their
     * projection differs from `body` — a legacy client edited the entry).
     */
    fun effective(entry: TripEntry, media: List<TripMedia>): List<Block> {
        val stored = fromJson(entry.blocks)
        if (stored != null) {
            val projected = legacyBody(stored.blocks, media.associateBy { it.id })
            if (projected == entry.body.orEmpty()) return stored.blocks
        }
        return derive(entry.body, media)?.blocks.orEmpty()
    }
}
