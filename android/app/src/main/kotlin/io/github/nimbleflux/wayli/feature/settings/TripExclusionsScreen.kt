package io.github.nimbleflux.wayli.feature.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.nimbleflux.fluxbase.FluxbaseClient
import io.github.nimbleflux.wayli.designsystem.WayliSectionCard
import io.github.nimbleflux.wayli.demo.DemoManager
import io.github.nimbleflux.wayli.models.TripExclusion
import io.github.nimbleflux.wayli.models.TripExclusionCoords
import io.github.nimbleflux.wayli.models.TripExclusionLocation
import io.github.nimbleflux.wayli.repo.PreferencesRepository
import java.util.UUID
import javax.inject.Inject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

private const val MAX_EXCLUSIONS = 10

@HiltViewModel
class TripExclusionsViewModel @Inject constructor(
    private val prefsRepo: PreferencesRepository,
    private val demoManager: DemoManager,
    private val client: FluxbaseClient,
) : ViewModel() {

    val isDemo: Boolean get() = demoManager.isDemoMode
    private val userId: String? get() = client.auth.currentUser?.id

    sealed class UiState {
        object Loading : UiState()
        data class Loaded(val items: List<TripExclusion>) : UiState()
        data class Error(val message: String) : UiState()
    }

    private val _state = MutableStateFlow<UiState>(UiState.Loading)
    val state: StateFlow<UiState> = _state.asStateFlow()

    private val _busy = MutableStateFlow(false)
    val busy: StateFlow<Boolean> = _busy.asStateFlow()

    init { load() }

    fun load() {
        val uid = userId
        if (isDemo) { _state.value = UiState.Loaded(demoExclusions()); return }
        if (uid == null) { _state.value = UiState.Loaded(emptyList()); return }
        viewModelScope.launch(Dispatchers.IO) {
            prefsRepo.getTripExclusions(uid).fold(
                onSuccess = { _state.value = UiState.Loaded(it) },
                onFailure = { _state.value = UiState.Error(it.message ?: "Failed to load") },
            )
        }
    }

    fun save(item: TripExclusion) {
        val uid = userId ?: return
        if (isDemo || _busy.value) return
        viewModelScope.launch(Dispatchers.IO) {
            _busy.value = true
            val current = (state.value as? UiState.Loaded)?.items ?: emptyList()
            val updated = if (current.any { it.id == item.id }) {
                current.map { if (it.id == item.id) item.copy(updatedAt = nowIso()) else it }
            } else {
                if (current.size >= MAX_EXCLUSIONS) return@launch
                current + item.copy(createdAt = nowIso(), updatedAt = nowIso())
            }
            prefsRepo.saveTripExclusions(uid, updated).onSuccess { _state.value = UiState.Loaded(updated) }
            _busy.value = false
        }
    }

    fun delete(id: String) {
        val uid = userId ?: return
        if (isDemo || _busy.value) return
        viewModelScope.launch(Dispatchers.IO) {
            _busy.value = true
            val current = (state.value as? UiState.Loaded)?.items ?: emptyList()
            val updated = current.filterNot { it.id == id }
            prefsRepo.saveTripExclusions(uid, updated).onSuccess { _state.value = UiState.Loaded(updated) }
            _busy.value = false
        }
    }

    private fun nowIso(): String =
        java.time.Instant.now().toString()

    private fun demoExclusions(): List<TripExclusion> = listOf(
        TripExclusion("demo-home", "Home", TripExclusionLocation("Home", TripExclusionCoords(52.3676, 4.9041))),
        TripExclusion("demo-work", "Office", TripExclusionLocation("Office", TripExclusionCoords(52.3702, 4.8952))),
    )
}

