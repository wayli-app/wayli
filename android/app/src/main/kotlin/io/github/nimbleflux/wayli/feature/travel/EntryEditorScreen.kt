package io.github.nimbleflux.wayli.feature.travel

import android.content.Context
import android.net.Uri
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import io.github.nimbleflux.wayli.demo.DemoManager
import io.github.nimbleflux.wayli.feature.media.MediaUploader
import io.github.nimbleflux.wayli.models.TripEntry
import io.github.nimbleflux.wayli.repo.DraftRepository
import io.github.nimbleflux.wayli.repo.EntryDraft
import io.github.nimbleflux.wayli.repo.TripRepository
import java.io.File
import java.util.UUID
import javax.inject.Inject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.AddPhotoAlternate
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/**
 * Hands an in-memory [TripEntry] to the editor (demo mode / just-created
 * entries) without serializing it through nav args. Set right before
 * navigating; consumed (and cleared) by [EntryEditorViewModel].
 */
object EntryEditorInputCache {
    var entry: TripEntry? = null
}

/**
 * Hands a saved entry back to the trip screen (demo in-memory entries)
 * alongside the nav-graph "entry_saved" result.
 */
object EntryEditorResultCache {
    var entry: TripEntry? = null
}

/** Everything the editor renders. */
data class EditorState(
    /** Stable id of the backing draft row (assigned on first auto-save). */
    val draftId: String = "",
    val isEdit: Boolean = false,
    val title: String = "",
    val body: String = "",
    val entryDate: String = "",
    /** Newly picked photos — local app-file paths, uploaded on save. */
    val localPhotos: List<String> = emptyList(),
    /** Existing server media for the edited entry, as signed URLs. */
    val existingMediaUrls: List<String> = emptyList(),
    val saving: Boolean = false,
    val pendingSyncNotice: Boolean = false,
    val loaded: Boolean = false,
    /** Preview (read-only render) vs Edit. Preview is default when content exists. */
    val previewMode: Boolean = false,
)

/**
 * Backing for the full-screen journal-entry editor (Polarsteps-style).
 *
 * - The whole state auto-saves as a local draft (debounced) — nothing is
 *   lost on process death, and composing works fully offline.
 * - Save publishes: demo keeps the entry in memory; real mode
 *   creates/updates the entry, uploads photos, and attaches media rows.
 *   When publishing fails (offline), the draft is marked PENDING_SYNC and
 *   [io.github.nimbleflux.wayli.tracking.EntrySyncWorker] retries later.
 */
