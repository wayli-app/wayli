package io.github.nimbleflux.wayli.feature.settings

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
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.nimbleflux.wayli.designsystem.LightPrimary
import io.github.nimbleflux.wayli.demo.DemoManager
import io.github.nimbleflux.wayli.gps.TrackingConfigStore
import javax.inject.Inject

// ---- Profile ----

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(onBack: () -> Unit) {
    val viewModel: ProfileViewModel = hiltViewModel()
    val profile = viewModel.profile

    SubScreenScaffold(title = "Profile", onBack = onBack) {
        if (profile != null) {
            ProfileCard(title = "Name", value = profile.fullName ?: "Unknown")
            ProfileCard(title = "Username", value = "@${profile.username ?: "user"}")
            ProfileCard(title = "Role", value = profile.role.replaceFirstChar { it.uppercase() })
        } else {
            ProfileCard(title = "Name", value = "Not signed in")
            ProfileCard(title = "Username", value = "—")
        }

        Spacer(Modifier.height(16.dp))
        Button(
            onClick = {},
            modifier = Modifier.fillMaxWidth().height(48.dp),
            shape = RoundedCornerShape(16.dp),
            enabled = false,
        ) { Text("Edit Profile") }
    }
}

@HiltViewModel
class ProfileViewModel @Inject constructor(
    demoManager: DemoManager,
) : androidx.lifecycle.ViewModel() {
    val profile = if (demoManager.isDemoMode) io.github.nimbleflux.wayli.demo.DemoData.profile else null
}

// ---- Security & 2FA ----

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SecurityScreen(onBack: () -> Unit, demoMode: Boolean = false) {
    var twoFactorEnabled by remember { mutableStateOf(false) }

    SubScreenScaffold(title = "Security & 2FA", onBack = onBack) {
        InfoCard(
            title = "Two-Factor Authentication",
            body = if (twoFactorEnabled)
                "2FA is enabled. You'll need a code from your authenticator app to sign in."
            else
                "Add an extra layer of security. When enabled, you'll need a code from your authenticator app to sign in.",
            status = if (twoFactorEnabled) "Enabled" else "Not enabled",
        )

        Spacer(Modifier.height(16.dp))

        Button(
            onClick = { if (!demoMode) twoFactorEnabled = !twoFactorEnabled },
            modifier = Modifier.fillMaxWidth().height(48.dp),
            shape = RoundedCornerShape(16.dp),
            enabled = !demoMode,
        ) {
            Text(if (twoFactorEnabled) "Disable 2FA" else "Enable 2FA")
        }

        if (demoMode) {
            Spacer(Modifier.height(12.dp))
            Text(
                "Connect to a real Wayli instance to configure security settings.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        Spacer(Modifier.height(24.dp))

        InfoCard(
            title = "Password",
            body = "Change your password regularly to keep your account secure.",
            status = "",
        )
        Spacer(Modifier.height(12.dp))
        OutlinedButton(
            onClick = {},
            modifier = Modifier.fillMaxWidth().height(48.dp),
            shape = RoundedCornerShape(16.dp),
            enabled = !demoMode,
        ) { Text("Change Password") }
    }
}

// ---- Language ----

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LanguageScreen(onBack: () -> Unit) {
    var selected by remember { mutableStateOf("System") }
    val languages = listOf("System", "English", "Nederlands")

    SubScreenScaffold(title = "Language", onBack = onBack) {
        languages.forEach { lang ->
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 4.dp),
                shape = RoundedCornerShape(14.dp),
                colors = CardDefaults.cardColors(
                    containerColor = if (selected == lang)
                        LightPrimary.copy(alpha = 0.08f)
                    else
                        MaterialTheme.colorScheme.surface,
                ),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(16.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(lang, style = MaterialTheme.typography.bodyLarge, fontWeight = if (selected == lang) FontWeight.Bold else FontWeight.Normal)
                    if (selected == lang) {
                        Text("✓", color = LightPrimary, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
        Spacer(Modifier.height(16.dp))
        Text(
            "Language preferences apply to the app interface.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

// ---- Connections & Devices ----

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConnectionsScreen(onBack: () -> Unit) {
    val viewModel: ConnectionsViewModel = hiltViewModel()
    val config = viewModel.config

    SubScreenScaffold(title = "Connections & Devices", onBack = onBack) {
        ProfileCard(title = "Device ID", value = config.deviceId)
        ProfileCard(
            title = "Server Endpoint",
            value = config.endpointUrl.ifBlank { "Not configured" },
        )
        ProfileCard(
            title = "Publish Topic",
            value = config.publishTopic.ifBlank { "Not configured" },
        )
        ProfileCard(title = "Tracking Status", value = if (config.startOnBoot) "Auto-start on boot" else "Manual start")
    }
}

@HiltViewModel
class ConnectionsViewModel @Inject constructor(
    store: TrackingConfigStore,
) : androidx.lifecycle.ViewModel() {
    val config = store.get()
}

// ---- Data Sampling ----

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DataSamplingScreen(onBack: () -> Unit, demoMode: Boolean = false) {
    val dataPoints = if (demoMode) "89,341" else "0"
    val storageMb = if (demoMode) "12.4 MB" else "0 MB"

    SubScreenScaffold(title = "Data Sampling", onBack = onBack) {
        ProfileCard(title = "Data Points", value = dataPoints)
        ProfileCard(title = "Storage Used", value = storageMb)
        ProfileCard(title = "Last Sync", value = if (demoMode) "2 minutes ago" else "Never")

        Spacer(Modifier.height(16.dp))
        OutlinedButton(
            onClick = {},
            modifier = Modifier.fillMaxWidth().height(48.dp),
            shape = RoundedCornerShape(16.dp),
        ) { Text("Export Data (JSON)") }
    }
}

// ---- Shared helpers ----

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SubScreenScaffold(
    title: String,
    onBack: () -> Unit,
    content: @Composable (androidx.compose.foundation.layout.ColumnScope.() -> Unit),
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(title) },
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
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Spacer(Modifier.height(8.dp))
            content()
            Spacer(Modifier.height(32.dp))
        }
    }
}

@Composable
private fun ProfileCard(title: String, value: String) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(title, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(4.dp))
            Text(value, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium)
        }
    }
}

@Composable
private fun InfoCard(title: String, body: String, status: String) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                if (status.isNotEmpty()) {
                    Text(status, style = MaterialTheme.typography.labelSmall, color = LightPrimary, fontWeight = FontWeight.SemiBold)
                }
            }
            Spacer(Modifier.height(8.dp))
            Text(body, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
