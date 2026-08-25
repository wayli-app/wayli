package io.github.nimbleflux.wayli.util

import java.time.LocalDate
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class IsoDatesTest {
    @Test
    fun `parses plain dates`() {
        assertEquals(LocalDate.of(2026, 3, 1), parseIsoDate("2026-03-01"))
    }

    @Test
    fun `parses full timestamps`() {
        assertEquals(LocalDate.of(2026, 3, 1), parseIsoDate("2026-03-01T00:00:00Z"))
        assertEquals(LocalDate.of(2025, 12, 31), parseIsoDate("2025-12-31T14:30:59.123Z"))
    }

    @Test
    fun `rejects garbage and blanks`() {
        assertNull(parseIsoDate(null))
        assertNull(parseIsoDate(""))
        assertNull(parseIsoDate("not a date"))
        assertNull(parseIsoDate("2026-13-40"))
    }
}
