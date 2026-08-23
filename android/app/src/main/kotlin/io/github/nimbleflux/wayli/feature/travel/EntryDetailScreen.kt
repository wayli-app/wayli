package io.github.nimbleflux.wayli.feature.travel

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.nimbleflux.wayli.designsystem.DateBadge
import io.github.nimbleflux.wayli.demo.DemoManager
import io.github.nimbleflux.wayli.feature.media.MediaUploader
import io.github.nimbleflux.wayli.models.TripEntry
import io.github.nimbleflux.wayli.repo.TripRepository
import javax.inject.Inject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * The read view for a published journal entry: hero photo, title, date,
 * full body, and the entry's photo gallery. The top-bar Edit button opens
 * the editor — this screen is what a trip's journal overview navigates to.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EntryDetailScreen(
    onBack: () -> Unit,
    onEdit: (entry: TripEntry) -> Unit,
    viewModel: EntryDetailViewModel = hiltViewModel(),
) {
    val entry by viewModel.entry.collectAsState()
    val gallery by viewModel.gallery.collectAsState()
    var menuOpen by androidx.compose.runtime.remember { androidx.compose.runtime.mutableStateOf(false) }
    var confirmDelete by androidx.compose.runtime.remember { androidx.compose.runtime.mutableStateOf(false) }

    if (confirmDelete && entry != null) {
        val target = entry
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text("Delete entry?") },
            text = { Text("\"${target?.title ?: "This entry"}\" will be removed permanently.") },
            confirmButton = {
                androidx.compose.material3.TextButton(onClick = {
                    confirmDelete = false
                    target?.let { viewModel.deleteEntry(it) { onBack() } }
                }) { Text("Delete", color = androidx.compose.material3.MaterialTheme.colorScheme.error) }
            },
            dismissButton = {
                androidx.compose.material3.TextButton(onClick = { confirmDelete = false }) { Text("Cancel") }
            },
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(entry?.title ?: "Entry", maxLines = 1) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(onClick = { entry?.let(onEdit) }) {
                        Icon(Icons.Filled.Edit, contentDescription = "Edit entry")
                    }
                    Box {
                        IconButton(onClick = { menuOpen = true }) {
                            Icon(Icons.Filled.MoreVert, contentDescription = "Entry options")
                        }
                        androidx.compose.material3.DropdownMenu(
                            expanded = menuOpen,
                            onDismissRequest = { menuOpen = false },
                        ) {
                            androidx.compose.material3.DropdownMenuItem(
                                text = { Text("Delete entry") },
                                onClick = { menuOpen = false; confirmDelete = true },
                            )
                        }
                    }
                },
            )
        },
    ) { padding ->
        val e = entry ?: return@Scaffold
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp),
        ) {
            // Hero photo
            viewModel.heroUrl?.let { url ->
                io.github.nimbleflux.wayli.designsystem.WayliAsyncImage(
                    model = url,
                    contentDescription = e.title ?: "Entry",
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(220.dp)
                        .clip(RoundedCornerShape(16.dp)),
                )
                Spacer(Modifier.height(16.dp))
            }

            Row(verticalAlignment = Alignment.CenterVertically) {
                DateBadge(isoDate = e.entryDate)
                Spacer(Modifier.width(12.dp))
                Column {
                    Text(
                        e.title ?: "Entry",
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Bold,
                    )
                    Text(
                        formatFriendlyDate(e.entryDate),
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            e.body?.takeIf { it.isNotBlank() }?.let { body ->
                Spacer(Modifier.height(20.dp))
                // Render blank-line-separated paragraphs with breathing room.
                body.split(Regex("\n\\s*\n")).forEach { paragraph ->
                    if (paragraph.isNotBlank()) {
                        Text(paragraph.trim(), style = MaterialTheme.typography.bodyLarge)
                        Spacer(Modifier.height(12.dp))
                    }
                }
            }

            // Photo gallery (hero excluded — it's shown above)
            if (gallery.size > 1) {
                Spacer(Modifier.height(8.dp))
                Text("Photos", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(8.dp))
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(gallery.size) { i ->
                        io.github.nimbleflux.wayli.designsystem.WayliAsyncImage(
                            model = gallery[i],
                            contentDescription = "Photo ${i + 1}",
                            modifier = Modifier
                                .fillMaxWidth(0.45f)
                                .height(140.dp)
                                .clip(RoundedCornerShape(12.dp)),
                        )
                    }
                }
            }
            Spacer(Modifier.height(32.dp))
        }
    }
}

@HiltViewModel
class EntryDetailViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val demoManager: DemoManager,
    private val tripRepo: TripRepository,
    private val mediaUploader: MediaUploader,
) : ViewModel() {

    val tripId: String = savedStateHandle.get<String>("tripId") ?: ""
    val entryId: String = savedStateHandle.get<String>("entryId") ?: ""

    private val _entry = MutableStateFlow<TripEntry?>(null)
    val entry: StateFlow<TripEntry?> = _entry.asStateFlow()

    private val _gallery = MutableStateFlow<List<String>>(emptyList())
    val gallery: StateFlow<List<String>> = _gallery.asStateFlow()

    /** Delete the entry (owner-only via RLS); demo/local entries just vanish. */
    fun deleteEntry(entry: TripEntry, onDone: (Boolean) -> Unit = {}) {
        if (demoManager.isDemoMode || entry.id.startsWith("local-")) {
            _entry.value = null
            onDone(true)
            return
        }
        viewModelScope.launch(Dispatchers.IO) {
            val result = tripRepo.deleteEntry(entry.id)
            _entry.value = null
            kotlinx.coroutines.withContext(Dispatchers.Main) { onDone(result.isSuccess) }
        }
    }

    /** Hero URL — computed once the gallery resolves (cover rule applied). */
    var heroUrl: String? = null
        private set

    init {
        viewModelScope.launch(Dispatchers.IO) { load() }
    }

    private suspend fun load() {
        if (demoManager.isDemoMode) {
            val demo = io.github.nimbleflux.wayli.demo.DemoData.entries[tripId]
                ?.firstOrNull { it.id == entryId }
            _entry.value = demo
            heroUrl = io.github.nimbleflux.wayli.demo.DemoData.entryHeroes[entryId]
            _gallery.value = heroUrl?.let { listOf(it) } ?: emptyList()
            return
        }

        val entry = tripRepo.listEntries(tripId).getOrNull()
            ?.firstOrNull { it.id == entryId }
        _entry.value = entry ?: return

        val media = tripRepo.listMedia(tripId, entryId).getOrNull().orEmpty()
        val urls = coroutineScope {
            media.map { m ->
                async {
                    mediaUploader.getSignedUrl(path = m.storagePath).getOrNull()?.let { m.id to it }
                }
            }.map { it.await() }
        }.filterNotNull().toMap()
        val ordered = media.mapNotNull { urls[it.id] }

        // Cover rule: cover_media_id → first by sort_order.
        val coverId = entry.coverMediaId
        heroUrl = if (coverId != null) urls[coverId] ?: ordered.firstOrNull() else ordered.firstOrNull()
        _gallery.value = ordered
    }
}
