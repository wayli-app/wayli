package io.github.nimbleflux.wayli.feature.tracking

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import io.github.nimbleflux.wayli.designsystem.LightPrimary

/**
 * Map / live tracking screen — the home tab.
 *
 * Mobile-native design:
 * - Full-screen map area (MapLibre added in a later step; placeholder for now)
 * - Bottom sheet with today's stats (distance, time, points, current mode)
 * - Extended FAB for start/stop tracking (changes color when active)
 * - Settings icon in the top-right corner
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TrackingScreen(
    onTrackingSettings: () -> Unit,
) {
    var isTracking by remember { mutableStateOf(false) }

    Scaffold(
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = { isTracking = !isTracking },
                icon = { Icon(if (isTracking) Icons.Filled.Stop else Icons.Filled.PlayArrow, contentDescription = null) },
                text = { Text(if (isTracking) "Stop" else "Start tracking") },
                containerColor = if (isTracking) MaterialTheme.colorScheme.error else LightPrimary,
                contentColor = MaterialTheme.colorScheme.onError,
            )
        },
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            // Map placeholder — MapLibre will replace this
            Column(
                modifier = Modifier.fillMaxSize(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Text(
                    "🗺️",
                    style = MaterialTheme.typography.headlineLarge,
                )
                Spacer(Modifier.height(8.dp))
                Text(
                    if (isTracking) "Tracking active" else "Map",
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            // Top-right settings button
            IconButton(
                onClick = onTrackingSettings,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(8.dp),
            ) {
                Icon(Icons.Filled.Settings, contentDescription = "Tracking settings")
            }

            // Bottom stats card (mobile bottom-sheet pattern)
            TodayStatsCard(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(16.dp),
                isTracking = isTracking,
            )
        }
    }
}

/**
 * Today's stats card — a bottom-anchored card showing key metrics at a glance.
 * Mobile-native: compact, rounded, at-a-glance information.
 */
@Composable
private fun TodayStatsCard(
    modifier: Modifier = Modifier,
    isTracking: Boolean,
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp),
    ) {
        Column(
            modifier = Modifier.padding(20.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    "Today",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                )
                if (isTracking) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(8.dp)
                                .padding(end = 4.dp),
                        )
                        Text(
                            "● Live",
                            style = MaterialTheme.typography.labelSmall,
                            color = LightPrimary,
                        )
                    }
                }
            }
            Spacer(Modifier.height(12.dp))

            // Stats row — compact horizontal layout
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly,
            ) {
                StatItem(label = "Distance", value = "0 km")
                StatItem(label = "Time", value = "0m")
                StatItem(label = "Points", value = "0")
                StatItem(label = "Steps", value = "—")
            }
        }
    }
}

@Composable
private fun StatItem(label: String, value: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            value,
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
        )
        Text(
            label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
