package io.github.nimbleflux.wayli.designsystem

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Button
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DateRangePicker
import androidx.compose.material3.DatePickerDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDateRangePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

/**
 * Preset filter chips (7d/30d/3m/1y) + "Custom" opening a Material date
 * range picker sheet. Extracted from the former History screen — now the
 * period selector for the Home stats + track.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DateRangeSelector(
    selected: DateRange,
    onSelect: (DateRange) -> Unit,
    modifier: Modifier = Modifier,
) {
    var showPicker by remember { mutableStateOf(false) }

    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        dateRangePresets.forEach { preset ->
            FilterChip(
                selected = selected == preset,
                onClick = { onSelect(preset) },
                label = { Text(preset.label) },
            )
        }
        FilterChip(
            selected = selected is DateRange.Custom,
            onClick = { showPicker = true },
            label = { Text("Custom") },
        )
    }

    if (showPicker) {
        val pickerState = rememberDateRangePickerState(
            initialSelectedStartDateMillis = selected.toDates().first.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli(),
            initialSelectedEndDateMillis = selected.toDates().second.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli(),
        )
        ModalBottomSheet(onDismissRequest = { showPicker = false }) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp),
            ) {
                DateRangePicker(state = pickerState)
                Row(
                    modifier = Modifier.fillMaxWidth().padding(bottom = 24.dp),
                    horizontalArrangement = Arrangement.End,
                ) {
                    TextButton(onClick = { showPicker = false }) { Text("Cancel") }
                    Spacer(Modifier.width(8.dp))
                    Button(
                        onClick = {
                            val start = pickerState.selectedStartDateMillis?.toLocalDate()
                            val end = pickerState.selectedEndDateMillis?.toLocalDate()
                            if (start != null && end != null) {
                                onSelect(DateRange.Custom(start, end))
                            }
                            showPicker = false
                        },
                        enabled = pickerState.selectedStartDateMillis != null && pickerState.selectedEndDateMillis != null,
                    ) { Text("Apply") }
                }
            }
        }
    }
}

private fun Long.toLocalDate(): LocalDate =
    Instant.ofEpochMilli(this).atZone(ZoneOffset.UTC).toLocalDate()
