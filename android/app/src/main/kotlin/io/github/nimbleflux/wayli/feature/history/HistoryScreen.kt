package io.github.nimbleflux.wayli.feature.history

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.DateRangePicker
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberDateRangePickerState
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import io.github.nimbleflux.wayli.designsystem.ErrorState
import io.github.nimbleflux.wayli.designsystem.LoadingState
import io.github.nimbleflux.wayli.designsystem.map.WayliMap
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/**
 * History map — view recorded GPS data for a selected date range. Preset
 * ranges (7d/30d/3m/1y) plus a custom Material3 DateRangePicker. Demo mode
 * shows the seeded track; real mode fetches `tracker_data` for the range.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HistoryScreen(
    onBack: () -> Unit,
    viewModel: HistoryViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()
    val rangeStart by viewModel.rangeStart.collectAsState()
    val rangeEnd by viewModel.rangeEnd.collectAsState()
    var showPicker by remember { mutableStateOf(false) }

    val today = remember { LocalDate.now() }
    val presets = remember(today) {
        listOf(
            "7 days" to (today.minusDays(6) to today),
            "30 days" to (today.minusDays(29) to today),
            "3 months" to (today.minusMonths(3).plusDays(1) to today),
            "1 year" to (today.minusYears(1).plusDays(1) to today),
        )
    }
    val selectedKey = remember(rangeStart, rangeEnd, presets) {
        presets.firstOrNull { it.second.first == rangeStart && it.second.second == rangeEnd }?.first
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("History") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(16.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text("Date range", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                    Text("$rangeStart  →  $rangeEnd", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                OutlinedButton(onClick = { showPicker = true }) { Text("Custom") }
            }
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                presets.forEach { (label, range) ->
                    FilterChip(
                        selected = selectedKey == label,
                        onClick = { viewModel.setRange(range.first, range.second) },
                        label = { Text(label) },
                    )
                }
            }
            Spacer(Modifier.height(8.dp))
            Box(modifier = Modifier.fillMaxSize()) {
                when (val s = state) {
                    is HistoryUiState.Loading -> LoadingState()
                    is HistoryUiState.Error -> ErrorState(s.message)
                    is HistoryUiState.Success -> WayliMap(
                        modifier = Modifier.fillMaxSize(),
                        points = s.data.points,
                        tracks = s.data.tracks,
                    )
                }
            }
        }
    }

    if (showPicker) {
        DateRangePickerSheet(
            initial = rangeStart to rangeEnd,
            onConfirm = { start, end ->
                viewModel.setRange(start, end)
                showPicker = false
            },
            onDismiss = { showPicker = false },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DateRangePickerSheet(
    initial: Pair<LocalDate, LocalDate>,
    onConfirm: (LocalDate, LocalDate) -> Unit,
    onDismiss: () -> Unit,
) {
    val zone = remember { ZoneId.systemDefault() }
    val pickerState = rememberDateRangePickerState()
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(modifier = Modifier.fillMaxWidth()) {
            DateRangePicker(state = pickerState, modifier = Modifier.fillMaxWidth())
            Row(
                modifier = Modifier.fillMaxWidth().padding(16.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                TextButton(onClick = onDismiss) { Text("Cancel") }
                TextButton(onClick = {
                    val s = pickerState.selectedStartDateMillis
                    val e = pickerState.selectedEndDateMillis
                    if (s != null && e != null) {
                        onConfirm(
                            Instant.ofEpochMilli(s).atZone(zone).toLocalDate(),
                            Instant.ofEpochMilli(e).atZone(zone).toLocalDate(),
                        )
                    }
                }) { Text("Apply") }
            }
        }
    }
}
