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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import io.github.nimbleflux.wayli.designsystem.LightPrimary
import io.github.nimbleflux.wayli.designsystem.TransportModeColors
import io.github.nimbleflux.wayli.demo.DemoData

/**
 * Stats / Where-I've-Been screen — mobile-native design:
 * - Vertically scrollable stat cards
 * - 2x2 summary grid at top
 * - Transport mode breakdown as colored bars
 * - World map card below
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StatsScreen(
    demoMode: Boolean = false,
) {
    val distance = if (demoMode) DemoData.totalDistanceKm.toString() else "—"
    val countries = if (demoMode) DemoData.countriesVisited.toString() else "—"
    val timeMoving = if (demoMode) DemoData.timeMovingHours.toString() else "—"
    val points = if (demoMode) DemoData.dataPoints.toString() else "—"
    val modes = if (demoMode) DemoData.transportModeBreakdown else emptyMap()

    Scaffold(
        topBar = { TopAppBar(title = { Text("Statistics") }) },
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
                shape = RoundedCornerShape(16.dp),
                elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("Transport Modes", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, color = LightPrimary)
                    Spacer(Modifier.height(12.dp))
                    ModeBar("Car", (modes["car"] ?: 0.0).toFloat(), TransportModeColors.car)
                    ModeBar("Walking", (modes["walking"] ?: 0.0).toFloat(), TransportModeColors.walking)
                    ModeBar("Train", (modes["train"] ?: 0.0).toFloat(), TransportModeColors.train)
                    ModeBar("Cycling", (modes["cycling"] ?: 0.0).toFloat(), TransportModeColors.cycling)
                    ModeBar("Airplane", (modes["airplane"] ?: 0.0).toFloat(), TransportModeColors.airplane)
                }
            }

            Card(
                modifier = Modifier.fillMaxWidth().height(220.dp),
                shape = RoundedCornerShape(16.dp),
            ) {
                Column(
                    modifier = Modifier.fillMaxSize(),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                ) {
                    Text("🌍", style = MaterialTheme.typography.headlineLarge)
                    Spacer(Modifier.height(4.dp))
                    Text("World Map", style = MaterialTheme.typography.titleMedium)
                }
            }

            Spacer(Modifier.height(32.dp))
        }
    }
}

@Composable
private fun StatCard(modifier: Modifier, label: String, value: String, unit: String) {
    Card(modifier = modifier, shape = RoundedCornerShape(16.dp), elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)) {
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
