package io.github.nimbleflux.wayli.util

import java.time.LocalDate

/**
 * Robust date parsing for server rows, which arrive as plain dates
 * ("2026-03-01") or full ISO timestamps ("2026-03-01T00:00:00Z") depending
 * on the serialization path — the web guards with `.slice(0, 10)` for the
 * same reason. Every date display in the app goes through here so a
 * timestamp never degrades into "202" / "T00:00:00Z" output.
 */
fun parseIsoDate(raw: String?): LocalDate? {
    if (raw.isNullOrBlank()) return null
    return runCatching { LocalDate.parse(raw.take(10)) }.getOrNull()
}
