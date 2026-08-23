package io.github.nimbleflux.wayli.feature.stats

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import io.github.nimbleflux.wayli.designsystem.TransportModeColors
import io.github.nimbleflux.wayli.designsystem.displayLabel
import io.github.nimbleflux.wayli.designsystem.map.MapTrack
import io.github.nimbleflux.wayli.designsystem.map.WayliMap
import io.github.nimbleflux.wayli.demo.DemoData
import org.maplibre.android.geometry.LatLng

/**
 * Stats / Where-I've-Been screen — mobile-native design:
 * - Vertically scrollable stat cards
 * - 2x2 summary grid at top
 * - Transport mode breakdown as colored bars
 * - Activity map below
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StatsScreen(
    demoMode: Boolean = false,
    onBack: () -> Unit = {},
    viewModel: StatsViewModel = androidx.hilt.navigation.compose.hiltViewModel(),
) {
    val uiState by viewModel.state.collectAsState()
    val selectedRange by viewModel.selectedRange.collectAsState()
    val isDemo = viewModel.isDemoMode
    val message by viewModel.message.collectAsState()
    val snackbar = remember { androidx.compose.material3.SnackbarHostState() }

    androidx.compose.runtime.LaunchedEffect(message) {
        message?.let {
            snackbar.showSnackbar(it)
            viewModel.consumeMessage()
        }
    }

    Scaffold(
        snackbarHost = { androidx.compose.material3.SnackbarHost(snackbar) },
        topBar = {
            TopAppBar(
                title = { Text("Statistics") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(onClick = { viewModel.load() }) {
                        Icon(Icons.Filled.Refresh, contentDescription = "Refresh")
                    }
                },
            )
        },
    ) { padding ->
        when (val s = uiState) {
            is StatsUiState.Loading -> Box(
                modifier = Modifier.fillMaxSize().padding(padding),
                contentAlignment = Alignment.Center,
            ) { androidx.compose.material3.CircularProgressIndicator() }
            is StatsUiState.Error -> Box(
                modifier = Modifier.fillMaxSize().padding(padding),
                contentAlignment = Alignment.Center,
            ) { Text(s.message, color = MaterialTheme.colorScheme.error) }
            is StatsUiState.Success -> StatsContent(
                data = s.data,
                rangeLabel = if (isDemo) "Sample data · all time" else selectedRange.displayLabel(),
                showSelector = !isDemo,
                selectedRange = selectedRange,
                onRangeSelected = viewModel::setRange,
                onBuildActivity = viewModel::buildActivityData,
                padding = padding,
            )
        }
    }
}

@Composable
private fun StatsContent(
    data: StatsData,
    rangeLabel: String,
    showSelector: Boolean,
    selectedRange: io.github.nimbleflux.wayli.designsystem.DateRange,
    onRangeSelected: (io.github.nimbleflux.wayli.designsystem.DateRange) -> Unit,
    onBuildActivity: () -> Unit,
    padding: androidx.compose.foundation.layout.PaddingValues,
) {
    val distance = data.distanceKm
    val countries = data.countries
    val timeMoving = data.timeMovingHours
    val points = data.dataPoints
    val modes = data.modes

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(padding)
            .padding(horizontal = 16.dp)
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
            Spacer(Modifier.height(8.dp))

            if (showSelector) {
                io.github.nimbleflux.wayli.designsystem.DateRangeSelector(
                    selected = selectedRange,
                    onSelect = onRangeSelected,
                )
            }
            Text(
                rangeLabel,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                StatCard(modifier = Modifier.weight(1f), label = "Total Distance", value = distance, unit = "km")
                StatCard(modifier = Modifier.weight(1f), label = "Countries", value = countries, unit = "")
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                StatCard(modifier = Modifier.weight(1f), label = "Time Moving", value = timeMoving, unit = "h")
                StatCard(modifier = Modifier.weight(1f), label = "Data Points", value = points, unit = "")
            }

            io.github.nimbleflux.wayli.designsystem.WorldMapCard(visited = data.visited)

            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = MaterialTheme.shapes.medium,
                elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        "Transport Modes",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary,
                    )
                    Text(
                        "Share of moving distance",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(12.dp))
                    // Dynamic bars over the modes present in the data
                    // (stationary isn't movement and is excluded by the
                    // aggregator); percentages round to sum exactly 100.
                    val percentages = remember(modes) {
                        io.github.nimbleflux.wayli.repo.StatsAggregator.percentagesSummingTo100(modes)
                    }
                    val orderedModes = remember(modes) {
                        modes.entries.sortedByDescending { it.value }.map { it.key }
                    }
                    if (orderedModes.isEmpty()) {
                        Text(
                            "No moving data in this period",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    } else {
                        orderedModes.take(6).forEach { mode ->
                            ModeBar(
                                label = mode.replaceFirstChar { it.uppercase() },
                                fraction = modes.getValue(mode).toFloat(),
                                percentText = "${percentages.getValue(mode)}%",
                                color = modeColor(mode),
                            )
                        }
                    }
                }
            }

            // Activity heatmap (daily distance over the last ~12 weeks)
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = MaterialTheme.shapes.medium,
                elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        "Activity",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary,
                    )
                    Spacer(Modifier.height(12.dp))
                    ActivityHeatmap(activity = data.dailyActivity)
                    Spacer(Modifier.height(10.dp))
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Text("Less", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        repeat(5) { i ->
                            val a = 0.25f + 0.75f * (i / 4f)
                            Box(
                                Modifier
                                    .size(10.dp)
                                    .clip(RoundedCornerShape(2.dp))
                                    .background(MaterialTheme.colorScheme.primary.copy(alpha = a)),
                            )
                        }
                        Text("More", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    if (data.dailyCacheEmpty) {
                        Spacer(Modifier.height(12.dp))
                        Text(
                            "Derived from raw points — the server's activity cache is empty.",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Spacer(Modifier.height(8.dp))
                        OutlinedButton(onClick = onBuildActivity, modifier = Modifier.fillMaxWidth()) {
                            Text("Build activity data on the server")
                        }
                    }
                }
            }

            // Activity map — real track when available
            val mapTracks = remember(data.track) {
                data.track?.takeIf { it.isNotEmpty() }?.let { track ->
                    listOf(
                        MapTrack(
                            points = track.map { LatLng(it.first, it.second) },
                            color = "#3b82f6",
                            width = 4f,
                        ),
                    )
                }.orEmpty()
            }
            if (mapTracks.isNotEmpty()) {
                Card(
                    modifier = Modifier.fillMaxWidth().height(240.dp),
                    shape = MaterialTheme.shapes.medium,
                    elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
                ) {
                    Box(modifier = Modifier.fillMaxSize()) {
                        WayliMap(
                            modifier = Modifier.fillMaxSize(),
                            tracks = mapTracks,
                        )
                    }
                }
            }


            Spacer(Modifier.height(32.dp))
        }
}

private fun formatNumber(n: Int): String = "%,d".format(n)

/** Web mode palette; anything unknown falls back to the muted gray. */
private fun modeColor(mode: String): Color = when (mode) {
    "car" -> TransportModeColors.car
    "walking" -> TransportModeColors.walking
    "train" -> TransportModeColors.train
    "cycling" -> TransportModeColors.cycling
    "airplane" -> TransportModeColors.airplane
    else -> TransportModeColors.stationary
}

