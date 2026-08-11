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
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import io.github.nimbleflux.wayli.designsystem.TransportModeColors
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
    onViewHistory: () -> Unit = {},
) {
    val distance = if (demoMode) formatNumber(DemoData.totalDistanceKm) else "—"
    val countries = if (demoMode) DemoData.countriesVisited.toString() else "—"
    val timeMoving = if (demoMode) DemoData.timeMovingHours.toString() else "—"
    val points = if (demoMode) formatNumber(DemoData.dataPoints) else "—"
    val modes = if (demoMode) DemoData.transportModeBreakdown else emptyMap()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Statistics") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Spacer(Modifier.height(8.dp))

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
                    Spacer(Modifier.height(12.dp))
                    ModeBar("Car", (modes["car"] ?: 0.0).toFloat(), TransportModeColors.car)
                    ModeBar("Walking", (modes["walking"] ?: 0.0).toFloat(), TransportModeColors.walking)
                    ModeBar("Train", (modes["train"] ?: 0.0).toFloat(), TransportModeColors.train)
                    ModeBar("Cycling", (modes["cycling"] ?: 0.0).toFloat(), TransportModeColors.cycling)
                    ModeBar("Airplane", (modes["airplane"] ?: 0.0).toFloat(), TransportModeColors.airplane)
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
                    ActivityHeatmap(activity = if (demoMode) DemoData.dailyActivity else emptyMap())
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
                }
            }

            // Activity map (replaces the former "🌍 World Map" placeholder)
            val mapPoints = remember(demoMode) { if (demoMode) DemoData.homePoints else emptyList() }
            val mapTracks = remember(demoMode) {
                if (demoMode) {
                    listOf(
                        MapTrack(
                            points = DemoData.homeTrack.map { LatLng(it.first, it.second) },
                            color = "#3b82f6",
                            width = 4f,
                        ),
                    )
                } else {
                    emptyList()
                }
            }
            Card(
                modifier = Modifier.fillMaxWidth().height(240.dp),
                shape = MaterialTheme.shapes.medium,
                elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
            ) {
                Box(modifier = Modifier.fillMaxSize()) {
                    WayliMap(
                        modifier = Modifier.fillMaxSize(),
                        points = mapPoints,
                        tracks = mapTracks,
                    )
                }
            }

            OutlinedButton(
                onClick = onViewHistory,
                modifier = Modifier.fillMaxWidth().height(48.dp),
                shape = MaterialTheme.shapes.medium,
            ) {
                Icon(Icons.Filled.History, contentDescription = null)
                Spacer(Modifier.width(8.dp))
                Text("View history on map")
            }

            Spacer(Modifier.height(32.dp))
        }
    }
}

private fun formatNumber(n: Int): String = "%,d".format(n)

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
private fun ColumnScope.ModeBar(label: String, fraction: Float, color: Color) {
    Row(modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(label, style = MaterialTheme.typography.bodySmall, modifier = Modifier.width(80.dp))
        Box(modifier = Modifier.weight(1f).height(12.dp).clip(RoundedCornerShape(6.dp)).background(MaterialTheme.colorScheme.surfaceVariant)) {
            Box(modifier = Modifier.fillMaxWidth(fraction).height(12.dp).clip(RoundedCornerShape(6.dp)).background(color))
        }
        Text("${(fraction * 100).toInt()}%", style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(start = 8.dp))
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