@HiltViewModel
class EntryEditorViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    @ApplicationContext private val appContext: Context,
    private val tripRepo: TripRepository,
    private val draftRepo: DraftRepository,
    private val mediaUploader: MediaUploader,
    private val demoManager: DemoManager,
) : ViewModel() {

    val tripId: String = savedStateHandle.get<String>("tripId") ?: ""
    /** Existing entry being edited, if any. */
    val entryId: String? = savedStateHandle.get<String>("entryId")?.takeIf { it.isNotBlank() }
    /** An existing draft being resumed, if any. */
    val draftId: String? = savedStateHandle.get<String>("draftId")?.takeIf { it.isNotBlank() }

    val isDemo: Boolean get() = demoManager.isDemoMode

    private val _state = MutableStateFlow(EditorState())
    val state: StateFlow<EditorState> = _state.asStateFlow()

    /** Set on successful save; the screen pops back and hands this to the trip screen. */
    val savedEntry = MutableStateFlow<TripEntry?>(null)
    val message = MutableStateFlow<String?>(null)

    /** true when the save was queued offline instead of published. */
    val queuedOffline = MutableStateFlow(false)

    private var lastSaved: EntryDraft? = null

    init {
        viewModelScope.launch(Dispatchers.IO) { loadInitial() }
    }

    private suspend fun loadInitial() {
        val cached = EntryEditorInputCache.entry
        EntryEditorInputCache.entry = null

        val editing = entryId != null
        var title = ""
        var body = ""
        var date = java.time.LocalDate.now().toString()
        var existingMedia = emptyList<String>()

        if (editing) {
            if (cached != null && cached.id == entryId) {
                title = cached.title.orEmpty()
                body = cached.body.orEmpty()
                date = cached.entryDate
            } else if (!demoManager.isDemoMode) {
                tripRepo.listEntries(tripId).getOrNull()
                    ?.firstOrNull { it.id == entryId }
                    ?.let { entry ->
                        title = entry.title.orEmpty()
                        body = entry.body.orEmpty()
                        date = entry.entryDate
                    }
                existingMedia = tripRepo.listMedia(tripId, entryId).getOrNull().orEmpty()
                    .mapNotNull { media ->
                        mediaUploader.getSignedUrl(path = media.storagePath).getOrNull()
                    }
            } else {
                io.github.nimbleflux.wayli.demo.DemoData.entries[tripId]
                    ?.firstOrNull { it.id == entryId }
                    ?.let { entry ->
                        title = entry.title.orEmpty()
                        body = entry.body.orEmpty()
                        date = entry.entryDate
                    }
            }
        }

        // Resuming a specific draft (multi-draft: the trip screen routes to
        // one) — its content wins over the entry's server content.
        val draft = draftId?.let { draftRepo.get(it) }
        if (draft != null) {
            title = draft.title.ifBlank { title }
            body = draft.body.ifBlank { body }
            if (draft.entryDate.isNotBlank()) date = draft.entryDate
        }
        val localPhotos = draft?.photos.orEmpty()

        _state.value = EditorState(
            draftId = draft?.id.orEmpty(),
            isEdit = editing,
            title = title,
            body = body,
            entryDate = date,
            localPhotos = localPhotos,
            existingMediaUrls = existingMedia,
            pendingSyncNotice = draft?.pendingSync == true,
            loaded = true,
            previewMode = title.isNotBlank() || body.isNotBlank(),
        )
        lastSaved = draft
    }

    fun togglePreview() = update { it.copy(previewMode = !it.previewMode) }

    // ---- Field updates (auto-save via persist()) ----

    fun setTitle(value: String) = update { it.copy(title = value) }
    fun setBody(value: String) = update { it.copy(body = value) }
    fun setDate(value: String) = update { it.copy(entryDate = value) }

    /** Copies the picked image into app storage so the draft survives restarts. */
    fun addPhoto(uri: Uri) {
        viewModelScope.launch(Dispatchers.IO) {
            runCatching {
                val dir = File(appContext.filesDir, "entry-media").apply { mkdirs() }
                val file = File(dir, "${UUID.randomUUID()}.jpg")
                appContext.contentResolver.openInputStream(uri)!!.use { input ->
                    file.outputStream().use { output -> input.copyTo(output) }
                }
                file.absolutePath
            }.onSuccess { path ->
                update { it.copy(localPhotos = it.localPhotos + path) }
            }.onFailure {
                message.value = "Could not read the selected photo"
            }
        }
    }

    fun removePhoto(path: String) = update { it.copy(localPhotos = it.localPhotos - path) }

    private fun update(transform: (EditorState) -> EditorState) {
        _state.value = transform(_state.value)
        persist()
    }

    /** Debounced draft persistence — one stable draft row per editor session. */
    private fun persist() {
        val snapshot = _state.value
        viewModelScope.launch(Dispatchers.IO) {
            kotlinx.coroutines.delay(800) // debounce
            if (snapshot !== _state.value && !savingNow()) return@launch // superseded
            val draft = EntryDraft(
                id = snapshot.draftId,
                tripId = tripId,
                entryId = entryId,
                title = snapshot.title,
                body = snapshot.body,
                entryDate = snapshot.entryDate,
                photos = snapshot.localPhotos,
            )
            val id = draftRepo.save(draft)
            if (snapshot.draftId.isBlank()) {
                _state.value = _state.value.copy(draftId = id)
            }
            lastSaved = draft
        }
    }

    private fun savingNow() = _state.value.saving

    // ---- Save / publish ----

    fun save() {
        val snapshot = _state.value
        if (snapshot.title.isBlank()) {
            message.value = "Add a title first"
            return
        }
        _state.value = snapshot.copy(saving = true)
        viewModelScope.launch(Dispatchers.IO) {
            if (demoManager.isDemoMode) {
                val entry = TripEntry(
                    id = entryId ?: "local-${System.currentTimeMillis()}",
                    tripId = tripId,
                    entryDate = snapshot.entryDate.ifBlank { java.time.LocalDate.now().toString() },
                    title = snapshot.title.trim(),
                    body = snapshot.body.trim().takeIf { it.isNotBlank() },
                    status = "published",
                    createdAt = "",
                    updatedAt = "",
                )
                if (snapshot.draftId.isNotBlank()) draftRepo.delete(snapshot.draftId)
                _state.value = _state.value.copy(saving = false)
                EntryEditorResultCache.entry = entry
                savedEntry.value = entry
                return@launch
            }

            val published = publishReal(snapshot)
            _state.value = _state.value.copy(saving = false)
            if (published == PublishResult.Done) {
                if (snapshot.draftId.isNotBlank()) draftRepo.delete(snapshot.draftId)
                savedEntry.value = TripEntry(
                    id = entryId ?: "saved",
                    tripId = tripId,
                    entryDate = snapshot.entryDate,
                    title = snapshot.title.trim(),
                    body = snapshot.body.trim().takeIf { it.isNotBlank() },
                )
            } else {
                // Offline (or server unreachable): keep everything as a
                // pending draft; the sync worker publishes it later. Make
                // sure a draft row exists even if auto-save hasn't fired.
                val draftIdNow = snapshot.draftId.ifBlank {
                    draftRepo.save(
                        EntryDraft(
                            tripId = tripId,
                            entryId = entryId,
                            title = snapshot.title,
                            body = snapshot.body,
                            entryDate = snapshot.entryDate,
                            photos = snapshot.localPhotos,
                        ),
                    )
                }
                draftRepo.markPendingSync(draftIdNow)
                io.github.nimbleflux.wayli.tracking.EntrySyncWorker.schedule(appContext)
                queuedOffline.value = true
                message.value = "No connection — saved as a draft. It will be published automatically when you're back online."
            }
        }
    }

    private enum class PublishResult { Done, Failed }

    private suspend fun publishReal(snapshot: EditorState): PublishResult {
        val title = snapshot.title.trim()
        val date = snapshot.entryDate.ifBlank { java.time.LocalDate.now().toString() }
        val body = snapshot.body.trim().takeIf { it.isNotBlank() }

        val targetEntryId: String = if (entryId != null) {
            val updated = tripRepo.updateEntry(entryId, title, date, body)
            if (updated.isFailure) return PublishResult.Failed
            entryId
        } else {
            val created = tripRepo.createEntry(tripId, title, date, body)
            created.getOrNull()?.id ?: return PublishResult.Failed
        }

        // Upload newly added photos and attach them to the entry.
        snapshot.localPhotos.forEachIndexed { index, path ->
            val uploaded = mediaUploader.uploadPhoto(appContext, Uri.fromFile(File(path)))
            val storagePath = uploaded.getOrNull() ?: return PublishResult.Failed
            if (tripRepo.createMedia(tripId, targetEntryId, storagePath, index).isFailure) {
                return PublishResult.Failed
            }
        }
        return PublishResult.Done
    }

    fun clearMessage() { message.value = null }
}


