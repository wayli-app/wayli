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
import androidx.compose.material.icons.filled.BatteryFull
import androidx.compose.material.icons.filled.Devices
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Palette
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Translate
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.nimbleflux.wayli.designsystem.LightPrimary
import io.github.nimbleflux.wayli.designsystem.ThemeManager
import io.github.nimbleflux.wayli.designsystem.ThemeMode
import javax.inject.Inject

/**
 * Settings — mobile-native design with grouped cards, icon + label rows,
 * and a functional theme selector. Every row navigates to a real screen.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    demoMode: Boolean = false,
    onProfile: () -> Unit = {},
    onSecurity: () -> Unit = {},
    onTrackingSettings: () -> Unit = {},
    onConnections: () -> Unit = {},
    onDataSampling: () -> Unit = {},
    onLanguage: () -> Unit = {},
    viewModel: SettingsViewModel = hiltViewModel(),
) {
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
                    colors = CardDefaults.cardColors(
                        containerColor = LightPrimary.copy(alpha = 0.1f),
                    ),
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text("Demo Mode", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, color = LightPrimary)
                        Spacer(Modifier.height(4.dp))
                        Text(
                            "You're viewing sample data. Connect to a real Wayli instance to track your own travels.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }

            // Theme selector
            SettingsCard(title = "Appearance") {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Filled.Palette, contentDescription = null, tint = LightPrimary, modifier = Modifier.size(24.dp))
                    Spacer(Modifier.size(16.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Theme", style = MaterialTheme.typography.bodyLarge)
                        SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) {
                            ThemeMode.entries.forEachIndexed { index, mode ->
                                SegmentedButton(
                                    selected = viewModel.themeMode == mode,
                                    onClick = { viewModel.setThemeMode(mode) },
                                    shape = SegmentedButtonDefaults.itemShape(index, ThemeMode.entries.size),
                                ) { Text(mode.label) }
                            }
                        }
                    }
                }
            }

            // Account section
            SettingsCard(title = "Account") {
                SettingsRow(icon = Icons.Filled.Person, label = "Profile", onClick = onProfile)
                SettingsRow(icon = Icons.Filled.Lock, label = "Security & 2FA", onClick = onSecurity)
            }

            // Tracking
            SettingsCard(title = "Tracking") {
                SettingsRow(icon = Icons.Filled.LocationOn, label = "Tracking Settings", onClick = onTrackingSettings)
                SettingsRow(icon = Icons.Filled.Devices, label = "Connections & Devices", onClick = onConnections)
                SettingsRow(icon = Icons.Filled.BatteryFull, label = "Data Sampling", onClick = onDataSampling)
            }

            // Preferences
            SettingsCard(title = "Preferences") {
                SettingsRow(icon = Icons.Filled.Translate, label = "Language", onClick = onLanguage)
            }

            // About
            SettingsCard(title = "About") {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    io.github.nimbleflux.wayli.designsystem.WayliLogo(size = 40.dp)
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

@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val themeManager: ThemeManager,
) : ViewModel() {
    val themeMode: ThemeMode get() = themeManager.themeMode

    fun setThemeMode(mode: ThemeMode) {
        themeManager.setThemeMode(mode)
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
