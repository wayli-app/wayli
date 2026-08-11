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
import androidx.compose.material.icons.filled.BarChart
import androidx.compose.material.icons.filled.BatteryFull
import androidx.compose.material.icons.filled.Block
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.Devices
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Palette
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.SwapVert
import androidx.compose.material.icons.filled.Translate
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.nimbleflux.wayli.designsystem.SettingRow
import io.github.nimbleflux.wayli.designsystem.ThemeManager
import io.github.nimbleflux.wayli.designsystem.ThemeMode
import io.github.nimbleflux.wayli.designsystem.WayliSectionCard
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
    onTripExclusions: () -> Unit = {},
    onImportExport: () -> Unit = {},
    onPreferences: () -> Unit = {},
    onStats: () -> Unit = {},
    onSignOut: () -> Unit = {},
    onAdminUsers: () -> Unit = {},
    onAdminMaintenance: () -> Unit = {},
    serverUrl: String? = null,
    onReconfigureServer: () -> Unit = {},
    viewModel: SettingsViewModel = hiltViewModel(),
    sessionViewModel: SessionViewModel = hiltViewModel(),
) {
    val isAdmin by sessionViewModel.isAdmin.collectAsState()
    var showChangeServer by remember { mutableStateOf(false) }

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
                        containerColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.1f),
                    ),
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text("Demo Mode", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
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
            WayliSectionCard(title = "Appearance") {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Filled.Palette, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(24.dp))
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
            WayliSectionCard(title = "Account") {
                SettingRow(icon = Icons.Filled.Person, label = "Profile", onClick = onProfile)
                SettingRow(icon = Icons.Filled.Lock, label = "Security & 2FA", onClick = onSecurity)
            }

            // Connection (real instances only — demo has no server)
            if (!demoMode) {
                WayliSectionCard(title = "Connection") {
                    Text("Server", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(
                        serverUrl ?: "Not configured",
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = FontWeight.Medium,
                        maxLines = 1,
                    )
                    Spacer(Modifier.height(8.dp))
                    OutlinedButton(
                        onClick = { showChangeServer = true },
                        modifier = Modifier.fillMaxWidth().height(40.dp),
                        shape = MaterialTheme.shapes.medium,
                    ) { Text("Change server") }
                }
            }

            // Recording
            WayliSectionCard(title = "Recording") {
                SettingRow(icon = Icons.Filled.LocationOn, label = "Tracking Settings", onClick = onTrackingSettings)
                SettingRow(icon = Icons.Filled.Devices, label = "Connections & Integrations", onClick = onConnections)
            }

            // Data & Trips
            WayliSectionCard(title = "Data & Trips") {
                SettingRow(icon = Icons.Filled.BatteryFull, label = "Data Sampling", onClick = onDataSampling)
                SettingRow(icon = Icons.Filled.Block, label = "Trip Exclusions", onClick = onTripExclusions)
                SettingRow(icon = Icons.Filled.SwapVert, label = "Import / Export", onClick = onImportExport)
            }

            // Preferences
            WayliSectionCard(title = "Preferences") {
                SettingRow(icon = Icons.Filled.Translate, label = "Preferences", onClick = onPreferences)
            }

            // Server admin (role-gated)
            if (isAdmin) {
                WayliSectionCard(title = "Server admin") {
                    SettingRow(icon = Icons.Filled.People, label = "Users", onClick = onAdminUsers)
                    SettingRow(icon = Icons.Filled.Build, label = "Maintenance", onClick = onAdminMaintenance)
                    Spacer(Modifier.height(4.dp))
                    Text(
                        "Server settings, Auth, Email, OAuth, AI, and Web search arrive once the Fluxbase admin SDK ships.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            // Insights
            WayliSectionCard(title = "Insights") {
                SettingRow(icon = Icons.Filled.BarChart, label = "Statistics", onClick = onStats)
            }

            // About
            WayliSectionCard(title = "About") {
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

            // Sign out / Exit demo
            Button(
                onClick = onSignOut,
                modifier = Modifier.fillMaxWidth().height(48.dp),
                shape = MaterialTheme.shapes.medium,
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.errorContainer,
                    contentColor = MaterialTheme.colorScheme.onErrorContainer,
                ),
            ) {
                Text(if (demoMode) "Exit demo" else "Sign out")
            }

            if (showChangeServer) {
                AlertDialog(
                    onDismissRequest = { showChangeServer = false },
                    title = { Text("Change server?") },
                    text = { Text("You'll be signed out and returned to setup to connect to a different Wayli instance.") },
                    confirmButton = {
                        TextButton(onClick = {
                            showChangeServer = false
                            onReconfigureServer()
                        }) { Text("Change") }
                    },
                    dismissButton = {
                        TextButton(onClick = { showChangeServer = false }) { Text("Cancel") }
                    },
                )
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