// ---- UI ----

/**
 * Full-screen journal-entry editor (Polarsteps-style): date + title on top,
 * a photo strip, and a body editor that fills the remaining height.
 * Every keystroke auto-saves a local draft — closing mid-edit loses nothing.
 */
@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
fun EntryEditorScreen(
    onBack: () -> Unit,
    onSaved: () -> Unit,
    viewModel: EntryEditorViewModel = androidx.hilt.navigation.compose.hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()
    val savedEntry by viewModel.savedEntry.collectAsState()
    val message by viewModel.message.collectAsState()
    val queuedOffline by viewModel.queuedOffline.collectAsState()
    val snackbar = remember { androidx.compose.material3.SnackbarHostState() }

    val photoPicker = androidx.activity.compose.rememberLauncherForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.PickVisualMedia(),
    ) { uri -> uri?.let(viewModel::addPhoto) }

    LaunchedEffect(savedEntry) {
        if (savedEntry != null) onSaved()
    }
    LaunchedEffect(message) {
        message?.let {
            snackbar.showSnackbar(it)
            viewModel.clearMessage()
        }
    }
    LaunchedEffect(queuedOffline) {
        if (queuedOffline) {
            viewModel.queuedOffline.value = false
            onSaved()
        }
    }

    androidx.compose.material3.Scaffold(
        snackbarHost = { androidx.compose.material3.SnackbarHost(snackbar) },
        topBar = {
            androidx.compose.material3.TopAppBar(
                title = { Text(if (state.isEdit) "Edit entry" else "New entry") },
                navigationIcon = {
                    androidx.compose.material3.IconButton(onClick = onBack) {
                        Icon(
                            androidx.compose.material.icons.Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Back",
                        )
                    }
                },
                actions = {
                    androidx.compose.material3.TextButton(
                        onClick = { viewModel.save() },
                        enabled = state.loaded && !state.saving,
                    ) { Text("Save", fontWeight = FontWeight.Bold) }
                },
            )
        },
    ) { padding ->
        if (!state.loaded) {
            Box(
                modifier = Modifier.fillMaxSize().padding(padding),
                contentAlignment = Alignment.Center,
            ) { androidx.compose.material3.CircularProgressIndicator() }
            return@Scaffold
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 20.dp)
                .imePadding(),
        ) {
            if (state.previewMode) {
                // ---- Preview pane: read-only render (also used for drafts) ----
                EntryPreviewPane(
                    title = state.title,
                    body = state.body,
                    entryDate = state.entryDate,
                    photos = state.existingMediaUrls +
                        state.localPhotos.map { java.io.File(it) },
                )
                return@Column
            }

            if (state.pendingSyncNotice) {
                androidx.compose.material3.Surface(
                    shape = androidx.compose.foundation.shape.RoundedCornerShape(12.dp),
                    color = MaterialTheme.colorScheme.tertiary.copy(alpha = 0.12f),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        "Draft waiting to go online — it will publish automatically.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(12.dp),
                    )
                }
                Spacer(Modifier.height(12.dp))
            }

            // ---- Date: friendly display + Material date picker ----
            var showDatePicker by remember { androidx.compose.runtime.mutableStateOf(false) }
            val formattedDate = remember(state.entryDate) { formatFriendlyDate(state.entryDate) }
            androidx.compose.material3.OutlinedButton(
                onClick = { showDatePicker = true },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Icon(
                    androidx.compose.material.icons.Icons.Filled.DateRange,
                    contentDescription = null,
                    modifier = Modifier.size(18.dp),
                )
                Spacer(Modifier.size(8.dp))
                Text(formattedDate)
            }
            if (showDatePicker) {
                val pickerState = androidx.compose.material3.rememberDatePickerState(
                    initialSelectedDateMillis = parseDateMillis(state.entryDate),
                )
                androidx.compose.material3.DatePickerDialog(
                    onDismissRequest = { showDatePicker = false },
                    confirmButton = {
                        androidx.compose.material3.TextButton(
                            onClick = {
                                pickerState.selectedDateMillis?.let { millis ->
                                    viewModel.setDate(millisToIsoDate(millis))
                                }
                                showDatePicker = false
                            },
                        ) { Text("OK") }
                    },
                    dismissButton = {
                        androidx.compose.material3.TextButton(onClick = { showDatePicker = false }) { Text("Cancel") }
                    },
                ) {
                    androidx.compose.material3.DatePicker(state = pickerState)
                }
            }
            Spacer(Modifier.height(16.dp))

            // ---- Title: big placeholder-styled field (no label) ----
            androidx.compose.material3.OutlinedTextField(
                value = state.title,
                onValueChange = viewModel::setTitle,
                placeholder = {
                    Text(
                        "Title",
                        style = MaterialTheme.typography.headlineSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                textStyle = MaterialTheme.typography.headlineSmall,
            )
            Spacer(Modifier.height(12.dp))

            // ---- Photo strip: existing media + new local picks + add tile ----
            androidx.compose.foundation.lazy.LazyRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.fillMaxWidth(),
            ) {
                val existingCount = state.existingMediaUrls.size
                val totalCount = existingCount + state.localPhotos.size + 1
                items(totalCount) { index ->
                    when {
                        index < existingCount ->
                            PhotoTile(model = state.existingMediaUrls[index]) {}
                        index < existingCount + state.localPhotos.size -> {
                            val path = state.localPhotos[index - existingCount]
                            PhotoTile(model = java.io.File(path)) { viewModel.removePhoto(path) }
                        }
                        else -> AddPhotoTile {
                            photoPicker.launch(
                                androidx.activity.result.PickVisualMediaRequest(
                                    androidx.activity.result.contract.ActivityResultContracts.PickVisualMedia.ImageOnly,
                                ),
                            )
                        }
                    }
                }
            }
            Spacer(Modifier.height(12.dp))

            // ---- Body editor: fills the remaining height ----
            androidx.compose.material3.OutlinedTextField(
                value = state.body,
                onValueChange = viewModel::setBody,
                label = { Text("Your story…") },
                modifier = Modifier.fillMaxWidth().weight(1f),
                textStyle = MaterialTheme.typography.bodyLarge,
            )
            Spacer(Modifier.height(12.dp))
        }
    }
}

