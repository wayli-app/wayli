package io.github.nimbleflux.wayli.feature.settings

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.BatteryFull
import androidx.compose.material.icons.filled.CloudUpload
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import io.github.nimbleflux.wayli.designsystem.LightPrimary

/**
 * Settings — mobile-native design:
 * - Grouped cards with icon + label rows
 * - Tappable rows with chevron indicators
 * - Switches for boolean settings
 * - Profile section at top
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    demoMode: Boolean = false,
) {
    var darkMode by remember { mutableStateOf(false) }
    var notifications by remember { mutableStateOf(true) }

    Scaffold(
        topBar = { TopAppBar(title = { Text("Settings") }) },
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

            // Demo mode banner
            if (demoMode) {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    colors = androidx.compose.material3.CardDefaults.cardColors(
                        containerColor = LightPrimary.copy(alpha = 0.1f),
                    ),
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text("🎯 Demo Mode", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, color = LightPrimary)
                        Spacer(Modifier.height(4.dp))
                        Text(
                            "You're viewing sample data. Connect to a real Wayli instance to track your own travels.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }

            // Profile section
            SettingsCard(title = "Account") {
                SettingsRow(icon = Icons.Filled.Person, label = "Profile") {}
                SettingsRow(icon = Icons.Filled.Security, label = "Security & 2FA") {}
            }

            // Tracking
            SettingsCard(title = "Tracking") {
                SettingsRow(icon = Icons.Filled.LocationOn, label = "Tracking Settings") {}
                SettingsRow(icon = Icons.Filled.CloudUpload, label = "Connections & Devices") {}
                SettingsRow(icon = Icons.Filled.BatteryFull, label = "Data Sampling") {}
            }

            // Preferences
            SettingsCard(title = "Preferences") {
                SwitchRow(label = "Dark Mode", checked = darkMode) { darkMode = it }
                SwitchRow(label = "Notifications", checked = notifications) { notifications = it }
                SettingsRow(icon = Icons.Filled.Person, label = "Language") {}
            }

            // About
            SettingsCard(title = "About") {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    io.github.nimbleflux.wayli.designsystem.WayliLogo(
                        size = 40.dp,
                    )
                    Spacer(Modifier.size(12.dp))
                    Column {
                        Text("Wayli", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                        Text("Android v1.0.0", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                Spacer(Modifier.height(8.dp))
                Text("fluxbase-kotlin 2026.8.8-rc.1", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
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
            Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, color = LightPrimary)
            Spacer(Modifier.height(8.dp))
            content()
        }
    }
}

@Composable
private fun SettingsRow(icon: ImageVector, label: String, onClick: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = LightPrimary, modifier = Modifier.size(24.dp))
        Spacer(Modifier.size(16.dp))
        Text(label, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
        Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun SwitchRow(label: String, checked: Boolean, onCheckedChange: (Boolean) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
        Switch(checked = checked, onCheckedChange = onCheckedChange)
    }
}
