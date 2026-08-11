package io.github.nimbleflux.wayli.feature.settings

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.ClipboardManager
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.nimbleflux.fluxbase.FluxbaseClient
import io.github.nimbleflux.wayli.demo.DemoManager
import io.github.nimbleflux.wayli.designsystem.WayliSectionCard
import io.github.nimbleflux.wayli.repo.SecretsRepository
import io.github.nimbleflux.wayli.session.InstanceManager
import javax.inject.Inject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.security.SecureRandom

private const val OWNTRACKS_KEY = "owntracks_api_key"
private const val PEXELS_KEY = "pexels_api_key"

@HiltViewModel
class ConnectionsViewModel @Inject constructor(
    private val secretsRepo: SecretsRepository,
    private val instanceManager: InstanceManager,
    private val demoManager: DemoManager,
    private val client: FluxbaseClient,
) : ViewModel() {

    val isDemo: Boolean get() = demoManager.isDemoMode
    val baseUrl: String? get() = instanceManager.getConfig()?.url
    val userId: String? get() = client.auth.currentUser?.id

    sealed class UiState {
        object Loading : UiState()
        data class Loaded(
            val owntracksSet: Boolean,
            val owntracksUpdatedAt: String?,
            val pexelsSet: Boolean,
            val pexelsUpdatedAt: String?,
        ) : UiState()
        data class Error(val message: String) : UiState()
    }

    private val _state = MutableStateFlow<UiState>(UiState.Loading)
    val state: StateFlow<UiState> = _state.asStateFlow()

    private val _generatedKey = MutableStateFlow<String?>(null)
    val generatedKey: StateFlow<String?> = _generatedKey.asStateFlow()

    private val _busy = MutableStateFlow(false)
    val busy: StateFlow<Boolean> = _busy.asStateFlow()

    init { refresh() }

    fun refresh() {
        if (isDemo) { _state.value = UiState.Loaded(true, null, false, null); return }
        viewModelScope.launch(Dispatchers.IO) {
            val result = secretsRepo.listSecrets()
            result.fold(
                onSuccess = { list ->
                    val ot = list.firstOrNull { it.key == OWNTRACKS_KEY }
                    val px = list.firstOrNull { it.key == PEXELS_KEY }
                    _state.value = UiState.Loaded(
                        owntracksSet = ot != null,
                        owntracksUpdatedAt = ot?.updatedAt,
                        pexelsSet = px != null,
                        pexelsUpdatedAt = px?.updatedAt,
                    )
                },
                onFailure = { _state.value = UiState.Error(it.message ?: "Failed to load") },
            )
        }
    }

    fun endpointFor(key: String): String {
        val base = baseUrl?.trimEnd('/') ?: ""
        val uid = userId ?: ""
        return "$base/api/v1/functions/owntracks-points/invoke?namespace=wayli&api_key=$key&user_id=$uid"
    }

    fun generateOwnTracksKey() {
        if (isDemo || _busy.value) return
        viewModelScope.launch(Dispatchers.IO) {
            _busy.value = true
            val key = randomHex(16)
            secretsRepo.setSecret(OWNTRACKS_KEY, key, "OwnTracks integration API key")
                .onSuccess { _generatedKey.value = key; refresh() }
            _busy.value = false
        }
    }

    fun savePexelsKey(value: String) {
        if (isDemo || _busy.value) return
        viewModelScope.launch(Dispatchers.IO) {
            _busy.value = true
            secretsRepo.setSecret(PEXELS_KEY, value.trim(), "Pexels API key for trip images")
            refresh()
            _busy.value = false
        }
    }

    fun deletePexelsKey() {
        if (isDemo || _busy.value) return
        viewModelScope.launch(Dispatchers.IO) {
            _busy.value = true
            secretsRepo.deleteSecret(PEXELS_KEY)
            refresh()
            _busy.value = false
        }
    }

    fun clearGenerated() { _generatedKey.value = null }

    private fun randomHex(bytes: Int): String {
        val out = ByteArray(bytes)
        SecureRandom().nextBytes(out)
        return out.joinToString("") { "%02x".format(it) }
    }
}