@Composable
private fun PhotoTile(model: Any, onRemove: () -> Unit) {
    Box {
        coil.compose.AsyncImage(
            model = model,
            contentDescription = "Photo",
            contentScale = androidx.compose.ui.layout.ContentScale.Crop,
            modifier = Modifier
                .size(84.dp)
                .clip(androidx.compose.foundation.shape.RoundedCornerShape(12.dp)),
        )
        androidx.compose.material3.Surface(
            shape = androidx.compose.foundation.shape.CircleShape,
            color = MaterialTheme.colorScheme.surface.copy(alpha = 0.85f),
            modifier = Modifier
                .align(Alignment.TopEnd)
                .padding(4.dp)
                .size(24.dp),
        ) {
            androidx.compose.material3.IconButton(onClick = onRemove, modifier = Modifier.size(24.dp)) {
                Text("×", style = MaterialTheme.typography.titleMedium)
            }
        }
    }
}

@Composable
private fun AddPhotoTile(onAdd: () -> Unit) {
    androidx.compose.material3.Surface(
        shape = androidx.compose.foundation.shape.RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surfaceVariant,
        onClick = onAdd,
        modifier = Modifier.size(84.dp),
    ) {
        Box(contentAlignment = Alignment.Center, modifier = Modifier.fillMaxSize()) {
            Icon(
                androidx.compose.material.icons.Icons.Filled.AddPhotoAlternate,
                contentDescription = "Add photo",
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

// ---- Date helpers ----

/** "2026-08-15" → "Aug 15, 2026" (today's date when unparseable/blank). */
internal fun formatFriendlyDate(iso: String): String {
    val date = runCatching { java.time.LocalDate.parse(iso) }.getOrNull()
        ?: java.time.LocalDate.now()
    return java.time.format.DateTimeFormatter.ofPattern("MMM d, yyyy")
        .format(date)
}

/** ISO date → epoch millis for the picker (UTC midnight); today as fallback. */
internal fun parseDateMillis(iso: String): Long {
    val date = runCatching { java.time.LocalDate.parse(iso) }.getOrNull()
        ?: java.time.LocalDate.now()
    return date.atStartOfDay(java.time.ZoneOffset.UTC).toInstant().toEpochMilli()
}

/** Picker epoch millis (UTC midnight) → ISO "yyyy-MM-dd". */
internal fun millisToIsoDate(millis: Long): String =
    java.time.Instant.ofEpochMilli(millis)
        .atZone(java.time.ZoneOffset.UTC)
        .toLocalDate()
        .toString()

/**
 * Read-only render of the story — the preview mode of the editor. Reuses
 * the same visual language as [EntryDetailScreen].
 */
@Composable
private fun EntryPreviewPane(
    title: String,
    body: String,
    entryDate: String,
    photos: List<Any>,
) {
    Column(modifier = Modifier.fillMaxSize()) {
        if (photos.isNotEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(220.dp)
                    .clip(androidx.compose.foundation.shape.RoundedCornerShape(16.dp)),
            ) {
                coil.compose.AsyncImage(
                    model = photos.first(),
                    contentDescription = "Hero photo",
                    contentScale = androidx.compose.ui.layout.ContentScale.Crop,
                    modifier = Modifier.fillMaxSize(),
                )
            }
            Spacer(Modifier.height(16.dp))
        }

        Text(
            title.ifBlank { "Untitled" },
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = androidx.compose.ui.text.font.FontWeight.Bold,
        )
        Spacer(Modifier.height(4.dp))
        Text(
            formatFriendlyDate(entryDate),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (body.isNotBlank()) {
            Spacer(Modifier.height(16.dp))
            Text(body, style = MaterialTheme.typography.bodyLarge)
        }

        if (photos.size > 1) {
            Spacer(Modifier.height(20.dp))
            Text("Photos", style = MaterialTheme.typography.titleSmall, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold)
            Spacer(Modifier.height(8.dp))
            androidx.compose.foundation.lazy.LazyRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(photos.size - 1) { i ->
                    coil.compose.AsyncImage(
                        model = photos[i + 1],
                        contentDescription = "Photo",
                        contentScale = androidx.compose.ui.layout.ContentScale.Crop,
                        modifier = Modifier
                            .fillMaxWidth(0.45f)
                            .height(140.dp)
                            .clip(androidx.compose.foundation.shape.RoundedCornerShape(12.dp)),
                    )
                }
            }
        }
        Spacer(Modifier.height(24.dp))
    }
}
