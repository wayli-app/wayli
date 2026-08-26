package io.github.nimbleflux.wayli.feature.travel

import androidx.compose.foundation.background
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.aspectRatio

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
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.AddPhotoAlternate
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Star
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
    /** Existing server media for the edited entry (id + display URL). */
    val existingMedia: List<ExistingMedia> = emptyList(),

    /** The entry's current cover (hero) media id, for the ★ indicator. */
    val heroMediaId: String? = null,
    val saving: Boolean = false,
    val pendingSyncNotice: Boolean = false,
    val loaded: Boolean = false,
    /** Preview (read-only render) vs Edit — Edit is the default; toggle in the top bar. */
    val previewMode: Boolean = false,
)

/** A server-side photo attached to the entry being edited. */
data class ExistingMedia(val id: String, val url: String, val storagePath: String = "")

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

    /** Draft-relevant fields only — preview mode, cover picks and server-photo
     * deletes are not draft content; changing them must NOT conjure a draft
     * for an otherwise-unchanged published entry. */
    private data class DraftContent(
        val title: String,
        val body: String,
        val entryDate: String,
        val photos: List<String>,
    )

    /** Draft content at load time — persist() only acts on divergence. */
    private var baseline: DraftContent? = null

    /** The draft row resumed from nav args (never auto-deleted on close). */
    private val resumedDraftId: String? = draftId

    private fun draftContentOf(state: EditorState) = DraftContent(
        title = state.title,
        body = state.body,
        entryDate = state.entryDate,
        photos = state.localPhotos,
    )

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
        var existingMedia = emptyList<List<ExistingMedia>>()

        var entryCoverId: String? = null
        if (editing) {
            if (cached != null && cached.id == entryId) {
                title = cached.title.orEmpty()
                body = cached.body.orEmpty()
                date = cached.entryDate
                entryCoverId = cached.coverMediaId
            } else if (!demoManager.isDemoMode) {
                tripRepo.listEntries(tripId).getOrNull()
                    ?.firstOrNull { it.id == entryId }
                    ?.let { entry ->
                        title = entry.title.orEmpty()
                        body = entry.body.orEmpty()
                        date = entry.entryDate
                        entryCoverId = entry.coverMediaId
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

        // Existing server photos load on EVERY edit — the cache-hit branch
        // above used to skip this, which hid the × / ★ management entirely.
        if (editing && !demoManager.isDemoMode) {
            existingMedia = listOf(
                tripRepo.listMedia(tripId, entryId).getOrNull().orEmpty()
                    .mapNotNull { media ->
                        mediaUploader.resolveDisplayUrl(storagePath = media.storagePath)
                            ?.let { ExistingMedia(media.id, it, media.storagePath) }
                    },
            )
        }

        _state.value = EditorState(
            draftId = draft?.id.orEmpty(),
            isEdit = editing,
            heroMediaId = entryCoverId,
            title = title,
            body = body,
            entryDate = date,
            localPhotos = localPhotos,
            existingMedia = existingMedia.firstOrNull().orEmpty(),
            pendingSyncNotice = draft?.pendingSync == true,
            loaded = true,
        )
        lastSaved = draft
        baseline = draftContentOf(_state.value)
    }

    fun togglePreview() = update { it.copy(previewMode = !it.previewMode) }

    // ---- Field updates (auto-save via persist()) ----

    fun setTitle(value: String) = update { it.copy(title = value) }
    fun setBody(value: String) = update { it.copy(body = value) }
    fun setDate(value: String) = update { it.copy(entryDate = value) }

    /** Copies the picked image into app storage so the draft survives restarts. */
    fun addPhoto(uri: Uri) {
        viewModelScope.launch(Dispatchers.IO) {
            runCatching { copyPhotoLocally(uri) }
                .onSuccess { path ->
                    update { it.copy(localPhotos = it.localPhotos + path) }
                }.onFailure {
                    message.value = "Could not read the selected photo"
                }
        }
    }

    /**
     * Adds a photo AND embeds it inline at the end of the story text —
     * photos can live between paragraphs, not only in the bottom gallery.
     */
    fun addPhotoInline(uri: Uri) {
        viewModelScope.launch(Dispatchers.IO) {
            runCatching { copyPhotoLocally(uri) }
                .onSuccess { path ->
                    update { state ->
                        val index = state.localPhotos.size
                        state.copy(
                            localPhotos = state.localPhotos + path,
                            body = InlineMedia.appendDraftImage(state.body, index),
                        )
                    }
                }.onFailure {
                    message.value = "Could not read the selected photo"
                }
        }
    }

    private fun copyPhotoLocally(uri: Uri): String {
        val dir = File(appContext.filesDir, "entry-media").apply { mkdirs() }
        val file = File(dir, "${UUID.randomUUID()}.jpg")
        appContext.contentResolver.openInputStream(uri)!!.use { input ->
            file.outputStream().use { output -> input.copyTo(output) }
        }
        return file.absolutePath
    }

    fun removePhoto(path: String) = update { it.copy(localPhotos = it.localPhotos - path) }

    /**
     * Swap two photo positions for reordering. Both indices are positions in
     * the combined strip (existing server photos first, then local picks);
     * a null [from] just returns the tapped index for selection state.
     */
    fun toggleSwap(from: Int?, to: Int): Int? {
        if (from == null || from == to) return to
        update { state ->
            val existing = state.existingMedia.toMutableList()
            val local = state.localPhotos.toMutableList()
            val existingCount = existing.size
            when {
                from < existingCount && to < existingCount -> {
                    val a = existing[from]
                    existing[from] = existing[to]
                    existing[to] = a
                }
                from >= existingCount && to >= existingCount -> {
                    val fi = from - existingCount
                    val ti = to - existingCount
                    val a = local[fi]
                    local[fi] = local[ti]
                    local[ti] = a
                }
                else -> return@update state // cross-list swaps not meaningful
            }
            state.copy(existingMedia = existing, localPhotos = local)
        }
        return null
    }

    /** Delete an existing server photo from the entry (row + storage, best effort). */
    fun deleteExistingMedia(mediaId: String) {
        update { it.copy(existingMedia = it.existingMedia.filterNot { m -> m.id == mediaId }) }
        if (!demoManager.isDemoMode && entryId != null) {
            viewModelScope.launch(Dispatchers.IO) {
                tripRepo.deleteMedia(mediaId).onFailure {
                    message.value = "Couldn't delete the photo: ${it.message ?: "network error"}"
                }
            }
        }
    }

    /** Make an existing photo the entry's cover (hero). */
    fun setCover(mediaId: String) {
        update { it.copy(heroMediaId = mediaId) } // optimistic ★ indicator
        if (demoManager.isDemoMode || entryId == null) return
        viewModelScope.launch(Dispatchers.IO) {
            tripRepo.updateEntryCover(entryId!!, mediaId)
                .onSuccess { message.value = "Cover updated" }
                .onFailure { message.value = "Couldn't set the cover: ${it.message ?: "network error"}" }
        }
    }

    private fun update(transform: (EditorState) -> EditorState) {
        _state.value = transform(_state.value)
        persist()
    }

    /**
     * Debounced draft persistence — one stable draft row per editor session.
     * A draft is only written when the draft-relevant content has DIVERGED
     * from the loaded baseline; reverting back to baseline deletes the draft
     * row again, so closing an unchanged editor never leaves a phantom
     * "draft" behind for a published entry.
     */
    private fun persist() {
        val snapshot = _state.value
        val base = baseline ?: return
        if (draftContentOf(snapshot) == base) {
            deleteSessionDraftIfAny()
            return
        }
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

    /**
     * Remove a draft row created THIS session (not one resumed from args)
     * when its content matches the baseline. Called from persist() on
     * revert and from onCleared() so closing an unchanged editor —
     * including via the system back gesture — leaves no draft behind.
     */
    private fun deleteSessionDraftIfAny() {
        val current = _state.value
        val id = current.draftId.takeIf { it.isNotBlank() } ?: return
        if (id == resumedDraftId) return
        if (current.pendingSyncNotice || sessionDraftPendingSync) return
        viewModelScope.launch(Dispatchers.IO) {
            runCatching { draftRepo.delete(id) }
            if (_state.value.draftId == id) {
                _state.value = _state.value.copy(draftId = "")
            }
        }
    }

    /** True once save() queued this session's draft for background publish. */
    @Volatile private var sessionDraftPendingSync = false

    override fun onCleared() {
        // Closing the editor without net changes (arrow OR system back) must
        // not leave a phantom draft — viewModelScope is already cancelled by
        // the time onCleared runs, so this tiny Room delete runs blocking.
        val state = _state.value
        val base = baseline
        val id = state.draftId.takeIf { it.isNotBlank() }
        if (base != null && draftContentOf(state) == base &&
            id != null && id != resumedDraftId && !sessionDraftPendingSync
        ) {
            runCatching { kotlinx.coroutines.runBlocking { draftRepo.delete(id) } }
        }
        super.onCleared()
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
                sessionDraftPendingSync = true
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

        // Upload local photos FIRST: the body's wayli-draft: tokens are
        // rewritten to the final storage paths, so the entry row is written
        // with its definitive body in one go.
        val uploadedPaths = mutableListOf<String>()
        snapshot.localPhotos.forEachIndexed { _, path ->
            val storagePath = mediaUploader.uploadPhoto(appContext, Uri.fromFile(File(path))).getOrNull()
                ?: return PublishResult.Failed
            uploadedPaths += storagePath
        }
        val body = InlineMedia.rewriteDraftTokens(snapshot.body.trim()) { index ->
            uploadedPaths.getOrNull(index)
        }.takeIf { it.isNotBlank() }

        val targetEntryId: String = if (entryId != null) {
            val updated = tripRepo.updateEntry(entryId, title, date, body)
            if (updated.isFailure) return PublishResult.Failed
            entryId
        } else {
            val created = tripRepo.createEntry(tripId, title, date, body)
            created.getOrNull()?.id ?: return PublishResult.Failed
        }

        // Attach the uploaded photos as media rows.
        uploadedPaths.forEachIndexed { index, storagePath ->
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

    // Inline variant — the photo is appended to the story text, not the grid.
    val inlinePhotoPicker = androidx.activity.compose.rememberLauncherForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.PickVisualMedia(),
    ) { uri -> uri?.let(viewModel::addPhotoInline) }

    // Destructive photo removals ask first — deleting a server photo also
    // removes the stored file.
    var pendingPhotoDelete by remember {
        androidx.compose.runtime.mutableStateOf<Pair<String, () -> Unit>?>(null)
    }
    if (pendingPhotoDelete != null) {
        val (label, confirm) = pendingPhotoDelete!!
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { pendingPhotoDelete = null },
            title = { Text("Remove photo?") },
            text = { Text("$label will be removed${if (state.isEdit) " everywhere" else ""}. This can't be undone.") },
            confirmButton = {
                androidx.compose.material3.TextButton(onClick = {
                    confirm()
                    pendingPhotoDelete = null
                }) { Text("Remove", color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = {
                androidx.compose.material3.TextButton(onClick = { pendingPhotoDelete = null }) { Text("Cancel") }
            },
        )
    }

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
                        onClick = { viewModel.togglePreview() },
                        enabled = state.loaded && !state.saving,
                    ) { Text(if (state.previewMode) "Edit" else "Preview") }
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
                .verticalScroll(rememberScrollState())
                .imePadding(),
        ) {
            if (state.previewMode) {
                // ---- Preview pane: read-only render (also used for drafts) ----
                // Tokens resolve to real display URLs (server photos) or local
                // files (picks not yet uploaded); photos already placed inline
                // are not repeated in the strip below.
                val previewBody = remember(state.body, state.existingMedia, state.localPhotos) {
                    InlineMedia.resolve(
                        state.body,
                        resolveMedia = { path -> state.existingMedia.firstOrNull { it.storagePath == path }?.url },
                        resolveDraft = { index -> state.localPhotos.getOrNull(index)?.let { java.io.File(it).toURI().toString() } },
                    )
                }
                val inlineDraftIndexes = remember(state.body) { InlineMedia.inlineDraftIndexes(state.body) }
                val inlinePaths = remember(state.body) { InlineMedia.inlineMediaPaths(state.body) }
                EntryPreviewPane(
                    title = state.title,
                    body = previewBody,
                    entryDate = state.entryDate,
                    photos = state.existingMedia.filterNot { it.storagePath in inlinePaths }.map { it.url } +
                        state.localPhotos.mapIndexed { i, path -> i to path }
                            .filterNot { it.first in inlineDraftIndexes }
                            .map { java.io.File(it.second) },
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
            // ---- Body editor: fixed generous height; the column scrolls,
            // so a tall photo grid below can't crush the field to zero. ----
            androidx.compose.material3.OutlinedTextField(
                value = state.body,
                onValueChange = viewModel::setBody,
                label = { Text("Your story…") },
                modifier = Modifier.fillMaxWidth().heightIn(min = 220.dp),
                textStyle = MaterialTheme.typography.bodyLarge,
            )
            // Photos land INLINE at the end of the story (drag the token in
            // the text to move it); the bottom grid is for the rest.
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End,
            ) {
                androidx.compose.material3.TextButton(
                    onClick = {
                        inlinePhotoPicker.launch(
                            androidx.activity.result.PickVisualMediaRequest(
                                androidx.activity.result.contract.ActivityResultContracts.PickVisualMedia.ImageOnly,
                            ),
                        )
                    },
                    enabled = !state.saving,
                ) {
                    Icon(
                        androidx.compose.material.icons.Icons.Filled.AddPhotoAlternate,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp),
                    )
                    Spacer(Modifier.size(6.dp))
                    Text("Add photo in text", style = MaterialTheme.typography.labelMedium)
                }
            }
            Spacer(Modifier.height(4.dp))

            // ---- Photos: grid below the editor. Tap one photo, then
            // another, to swap their positions (reorder). ----
            if (state.existingMedia.isNotEmpty() || state.localPhotos.isNotEmpty()) {
                Text(
                    "Photos — tap two to swap order",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(8.dp))
            }
            var swapFrom by remember { androidx.compose.runtime.mutableStateOf<Int?>(null) }
            val existingCount = state.existingMedia.size
            val totalCount = existingCount + state.localPhotos.size + 1
            val columns = 3
            (0 until totalCount).chunked(columns).forEach { rowIndices ->
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    rowIndices.forEach { index ->
                        Box(Modifier.weight(1f).height(104.dp)) {
                            when {
                                index < existingCount -> {
                                    val media = state.existingMedia[index]
                                    PhotoTile(
                                        model = media.url,
                                        selected = swapFrom == index,
                                        isHero = media.id == state.heroMediaId,
                                        onRemove = {
                                            pendingPhotoDelete = "This photo" to { viewModel.deleteExistingMedia(media.id) }
                                        },
                                        onSetCover = { viewModel.setCover(media.id) },
                                        onToggleSelect = {
                                            swapFrom = if (swapFrom == index) null else viewModel.toggleSwap(swapFrom, index).let { null }
                                        },
                                    )
                                }
                                index < existingCount + state.localPhotos.size -> {
                                    val path = state.localPhotos[index - existingCount]
                                    PhotoTile(
                                        model = java.io.File(path),
                                        selected = swapFrom == index,
                                        onRemove = {
                                            pendingPhotoDelete = "This photo" to { viewModel.removePhoto(path) }
                                        },
                                        onToggleSelect = {
                                            swapFrom = if (swapFrom == index) null else viewModel.toggleSwap(swapFrom, index).let { null }
                                        },
                                    )
                                }
                                else -> AddPhotoTile(
                                    onAdd = {
                                        photoPicker.launch(
                                            androidx.activity.result.PickVisualMediaRequest(
                                                androidx.activity.result.contract.ActivityResultContracts.PickVisualMedia.ImageOnly,
                                            ),
                                        )
                                    },
                                    modifier = Modifier.fillMaxWidth(),
                                )
                            }
                        }
                    }
                    // Pad short rows so tiles keep grid width.
                    repeat(columns - rowIndices.size) { Spacer(Modifier.weight(1f)) }
                }
                Spacer(Modifier.height(8.dp))
            }
        }
    }
}

@Composable
private fun PhotoTile(
    model: Any,
    onRemove: () -> Unit,
    onSetCover: (() -> Unit)? = null,
    selected: Boolean = false,
    isHero: Boolean = false,
    onToggleSelect: () -> Unit = {},
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .clip(androidx.compose.foundation.shape.RoundedCornerShape(12.dp))
            .then(
                if (selected) {
                    Modifier.border(
                        3.dp,
                        MaterialTheme.colorScheme.primary,
                        androidx.compose.foundation.shape.RoundedCornerShape(12.dp),
                    )
                } else {
                    Modifier
                },
            ),
    ) {
        io.github.nimbleflux.wayli.designsystem.WayliAsyncImage(
            model = model,
            contentDescription = "Photo",
            contentScale = androidx.compose.ui.layout.ContentScale.Crop,
            modifier = Modifier
                .matchParentSize()
                .clickable(onClick = onToggleSelect),
        )
        if (isHero) {
            // Vector icons center optically inside the badge; text glyphs
            // ("★") sit off-center because of font metrics.
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .padding(4.dp)
                    .background(
                        MaterialTheme.colorScheme.surface.copy(alpha = 0.85f),
                        androidx.compose.foundation.shape.RoundedCornerShape(8.dp),
                    )
                    .padding(3.dp),
            ) {
                Icon(
                    Icons.Filled.Star,
                    contentDescription = "Cover photo",
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(14.dp),
                )
            }
        }
        if (onSetCover != null) {
            androidx.compose.material3.Surface(
                shape = androidx.compose.foundation.shape.CircleShape,
                color = MaterialTheme.colorScheme.surface.copy(alpha = 0.85f),
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .padding(4.dp)
                    .size(26.dp),
            ) {
                androidx.compose.material3.IconButton(onClick = onSetCover, modifier = Modifier.size(26.dp)) {
                    Icon(
                        Icons.Filled.Star,
                        contentDescription = "Set as cover",
                        modifier = Modifier.size(15.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
        androidx.compose.material3.Surface(
            shape = androidx.compose.foundation.shape.CircleShape,
            color = MaterialTheme.colorScheme.surface.copy(alpha = 0.85f),
            modifier = Modifier
                .align(Alignment.TopEnd)
                .padding(4.dp)
                .size(26.dp),
        ) {
            androidx.compose.material3.IconButton(onClick = onRemove, modifier = Modifier.size(26.dp)) {
                Icon(
                    Icons.Filled.Close,
                    contentDescription = "Remove photo",
                    modifier = Modifier.size(15.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun AddPhotoTile(onAdd: () -> Unit, modifier: Modifier = Modifier) {
    androidx.compose.material3.Surface(
        shape = androidx.compose.foundation.shape.RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surfaceVariant,
        onClick = onAdd,
        modifier = modifier.fillMaxSize(),
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

/** "2026-08-15" (or full timestamp) → "Aug 15, 2026"; today when unparseable. */
internal fun formatFriendlyDate(iso: String): String {
    val date = io.github.nimbleflux.wayli.util.parseIsoDate(iso) ?: java.time.LocalDate.now()
    return java.time.format.DateTimeFormatter.ofPattern("MMM d, yyyy")
        .format(date)
}

/** ISO date/timestamp → epoch millis for the picker (UTC midnight); today as fallback. */
internal fun parseDateMillis(iso: String): Long {
    val date = io.github.nimbleflux.wayli.util.parseIsoDate(iso) ?: java.time.LocalDate.now()
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
                io.github.nimbleflux.wayli.designsystem.WayliAsyncImage(
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
            io.github.nimbleflux.wayli.designsystem.MarkdownText(markdown = body)
        }

        if (photos.size > 1) {
            Spacer(Modifier.height(20.dp))
            Text("Photos", style = MaterialTheme.typography.titleSmall, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold)
            Spacer(Modifier.height(8.dp))
            androidx.compose.foundation.lazy.LazyRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(photos.size - 1) { i ->
                    io.github.nimbleflux.wayli.designsystem.WayliAsyncImage(
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