@Composable
fun ConnectionsScreen(
    onBack: () -> Unit,
    viewModel: ConnectionsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()
    val generated by viewModel.generatedKey.collectAsState()
    val busy by viewModel.busy.collectAsState()
    val clipboard = LocalClipboardManager.current

    var pexelsInput by remember { mutableStateOf("") }
    var showPexelsField by remember { mutableStateOf(false) }

    SubScreenScaffold(title = "Connections & Integrations", onBack = onBack) {
        WayliSectionCard(title = "OwnTracks") {
            Text(
                "Connect an OwnTracks device to feed location points into Wayli. Generate a private API key and point your device at the endpoint shown after creation.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(12.dp))
            when (val s = state) {
                is ConnectionsViewModel.UiState.Loading ->
                    ProfileCard("API key", "Loading…")
                is ConnectionsViewModel.UiState.Error ->
                    ProfileCard("API key", "Not loaded", s.message)
                is ConnectionsViewModel.UiState.Loaded -> {
                    ProfileCard(
                        title = "API key",
                        value = if (s.owntracksSet) "Configured" else "Not configured",
                        subtitle = s.owntracksUpdatedAt?.let { "Updated $it" },
                    )
                    Spacer(Modifier.height(8.dp))
                    Button(
                        onClick = { viewModel.generateOwnTracksKey() },
                        enabled = !viewModel.isDemo && !busy,
                        modifier = Modifier.fillMaxWidth().height(48.dp),
                    ) { Text(if (s.owntracksSet) "Regenerate key" else "Generate key") }
                }
            }
            if (viewModel.isDemo) DemoNote()
        }

        Spacer(Modifier.height(8.dp))

        WayliSectionCard(title = "Trip images (Pexels)") {
            Text(
                "Add your own Pexels API key to source trip cover images. The key is stored encrypted and never shown again after saving.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(12.dp))
            when (val s = state) {
                is ConnectionsViewModel.UiState.Loaded -> {
                    ProfileCard(
                        title = "Pexels API key",
                        value = if (s.pexelsSet) "Configured" else "Not configured",
                        subtitle = s.pexelsUpdatedAt?.let { "Updated $it" },
                    )
                    Spacer(Modifier.height(8.dp))
                    if (showPexelsField) {
                        OutlinedTextField(
                            value = pexelsInput,
                            onValueChange = { pexelsInput = it },
                            label = { Text("Pexels API key") },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                            modifier = Modifier.fillMaxWidth(),
                        )
                        Spacer(Modifier.height(8.dp))
                        Button(
                            onClick = {
                                viewModel.savePexelsKey(pexelsInput)
                                pexelsInput = ""
                                showPexelsField = false
                            },
                            enabled = pexelsInput.isNotBlank() && !viewModel.isDemo && !busy,
                            modifier = Modifier.fillMaxWidth().height(48.dp),
                        ) { Text("Save key") }
                    } else {
                        Button(
                            onClick = { showPexelsField = true },
                            enabled = !viewModel.isDemo && !busy,
                            modifier = Modifier.fillMaxWidth().height(48.dp),
                        ) { Text(if (s.pexelsSet) "Replace key" else "Add key") }
                    }
                    if (s.pexelsSet) {
                        Spacer(Modifier.height(8.dp))
                        OutlinedButton(
                            onClick = { viewModel.deletePexelsKey() },
                            enabled = !viewModel.isDemo && !busy,
                            modifier = Modifier.fillMaxWidth().height(48.dp),
                        ) { Text("Remove key") }
                    }
                }
                is ConnectionsViewModel.UiState.Loading -> ProfileCard("Pexels API key", "Loading…")
                is ConnectionsViewModel.UiState.Error -> ProfileCard("Pexels API key", "Not loaded")
            }
            Spacer(Modifier.height(8.dp))
            Text(
                "Per-user rate limit isn't available in the Android app yet.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }

    if (generated != null) {
        GeneratedKeyDialog(
            key = generated!!,
            endpoint = viewModel.endpointFor(generated!!),
            clipboard = clipboard,
            onDismiss = { viewModel.clearGenerated() },
        )
    }
}

@Composable
private fun GeneratedKeyDialog(
    key: String,
    endpoint: String,
    clipboard: ClipboardManager,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("OwnTracks key created") },
        text = {
            Column {
                Text("Save this key now — it won't be shown again:", style = MaterialTheme.typography.bodySmall)
                Spacer(Modifier.height(12.dp))
                ProfileCard(title = "API key", value = key)
                Spacer(Modifier.height(4.dp))
                TextButton(onClick = { clipboard.setText(AnnotatedString(key)) }) { Text("Copy API key") }
                Spacer(Modifier.height(8.dp))
                ProfileCard(title = "Endpoint", value = endpoint)
                Spacer(Modifier.height(4.dp))
                TextButton(onClick = { clipboard.setText(AnnotatedString(endpoint)) }) { Text("Copy endpoint") }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                clipboard.setText(AnnotatedString(endpoint))
                onDismiss()
            }) { Text("Copy endpoint & close") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Close") } },
    )
}

@Composable
private fun DemoNote() {
    Spacer(Modifier.height(8.dp))
    Text(
        "Demo mode — connect to a real instance to manage integrations.",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}
