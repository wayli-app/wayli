package io.github.nimbleflux.wayli.feature.tracking

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import io.github.nimbleflux.wayli.designsystem.LightPrimary
import io.github.nimbleflux.wayli.gps.AccuracyProfile
import io.github.nimbleflux.wayli.gps.TrackingConfig
import io.github.nimbleflux.wayli.gps.TrackingMode

/**
 * Tracking settings — mobile-native design with:
 * - Segmented buttons for mode selection (not a dropdown)
 * - Sliders for interval/distance (not text inputs)
 * - Switches for boolean toggles
 * - Grouped cards for related settings
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TrackingSettingsScreen(
    onBack: () -> Unit,
) {
    var mode by remember { mutableStateOf(TrackingMode.MOVE) }
    var minInterval by remember { mutableFloatStateOf(30f) }
    var minDistance by remember { mutableFloatStateOf(50f) }
    var accuracy by remember { mutableStateOf(AccuracyProfile.BALANCED) }
    var stationaryPause by remember { mutableFloatStateOf(5f) }
    var batteryThreshold by remember { mutableFloatStateOf(15f) }
    var onlyWhileCharging by remember { mutableStateOf(false) }
    var payloadAltitude by remember { mutableStateOf(true) }
    var payloadSpeed by remember { mutableStateOf(true) }
    var payloadBattery by remember { mutableStateOf(true) }
    var startOnBoot by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Tracking Settings") },
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
                .padding(padding)
                .padding(horizontal = 16.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Spacer(Modifier.height(8.dp))

            // Tracking mode — segmented buttons
            SettingsCard(title = "Mode") {
                SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                    TrackingMode.entries.forEachIndexed { index, m ->
                        SegmentedButton(
                            selected = mode == m,
                            onClick = { mode = m },
                            shape = SegmentedButtonDefaults.itemShape(index, TrackingMode.entries.size),
                        ) { Text(when (m) {
                            TrackingMode.MOVE -> "Move"
                            TrackingMode.SIGNIFICANT -> "Places"
                            TrackingMode.MANUAL -> "Manual"
                        }) }
                    }
                }
            }

            // Frequency settings — sliders
            SettingsCard(title = "Update Frequency") {
                SliderRow(
                    label = "Min interval",
                    value = minInterval,
                    range = 1f..3600f,
                    valueText = formatInterval(minInterval.toLong()),
                ) { minInterval = it }

                Spacer(Modifier.height(8.dp))

                SliderRow(
                    label = "Min distance",
                    value = minDistance,
                    range = 0f..5000f,
                    valueText = "${minDistance.toInt()} m",
                ) { minDistance = it }
            }

            // Accuracy profile
            SettingsCard(title = "Accuracy") {
                AccuracyProfile.entries.forEach { profile ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        androidx.compose.material3.RadioButton(
                            selected = accuracy == profile,
                            onClick = { accuracy = profile },
                        )
                        Text(profile.label, style = MaterialTheme.typography.bodyMedium)
                    }
                }
            }

            // Battery optimization
            SettingsCard(title = "Battery Optimization") {
                SliderRow(
                    label = "Pause below battery",
                    value = batteryThreshold,
                    range = 0f..50f,
                    valueText = "${batteryThreshold.toInt()}%",
                ) { batteryThreshold = it }

                Spacer(Modifier.height(8.dp))

                SliderRow(
                    label = "Stationary pause",
                    value = stationaryPause,
                    range = 0f..60f,
                    valueText = if (stationaryPause == 0f) "Off" else "${stationaryPause.toInt()} min",
                ) { stationaryPause = it }

                SwitchRow(
                    label = "Only while charging",
                    checked = onlyWhileCharging,
                ) { onlyWhileCharging = it }
            }

            // Data payload
            SettingsCard(title = "Data Payload") {
                SwitchRow(label = "Altitude", checked = payloadAltitude) { payloadAltitude = it }
                SwitchRow(label = "Speed", checked = payloadSpeed) { payloadSpeed = it }
                SwitchRow(label = "Battery level", checked = payloadBattery) { payloadBattery = it }
            }

            // System
            SettingsCard(title = "System") {
                SwitchRow(label = "Start on boot", checked = startOnBoot) { startOnBoot = it }
            }

            Spacer(Modifier.height(32.dp))
        }
    }
}

@Composable
private fun SettingsCard(title: String, content: @Composable () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                title,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold,
                color = LightPrimary,
            )
            Spacer(Modifier.height(12.dp))
            content()
        }
    }
}

@Composable
private fun SliderRow(
    label: String,
    value: Float,
    range: ClosedFloatingPointRange<Float>,
    valueText: String,
    onValueChange: (Float) -> Unit,
) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(label, style = MaterialTheme.typography.bodyMedium)
            Text(valueText, style = MaterialTheme.typography.bodyMedium, color = LightPrimary, fontWeight = FontWeight.Medium)
        }
        Slider(
            value = value,
            onValueChange = onValueChange,
            valueRange = range,
        )
    }
}

@Composable
private fun SwitchRow(label: String, checked: Boolean, onCheckedChange: (Boolean) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, style = MaterialTheme.typography.bodyMedium)
        Switch(checked = checked, onCheckedChange = onCheckedChange)
    }
}

private fun formatInterval(seconds: Long): String = when {
    seconds < 60 -> "${seconds}s"
    seconds < 3600 -> "${seconds / 60}min"
    else -> "${seconds / 3600}h ${(seconds % 3600) / 60}min"
}