@Composable
private fun StatCard(modifier: Modifier, label: String, value: String, unit: String) {
    Card(
        modifier = modifier,
        shape = MaterialTheme.shapes.medium,
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text("$value $unit".trim(), style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(4.dp))
            Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun ColumnScope.ModeBar(label: String, fraction: Float, percentText: String, color: Color) {
    Row(modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(label, style = MaterialTheme.typography.bodySmall, modifier = Modifier.width(80.dp))
        Box(modifier = Modifier.weight(1f).height(12.dp).clip(RoundedCornerShape(6.dp)).background(MaterialTheme.colorScheme.surfaceVariant)) {
            Box(modifier = Modifier.fillMaxWidth(fraction).height(12.dp).clip(RoundedCornerShape(6.dp)).background(color))
        }
        Text(percentText, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(start = 8.dp))
    }
}

/**
 * GitHub-style activity heatmap: columns = weeks (oldest left), rows = weekdays
 * (Mon–Sun). Cell intensity scales with that day's distance relative to the max.
 */
@Composable
private fun ActivityHeatmap(activity: Map<String, Double>, modifier: Modifier = Modifier) {
    val today = remember { java.time.LocalDate.now() }
    val maxKm = remember(activity) { (activity.values.maxOrNull() ?: 0.0).coerceAtLeast(1.0) }
    val weeks = 12
    val startMonday = remember(today) {
        today.minusWeeks((weeks - 1).toLong())
            .with(java.time.temporal.TemporalAdjusters.previousOrSame(java.time.DayOfWeek.MONDAY))
    }
    val empty = MaterialTheme.colorScheme.surfaceVariant
    val active = MaterialTheme.colorScheme.primary

    Column(modifier = modifier) {
        Row(horizontalArrangement = Arrangement.spacedBy(3.dp)) {
            for (w in 0 until weeks) {
                Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    for (dow in 0 until 7) {
                        val date = startMonday.plusWeeks(w.toLong()).plusDays(dow.toLong())
                        val inRange = !date.isAfter(today)
                        val km = if (inRange) activity[date.toString()] ?: 0.0 else 0.0
                        val color = if (inRange && km > 0.0) {
                            active.copy(alpha = 0.25f + 0.75f * (km / maxKm).toFloat().coerceIn(0f, 1f))
                        } else {
                            empty.copy(alpha = if (inRange) 0.4f else 0.15f)
                        }
                        Box(
                            modifier = Modifier
                                .size(13.dp)
                                .clip(RoundedCornerShape(3.dp))
                                .background(color),
                        )
                    }
                }
            }
        }
    }
}
