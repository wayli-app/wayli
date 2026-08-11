package io.github.nimbleflux.wayli.feature.settings

import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.nimbleflux.fluxbase.FluxbaseClient
import io.github.nimbleflux.wayli.designsystem.WayliSectionCard
import io.github.nimbleflux.wayli.demo.DemoManager
import io.github.nimbleflux.wayli.models.UserDataSampling
import io.github.nimbleflux.wayli.repo.DataSamplingRepository
import javax.inject.Inject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

@HiltViewModel
class DataSamplingViewModel @Inject constructor(
    private val repo: DataSamplingRepository,
    private val demoManager: DemoManager,
    private val client: FluxbaseClient,
) : ViewModel() {

    val isDemo: Boolean get() = demoManager.isDemoMode
    private val userId: String? get() = client.auth.currentUser?.id

    sealed class UiState {
        object Loading : UiState()
        data class Loaded(val data: UserDataSampling) : UiState()
        data class Error(val message: String) : UiState()
    }

    private val _state = MutableStateFlow<UiState>(UiState.Loading)
    val state: StateFlow<UiState> = _state.asStateFlow()

    private val _saving = MutableStateFlow(false)
    val saving: StateFlow<Boolean> = _saving.asStateFlow()

    private val _message = MutableStateFlow<String?>(null)
    val message: StateFlow<String?> = _message.asStateFlow()

    init { refresh() }

    fun refresh() {
        val uid = userId
        if (isDemo || uid == null) {
            _state.value = UiState.Loaded(UserDataSampling(enabled = false, minDistanceM = 25.0, minTimeS = 60.0))
            return
        }
        viewModelScope.launch(Dispatchers.IO) {
            repo.get(uid).fold(
                onSuccess = { _state.value = UiState.Loaded(it) },
                onFailure = { _state.value = UiState.Error(it.message ?: "Failed to load") },
            )
        }
    }

    fun save(enabled: Boolean, minDistanceM: Double, minTimeS: Double) {
        val uid = userId ?: return
        if (isDemo || _saving.value) return
        viewModelScope.launch(Dispatchers.IO) {
            _saving.value = true
            repo.upsert(uid, enabled, minDistanceM, minTimeS).fold(
                onSuccess = {
                    _message.value = "Saved"
                    refresh()
                },
                onFailure = { _message.value = it.message ?: "Save failed" },
            )
            _saving.value = false
        }
    }

    fun clearMessage() { _message.value = null }
}

@Composable
fun DataSamplingScreen(
    onBack: () -> Unit,
    demoMode: Boolean = false,
    viewModel: DataSamplingViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()
    val saving by viewModel.saving.collectAsState()
    val message by viewModel.message.collectAsState()

    var enabled by remember { mutableStateOf(false) }
    var minDistance by remember { mutableStateOf("25") }
    var minTime by remember { mutableStateOf("60") }

    LaunchedEffect(state) {
        (state as? DataSamplingViewModel.UiState.Loaded)?.data?.let {
            enabled = it.enabled
            minDistance = it.minDistanceM?.toInt()?.toString() ?: "25"
            minTime = it.minTimeS?.toInt()?.toString() ?: "60"
        }
    }

    SubScreenScaffold(title = "Data Sampling", onBack = onBack) {
        Text(
            "Nightly sampling simplifies your raw GPS points into a lighter store, " +
                "dropping points closer than the minimum distance or time you set.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(12.dp))

        when (val s = state) {
            is DataSamplingViewModel.UiState.Loading -> ProfileCard("Status", "Loading…")
            is DataSamplingViewModel.UiState.Error -> ProfileCard("Status", "Failed to load", s.message)
            is DataSamplingViewModel.UiState.Loaded -> WayliSectionCard(title = "Settings") {
                ToggleRow(
                    label = "Enable nightly sampling",
                    checked = enabled,
                    onCheckedChange = { enabled = it },
                    enabled = !demoMode,
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = minDistance,
                    onValueChange = { minDistance = it.filter { c -> c.isDigit() || c == '.' } },
                    label = { Text("Minimum distance (metres)") },
                    singleLine = true,
                    enabled = !demoMode,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = minTime,
                    onValueChange = { minTime = it.filter { c -> c.isDigit() || c == '.' } },
                    label = { Text("Minimum time (seconds)") },
                    singleLine = true,
                    enabled = !demoMode,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(12.dp))
                s.data.lastRunAt?.let {
                    ProfileCard(title = "Last run", value = it)
                    Spacer(Modifier.height(8.dp))
                }
                s.data.lastDeleted?.let {
                    ProfileCard(title = "Last deleted", value = it)
                    Spacer(Modifier.height(8.dp))
                }
                Button(
                    onClick = {
                        viewModel.save(
                            enabled = enabled,
                            minDistanceM = minDistance.toDoubleOrNull() ?: 25.0,
                            minTimeS = minTime.toDoubleOrNull() ?: 60.0,
                        )
                    },
                    enabled = !demoMode && !saving,
                    modifier = Modifier.fillMaxWidth().height(48.dp),
                ) { Text(if (saving) "Saving…" else "Save") }
            }
        }

        if (demoMode) {
            Spacer(Modifier.height(8.dp))
            Text(
                "Demo mode — connect to a real instance to configure sampling.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        message?.let { msg ->
            Spacer(Modifier.height(8.dp))
            Text(msg, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
        }
    }
}

@Composable
private fun ToggleRow(label: String, checked: Boolean, onCheckedChange: (Boolean) -> Unit, enabled: Boolean) {
    androidx.compose.foundation.layout.Row(
        verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Text(label, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
        Switch(checked = checked, onCheckedChange = onCheckedChange, enabled = enabled)
    }
}