@Composable
fun TripExclusionsScreen(
    onBack: () -> Unit,
    viewModel: TripExclusionsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()

    var editing by remember { mutableStateOf<TripExclusion?>(null) }
    var adding by remember { mutableStateOf(false) }
    var deleteTarget by remember { mutableStateOf<TripExclusion?>(null) }

    val loaded = (state as? TripExclusionsViewModel.UiState.Loaded)?.items ?: emptyList()

    SubScreenScaffold(
        title = "Trip Exclusions",
        onBack = onBack,
        actions = {
            if (!viewModel.isDemo && loaded.size < MAX_EXCLUSIONS) {
                ExtendedFloatingActionButton(
                    onClick = { adding = true },
                    icon = { Icon(Icons.Filled.Add, contentDescription = null) },
                    text = { Text("Add") },
                )
            }
        },
    ) {
        Text(
            "Excluded zones are ignored when Wayli detects trips — useful for home, work, or anywhere you stay put. Up to $MAX_EXCLUSIONS zones.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(12.dp))

        when (state) {
            is TripExclusionsViewModel.UiState.Loading -> ProfileCard("Status", "Loading…")
            is TripExclusionsViewModel.UiState.Error -> ProfileCard("Status", "Failed to load")
            is TripExclusionsViewModel.UiState.Loaded -> {
                if (loaded.isEmpty()) {
                    ProfileCard("No exclusions", "Add a zone to ignore it during trip detection.")
                } else {
                    loaded.forEach { item ->
                        Card(
                            modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                            elevation = CardDefaults.cardElevation(1.dp),
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth().padding(12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(item.name, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium)
                                    item.location.displayName?.takeIf { it.isNotBlank() && it != item.name }?.let {
                                        Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                    val c = item.location.coordinates
                                    if (c?.lat != null && c.lng != null) {
                                        Text(
                                            "%.4f, %.4f".format(c.lat, c.lng),
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                    }
                                }
                                if (!viewModel.isDemo) {
                                    IconButton(onClick = { editing = item }) {
                                        Icon(Icons.Filled.Edit, contentDescription = "Edit")
                                    }
                                    IconButton(onClick = { deleteTarget = item }) {
                                        Icon(Icons.Filled.Delete, contentDescription = "Delete")
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        if (viewModel.isDemo) {
            Spacer(Modifier.height(8.dp))
            Text(
                "Demo mode — exclusions are read-only.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }

    if (adding) {
        ExclusionEditDialog(
            title = "Add exclusion",
            initial = null,
            onDismiss = { adding = false },
            onSave = { viewModel.save(it); adding = false },
        )
    }
    editing?.let { item ->
        ExclusionEditDialog(
            title = "Edit exclusion",
            initial = item,
            onDismiss = { editing = null },
            onSave = { viewModel.save(it); editing = null },
        )
    }
    deleteTarget?.let { item ->
        AlertDialog(
            onDismissRequest = { deleteTarget = null },
            title = { Text("Delete ${item.name}?") },
            text = { Text("This zone will no longer be excluded from trip detection.") },
            confirmButton = {
                TextButton(onClick = { viewModel.delete(item.id); deleteTarget = null }) { Text("Delete") }
            },
            dismissButton = { TextButton(onClick = { deleteTarget = null }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun ExclusionEditDialog(
    title: String,
    initial: TripExclusion?,
    onDismiss: () -> Unit,
    onSave: (TripExclusion) -> Unit,
) {
    var name by remember { mutableStateOf(initial?.name ?: "") }
    var display by remember { mutableStateOf(initial?.location?.displayName ?: "") }
    var lat by remember { mutableStateOf(initial?.location?.coordinates?.lat?.toString() ?: "") }
    var lng by remember { mutableStateOf(initial?.location?.coordinates?.lng?.toString() ?: "") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column {
                OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Name") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(value = display, onValueChange = { display = it }, label = { Text("Display name (optional)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(8.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = lat, onValueChange = { lat = it }, label = { Text("Latitude") },
                        singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        modifier = Modifier.weight(1f),
                    )
                    OutlinedTextField(
                        value = lng, onValueChange = { lng = it }, label = { Text("Longitude") },
                        singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        },
        confirmButton = {
            TextButton(
                enabled = name.isNotBlank(),
                onClick = {
                    onSave(
                        TripExclusion(
                            id = initial?.id ?: UUID.randomUUID().toString(),
                            name = name.trim(),
                            location = TripExclusionLocation(
                                displayName = display.trim().ifBlank { null },
                                coordinates = TripExclusionCoords(lat.toDoubleOrNull(), lng.toDoubleOrNull()),
                            ),
                        ),
                    )
                },
            ) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}
