package io.github.nimbleflux.wayli.designsystem

import java.time.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals

class DateRangeTest {

    private val today = LocalDate.of(2026, 8, 16)

    @Test
    fun `LastDays resolves to inclusive window ending today`() {
        assertEquals(today.minusDays(6) to today, DateRange.LastDays(7, "7d").toDates(today))
        assertEquals(today.minusDays(89) to today, DateRange.LastDays(90, "3m").toDates(today))
        assertEquals(today to today, DateRange.LastDays(1, "1d").toDates(today))
    }

    @Test
    fun `Custom passes through unchanged`() {
        val start = LocalDate.of(2026, 1, 10)
        val end = LocalDate.of(2026, 3, 2)
        assertEquals(start to end, DateRange.Custom(start, end).toDates(today))
    }

    @Test
    fun `labels render`() {
        assertEquals("30d", DateRange.LastDays(30, "30d").label)
        val custom = DateRange.Custom(LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 31))
        assertEquals("2026-01-01 → 2026-01-31", custom.label)
    }
}
