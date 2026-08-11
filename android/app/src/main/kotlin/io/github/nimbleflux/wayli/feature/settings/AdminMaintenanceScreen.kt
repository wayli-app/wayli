package io.github.nimbleflux.wayli.feature.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.nimbleflux.wayli.demo.DemoManager
import io.github.nimbleflux.wayli.repo.AdminRepository
import javax.inject.Inject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** A maintenance action descriptor rendered as a card with a Run button. */
data class MaintenanceAction(
    val id: String,
    val title: String,
    val description: String,
    val destructive: Boolean = false,
)

val maintenanceActions = listOf(
    MaintenanceAction("place_visits", "Detect place visits", "Re-run place-visit detection for all users."),
    MaintenanceAction("daily_activity", "Refresh daily activity", "Rebuild the daily-activity cache for all users."),
    MaintenanceAction("transport", "Detect transport modes", "Re-classify transport modes for all users."),
    MaintenanceAction("geocode", "Reverse geocode", "Reverse-geocode points for all users."),
    MaintenanceAction("geocode_force", "Force re-geocode", "Re-geocode every point, ignoring cached results.", destructive = true),
    MaintenanceAction("country_codes", "Fill country codes", "Reverse-geocode only points missing a country code."),
    MaintenanceAction("rebuild", "Clear & rebuild place visits", "Wipe and rebuild place visits for all users.", destructive = true),
)

@HiltViewModel
class AdminMaintenanceViewModel @Inject constructor(
    private val repo: AdminRepository,
    private val demoManager: DemoManager,
) : ViewModel() {

    val isDemo: Boolean get() = demoManager.isDemoMode

    private val _running = MutableStateFlow<String?>(null)
    val running: StateFlow<String?> = _running.asStateFlow()

    private val _message = MutableStateFlow<String?>(null)
    val message: StateFlow<String?> = _message.asStateFlow()

    fun run(actionId: String) {
        if (isDemo || _running.value != null) return
        viewModelScope.launch(Dispatchers.IO) {
            _running.value = actionId; _message.value = null
            val result = when (actionId) {
                "place_visits" -> repo.refreshPlaceVisits()
                "daily_activity" -> repo.refreshDailyActivity()
                "transport" -> repo.detectTransportModes()
                "geocode" -> repo.reverseGeocodeAll(force = false)
                "geocode_force" -> repo.reverseGeocodeAll(force = true)
                "country_codes" -> repo.fillCountryCodes()
                "rebuild" -> repo.clearAndRebuildPlaceVisits()
                else -> Result.failure(IllegalArgumentException("Unknown action"))
            }
            _message.value = result.fold(
                onSuccess = { "Job queued: ${maintenanceActions.first { it.id == actionId }.title}" },
                onFailure = { it.message ?: "Failed to submit job" },
            )
            _running.value = null
        }
    }

    fun clearMessage() { _message.value = null }
}

@Composable
fun AdminMaintenanceScreen(
    onBack: () -> Unit,
    viewModel: AdminMaintenanceViewModel = hiltViewModel(),
) {
    val running by viewModel.running.collectAsState()
    val message by viewModel.message.collectAsState()
    var confirm by remember { mutableStateOf<MaintenanceAction?>(null) }

    SubScreenScaffold(title = "Database Maintenance", onBack = onBack) {
        Text(
            "Trigger background jobs that reprocess location data. These run across all users.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(12.dp))

        maintenanceActions.forEach { action ->
            Card(
                modifier = Modifier.fillMaxWidth(),
                elevation = CardDefaults.cardElevation(1.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth().height(72.dp).padding(horizontal = 16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(action.title, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium)
                        Text(action.description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    val isRunning = running == action.id
                    OutlinedButton(
                        onClick = {
                            if (action.destructive) confirm = action else viewModel.run(action.id)
                        },
                        enabled = !viewModel.isDemo && running == null,
                    ) {
                        Text(
                            when {
                                viewModel.isDemo -> "Demo"
                                isRunning -> "Running…"
                                action.destructive -> "Run"
                                else -> "Run"
                            },
                        )
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
        }

        message?.let { msg ->
            Spacer(Modifier.height(8.dp))
            Text(msg, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
        }
    }

    confirm?.let { action ->
        AlertDialog(
            onDismissRequest = { confirm = null },
            title = { Text(action.title) },
            text = { Text("This is destructive and affects all users. Continue?") },
            confirmButton = {
                TextButton(onClick = { viewModel.run(action.id); confirm = null }) { Text("Run") }
            },
            dismissButton = { TextButton(onClick = { confirm = null }) { Text("Cancel") } },
        )
    }
}
