package io.github.nimbleflux.wayli.feature.travel

import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.AutoStories
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Route
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import io.github.nimbleflux.wayli.designsystem.CoverFallback
import io.github.nimbleflux.wayli.designsystem.DateBadge
import io.github.nimbleflux.wayli.designsystem.EmptyState
import io.github.nimbleflux.wayli.designsystem.ErrorState
import io.github.nimbleflux.wayli.designsystem.GlassIconButton
import io.github.nimbleflux.wayli.designsystem.GlassPill
import io.github.nimbleflux.wayli.designsystem.LoadingState
import io.github.nimbleflux.wayli.designsystem.SkeletonBox
import io.github.nimbleflux.wayli.designsystem.WayliAsyncImage
import io.github.nimbleflux.wayli.designsystem.bottomScrim
import io.github.nimbleflux.wayli.designsystem.fadeInUp
import io.github.nimbleflux.wayli.designsystem.map.MapTrack
import io.github.nimbleflux.wayli.designsystem.map.WayliMap
import io.github.nimbleflux.wayli.models.Trip
import kotlinx.coroutines.launch
import io.github.nimbleflux.wayli.models.TripEntry
import io.github.nimbleflux.wayli.models.distanceMeters
import org.maplibre.android.geometry.LatLng

/**
 * Trips list — immersive cover style (web public-trip-page parity):
 * - LazyColumn of full-bleed cover cards with scrim, title, and date range on the photo
 * - Glass "Ongoing" pill, staggered card entrances
 * - FAB to create a new trip
 * - Tap a card → navigate to detail
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TripsListScreen(
    onTripClick: (Trip) -> Unit,
    onNewTrip: () -> Unit,
    autoOpenCreate: Boolean = false,
    onAutoActionConsumed: () -> Unit = {},
    viewModel: TripViewModel = androidx.hilt.navigation.compose.hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()
    val previews by viewModel.journalPreviews.collectAsState()
    val online by viewModel.online.collectAsState()
    val detectMessage by viewModel.detectMessage.collectAsState()
    val detectRunning by viewModel.detectRunning.collectAsState()
    var showCreateDialog by remember { androidx.compose.runtime.mutableStateOf(false) }
    var showDetectSheet by remember { androidx.compose.runtime.mutableStateOf(false) }
    val snackbar = remember { SnackbarHostState() }

    LaunchedEffect(Unit) { viewModel.loadTrips() }

    // "New trip" launcher shortcut: open the create dialog once.
    LaunchedEffect(autoOpenCreate) {
        if (autoOpenCreate) {
            showCreateDialog = true
            onAutoActionConsumed()
        }
    }

    LaunchedEffect(detectMessage) {
        detectMessage?.let {
            snackbar.showSnackbar(it)
            viewModel.clearDetectMessage()
        }
    }

    if (showCreateDialog) {
        CreateTripDialog(
            onDismiss = { showCreateDialog = false },
            onCreate = { title, start, end, desc ->
                viewModel.createTrip(title, start, end, desc)
            },
        )
    }

    if (showDetectSheet) {
        TripDetectSheet(
            isDemo = viewModel.isDemoMode,
            running = detectRunning,
            onDismiss = { showDetectSheet = false },
            onSubmit = { start, end ->
                viewModel.submitTripGeneration(start, end)
                showDetectSheet = false
            },
        )
    }

    val trips = (uiState as? TripUiState.Success)?.trips.orEmpty()
    val totalEntries = previews.values.sumOf { it.entryCount }
    val totalKm = trips.sumOf { it.distanceMeters ?: 0.0 } / 1000.0

    // Entry filter (web parity: "With journal" lives as a filter chip there).
    var entryFilter by remember { mutableStateOf(false) }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbar) },
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Travel")
                        Text(
                            buildString {
                                append("${trips.size} ${if (trips.size == 1) "trip" else "trips"} · $totalEntries ")
                                append(if (totalEntries == 1) "entry" else "entries")
                                if (totalKm >= 1) append(" · ${formatDistance(totalKm * 1000)}")
                            },
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                },
                actions = {
                    IconButton(onClick = { showDetectSheet = true }) {
                        Icon(
                            Icons.Filled.AutoAwesome,
                            contentDescription = "Auto-detect trips",
                        )
                    }
                },
            )
        },
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = { showCreateDialog = true },
                modifier = Modifier.padding(bottom = 110.dp), // clear the floating dock
                icon = { Icon(Icons.Filled.Add, contentDescription = null) },
                text = { Text("New Trip") },
                containerColor = MaterialTheme.colorScheme.primary,
            )
        },
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            io.github.nimbleflux.wayli.designsystem.OfflineBanner(visible = !online)
            Crossfade(
                targetState = uiState,
                label = "tripsState",
                animationSpec = tween(300),
                modifier = Modifier.weight(1f),
            ) { state ->
            when (state) {
                is TripUiState.Loading -> {
                    LazyColumn(
                        // The outer Column already applies the scaffold padding.
                        modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        item { Spacer(Modifier.height(8.dp)) }
                        items(3) { TripCardSkeleton() }
                        item { Spacer(Modifier.height(100.dp)) }
                    }
                }
                is TripUiState.Error -> {
                    ErrorState(
                        message = state.message,
                        modifier = Modifier.padding(horizontal = 16.dp),
                    )
                }
                is TripUiState.Success -> {
                    if (state.trips.isEmpty()) {
                        EmptyState(
                            emoji = "🧳",
                            title = "No trips yet",
                            subtitle = "Tap 'New Trip' to create one",
                            modifier = Modifier.padding(horizontal = 16.dp),
                        )
                    } else {
                        val visibleTrips = if (entryFilter) {
                            trips.filter { (previews[it.id]?.entryCount ?: 0) > 0 }
                        } else {
                            trips
                        }
                        LazyColumn(
                            // The outer Column already applies the scaffold padding —
                            // applying it again pushed the filters off the header.
                            modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
                            verticalArrangement = Arrangement.spacedBy(16.dp),
                        ) {
                            item(key = "filter") {
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    androidx.compose.material3.FilterChip(
                                        selected = !entryFilter,
                                        onClick = { entryFilter = false },
                                        label = { Text("All") },
                                    )
                                    androidx.compose.material3.FilterChip(
                                        selected = entryFilter,
                                        onClick = { entryFilter = true },
                                        label = { Text("With entries") },
                                    )
                                }
                            }
                            if (visibleTrips.isEmpty()) {
                                item(key = "filter-empty") {
                                    Text(
                                        "No trips with entries yet",
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        modifier = Modifier.padding(vertical = 24.dp),
                                    )
                                }
                            }
                            item { Spacer(Modifier.height(4.dp)) }
                            itemsIndexed(visibleTrips, key = { _, trip -> trip.id }) { index, trip ->
                                TripCard(
                                    trip = trip,
                                    journalPreview = previews[trip.id],
                                    index = index,
                                    onClick = {
                                        viewModel.selectTrip(trip)
                                        onTripClick(trip)
                                    },
                                )
                            }
                            item { Spacer(Modifier.height(100.dp)) }
                        }
                    }
                }
            }
        }
        }
    }
}

/** Shimmering placeholder shown while trips load. */
@Composable
private fun TripCardSkeleton() {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.large,
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Column {
            SkeletonBox(Modifier.fillMaxWidth().height(200.dp))
            Column(modifier = Modifier.padding(16.dp)) {
                SkeletonBox(Modifier.fillMaxWidth(0.6f).height(20.dp))
                Spacer(Modifier.height(8.dp))
                SkeletonBox(Modifier.fillMaxWidth(0.4f).height(14.dp))
            }
        }
    }
}

/**
 * Trip card — full-bleed cover photo with a bottom scrim carrying the title
 * and date range; journal summary and description sit below the photo.
 */
@Composable
private fun TripCard(
    trip: Trip,
    journalPreview: JournalPreview? = null,
    index: Int = 0,
    onClick: () -> Unit,
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .fadeInUp(index)
            .clickable(onClick = onClick),
        shape = MaterialTheme.shapes.large,
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Column {
            Box(
                modifier = Modifier.fillMaxWidth().height(200.dp),
            ) {
                if (trip.imageUrl != null) {
                    WayliAsyncImage(
                        model = trip.imageUrl,
                        contentDescription = trip.title,
                        modifier = Modifier.fillMaxSize(),
                    )
                } else {
                    CoverFallback(modifier = Modifier.fillMaxSize())
                }
                Box(Modifier.matchParentSize().bottomScrim())
                if (trip.endDate == null) {
                    Box(
                        modifier = Modifier.align(Alignment.TopEnd).padding(12.dp),
                    ) { GlassPill("Ongoing") }
                }
                Column(
                    modifier = Modifier.align(Alignment.BottomStart).padding(16.dp),
                ) {
                    Text(
                        trip.title,
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                        color = Color.White,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Spacer(Modifier.height(2.dp))
                    Text(
                        formatDateRange(trip.startDate, trip.endDate),
                        style = MaterialTheme.typography.bodySmall,
                        color = Color.White.copy(alpha = 0.85f),
                    )
                }
            }

            Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    // Journal summary — merges the old Journals tab into Travel.
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        modifier = Modifier.weight(1f),
                    ) {
                        Icon(
                            Icons.Filled.AutoStories,
                            contentDescription = null,
                            modifier = Modifier.size(14.dp),
                            tint = MaterialTheme.colorScheme.primary,
                        )
                        val preview = journalPreview
                        if (preview != null && preview.entryCount > 0 && preview.latestTitle != null) {
                            Text(
                                "${preview.latestTitle} · ${preview.entryCount} " +
                                    if (preview.entryCount == 1) "entry" else "entries",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.primary,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        } else {
                            Text(
                                if (preview != null && preview.entryCount > 0) "${preview.entryCount} entries" else "No entries yet",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                    // Precomputed distance from metadata (hidden when absent —
                    // fresh/ongoing trips may not have it yet), web parity.
                    trip.distanceMeters?.let { meters ->
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                            modifier = Modifier.padding(start = 12.dp),
                        ) {
                            Icon(
                                Icons.Filled.Route,
                                contentDescription = null,
                                modifier = Modifier.size(14.dp),
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Text(
                                formatDistance(meters),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }

                trip.description?.takeIf { it.isNotBlank() }?.let {
                    Spacer(Modifier.height(4.dp))
                    Text(
                        it.take(120),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
    }
}

/**
 * Trip detail — immersive hero header (cover, scrim, overlaid title), route
 * map, and the journal timeline with date-badge entry cards. Loads its data
 * by trip id (from the nav route) via [TripDetailViewModel], so in demo mode
 * it shows the seeded entries and a representative route.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TripDetailScreen(
    onBack: () -> Unit,
    onOpenEntry: (entry: TripEntry) -> Unit,
    onNewEntry: () -> Unit,
    onOpenDraft: (draft: io.github.nimbleflux.wayli.repo.EntryDraft) -> Unit,
    viewModel: TripDetailViewModel = androidx.hilt.navigation.compose.hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()
    val entries by viewModel.entries.collectAsState()
    val drafts by viewModel.drafts.collectAsState()
    val media by viewModel.media.collectAsState()
    val snackbar = remember { androidx.compose.material3.SnackbarHostState() }
    val context = androidx.compose.ui.platform.LocalContext.current
    val shareScope = androidx.compose.runtime.rememberCoroutineScope()

    var showEdit by remember { androidx.compose.runtime.mutableStateOf(false) }
    var showDelete by remember { androidx.compose.runtime.mutableStateOf(false) }
    var showSharePublic by remember { androidx.compose.runtime.mutableStateOf(false) }
    var menuOpen by remember { androidx.compose.runtime.mutableStateOf(false) }

    fun launchShare(trip: Trip) {
        shareScope.launch {
            val link = viewModel.shareLinkFor(trip)
            val text = buildString {
                append("📍 ${trip.title}")
                append("\n${formatDateRange(trip.startDate, trip.endDate)}")
                link?.let { append("\n\n$it") }
            }
            val intent = android.content.Intent(android.content.Intent.ACTION_SEND).apply {
                type = "text/plain"
                putExtra(android.content.Intent.EXTRA_TEXT, text)
                putExtra(android.content.Intent.EXTRA_SUBJECT, trip.title)
            }
            context.startActivity(android.content.Intent.createChooser(intent, "Share trip"))
        }
    }

    // Re-check drafts whenever the screen (re)appears — the editor may have
    // auto-saved one while we were away.
    LaunchedEffect(Unit) { viewModel.refreshDrafts() }

    // The hero replaces the top bar on Success; other states keep the plain one.
    val isSuccess = state is TripDetailUiState.Success

    val currentTrip = (state as? TripDetailUiState.Success)?.data?.trip
    if (showEdit && currentTrip != null) {
        EditTripDialog(
            trip = currentTrip,
            onDismiss = { showEdit = false },
            onSave = { title, description, startDate, endDate, visibility ->
                showEdit = false
                viewModel.updateTrip(currentTrip.id, title, description, startDate, endDate, visibility) { ok ->
                    shareScope.launch {
                        snackbar.showSnackbar(if (ok) "Trip updated" else "Couldn't update trip")
                    }
                }
            },
        )
    }
    if (showDelete && currentTrip != null) {
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { showDelete = false },
            title = { Text("Delete trip?") },
            text = { Text("\"${currentTrip.title}\" and its journal entries will be removed. This can't be undone.") },
            confirmButton = {
                androidx.compose.material3.TextButton(onClick = {
                    showDelete = false
                    viewModel.deleteTrip(currentTrip.id) { onBack() }
                }) { Text("Delete", color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = {
                androidx.compose.material3.TextButton(onClick = { showDelete = false }) { Text("Cancel") }
            },
        )
    }
    if (showSharePublic && currentTrip != null) {
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { showSharePublic = false },
            title = { Text("Share a private trip?") },
            text = { Text("Only public trips can be opened from a share link. Make this trip public and share it?") },
            confirmButton = {
                androidx.compose.material3.TextButton(onClick = {
                    showSharePublic = false
                    val trip = currentTrip
                    viewModel.setVisibility(trip, "public") { ok ->
                        if (ok) launchShare(trip)
                    }
                }) { Text("Make public & share") }
            },
            dismissButton = {
                androidx.compose.material3.TextButton(onClick = { showSharePublic = false }) { Text("Cancel") }
            },
        )
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbar) },
        topBar = {
            if (!isSuccess) {
                TopAppBar(
                    title = { Text("Trip") },
                    navigationIcon = {
                        IconButton(onClick = onBack) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                        }
                    },
                )
            }
        },
        floatingActionButton = {
            FloatingActionButton(
                onClick = onNewEntry,
                containerColor = MaterialTheme.colorScheme.primary,
                contentColor = MaterialTheme.colorScheme.onPrimary,
            ) {
                Icon(Icons.Filled.Add, contentDescription = "Add journal entry")
            }
        },
    ) { padding ->
        when (val s = state) {
            is TripDetailUiState.Loading -> LoadingState(Modifier.padding(padding))
            is TripDetailUiState.Error -> ErrorState(s.message, modifier = Modifier.padding(padding))
            is TripDetailUiState.Success -> {
                val data = s.data
                LazyColumn(
                    modifier = Modifier.fillMaxSize().padding(padding),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    item(key = "hero") {
                        TripHero(
                            trip = data.trip,
                            coverUrl = viewModel.tripCoverFor(data.trip),
                            onBack = onBack,
                            menu = {
                                Box {
                                    GlassIconButton(
                                        icon = Icons.Filled.MoreVert,
                                        contentDescription = "Trip options",
                                        onClick = { menuOpen = true },
                                    )
                                    androidx.compose.material3.DropdownMenu(
                                        expanded = menuOpen,
                                        onDismissRequest = { menuOpen = false },
                                    ) {
                                        androidx.compose.material3.DropdownMenuItem(
                                            text = { Text("Edit trip") },
                                            onClick = { menuOpen = false; showEdit = true },
                                        )
                                        androidx.compose.material3.DropdownMenuItem(
                                            text = { Text("Share") },
                                            onClick = {
                                                menuOpen = false
                                                if (data.trip.visibility == "public") {
                                                    launchShare(data.trip)
                                                } else {
                                                    showSharePublic = true
                                                }
                                            },
                                        )
                                        androidx.compose.material3.DropdownMenuItem(
                                            text = { Text("Delete trip", color = MaterialTheme.colorScheme.error) },
                                            onClick = { menuOpen = false; showDelete = true },
                                        )
                                    }
                                }
                            },
                        )
                    }
                    item(key = "meta") { TripMetaRow(trip = data.trip, entryCount = entries.size) }
                    item(key = "map") {
                        val track by viewModel.track.collectAsState()
                        if (track.isNotEmpty()) TripMapCard(track = track)
                    }
                    item(key = "journal-header") {
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                "Journal",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                            )
                            Text(
                                "${entries.size} ${if (entries.size == 1) "entry" else "entries"}",
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                    drafts.forEach { draft ->
                        item(key = "draft-${draft.id}") {
                            DraftCard(
                                title = draft.title.ifBlank { "Untitled draft" },
                                pendingSync = draft.pendingSync,
                                onEdit = { onOpenDraft(draft) },
                                modifier = Modifier.padding(horizontal = 16.dp),
                            )
                        }
                    }
                    if (entries.isEmpty() && drafts.isEmpty()) {
                        item(key = "empty") {
                            Card(
                                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                                shape = MaterialTheme.shapes.medium,
                            ) {
                                Text(
                                    "No journal entries yet — tap + to write your first story.",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.padding(16.dp),
                                )
                            }
                        }
                    } else {
                        items(entries, key = { it.id }) { entry ->
                            val hero = if (viewModel.isDemoMode) {
                                io.github.nimbleflux.wayli.demo.DemoData.entryHeroes[entry.id]
                            } else {
                                viewModel.heroFor(entry)
                            }
                            val photoCount = media.count { it.entryId == entry.id }
                            JournalEntryCard(
                                entry = entry,
                                heroUrl = hero,
                                photoCount = photoCount,
                                onClick = { onOpenEntry(entry) },
                                modifier = Modifier.padding(horizontal = 16.dp).fadeInUp(),
                            )
                        }
                    }
                    item(key = "bottom") { Spacer(Modifier.height(96.dp)) }
                }
            }
        }
    }
}

/** Full-bleed trip hero: cover with scrim, back button, overlaid title, and a menu slot. */
@Composable
private fun TripHero(
    trip: Trip,
    coverUrl: String?,
    onBack: () -> Unit,
    menu: @Composable () -> Unit = {},
) {
    Box(modifier = Modifier.fillMaxWidth().height(280.dp)) {
        if (coverUrl != null) {
            WayliAsyncImage(
                model = coverUrl,
                contentDescription = trip.title,
                modifier = Modifier.fillMaxSize(),
            )
        } else {
            CoverFallback(modifier = Modifier.fillMaxSize(), icon = Icons.Filled.Map)
        }
        Box(Modifier.matchParentSize().bottomScrim())
        GlassIconButton(
            icon = Icons.AutoMirrored.Filled.ArrowBack,
            contentDescription = "Back",
            onClick = onBack,
            modifier = Modifier.align(Alignment.TopStart).statusBarsPadding().padding(12.dp),
        )
        Box(
            modifier = Modifier.align(Alignment.TopEnd).statusBarsPadding().padding(12.dp),
        ) {
            menu()
        }
        Column(
            modifier = Modifier.align(Alignment.BottomStart).padding(20.dp),
        ) {
            Text(
                trip.title,
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
                color = Color.White,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(4.dp))
            Text(
                formatDateRange(trip.startDate, trip.endDate),
                style = MaterialTheme.typography.bodyMedium,
                color = Color.White.copy(alpha = 0.85f),
            )
        }
    }
}

/** Icon chips under the hero: trip length and journal size. */
@Composable
private fun TripMetaRow(trip: Trip, entryCount: Int) {
    Column {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            MetaChip(icon = Icons.Filled.DateRange, text = "${tripDays(trip.startDate, trip.endDate)} days")
            MetaChip(
                icon = Icons.Filled.AutoStories,
                text = "$entryCount ${if (entryCount == 1) "entry" else "entries"}",
            )
            trip.distanceMeters?.let { meters ->
                MetaChip(icon = Icons.Filled.Route, text = formatDistance(meters))
            }
        }
        trip.description?.takeIf { it.isNotBlank() }?.let {
            Spacer(Modifier.height(8.dp))
            Text(
                it,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 16.dp),
            )
        }
    }
}

@Composable
private fun MetaChip(icon: ImageVector, text: String) {
    Surface(
        shape = RoundedCornerShape(10.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Icon(
                icon,
                contentDescription = null,
                modifier = Modifier.size(14.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                text,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

/** A locally saved draft: title + amber "Draft" label + edit button. */
@Composable
private fun DraftCard(
    title: String,
    pendingSync: Boolean,
    onEdit: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.medium,
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
        ),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Medium)
                    Spacer(Modifier.size(8.dp))
                    Surface(
                        shape = RoundedCornerShape(6.dp),
                        color = Color(0xFFD97706).copy(alpha = 0.15f), // web's amber draft badge
                    ) {
                        Text(
                            if (pendingSync) "Draft · online pending" else "Draft",
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                            style = MaterialTheme.typography.labelSmall,
                            color = Color(0xFFB45309),
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                }
            }
            androidx.compose.material3.IconButton(onClick = onEdit) {
                Icon(Icons.Filled.Edit, contentDescription = "Edit draft", tint = MaterialTheme.colorScheme.primary)
            }
        }
    }
}

/** Route map card with a header strip; auto-framed over the whole track. */
@Composable
private fun TripMapCard(track: List<Pair<Double, Double>>) {
    val tracks = listOf(MapTrack(track.map { p -> LatLng(p.first, p.second) }, color = "#3b82f6", width = 5f))
    Card(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp).height(220.dp),
        shape = MaterialTheme.shapes.large,
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Column {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Icon(
                    Icons.Filled.LocationOn,
                    contentDescription = null,
                    modifier = Modifier.size(14.dp),
                    tint = MaterialTheme.colorScheme.primary,
                )
                Text(
                    "Route",
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.weight(1f))
                Text(
                    "${track.size} pts",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Box(modifier = Modifier.fillMaxWidth().height(160.dp)) {
                WayliMap(
                    modifier = Modifier.fillMaxSize(),
                    tracks = tracks,
                )
            }
        }
    }
}

/** Journal entry card — hero photo over a date badge + title row. */
@Composable
private fun JournalEntryCard(
    entry: TripEntry,
    heroUrl: String? = null,
    photoCount: Int = 0,
    onClick: () -> Unit = {},
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier.fillMaxWidth().clickable(onClick = onClick),
        shape = MaterialTheme.shapes.large,
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Column {
            heroUrl?.let { url ->
                Box(modifier = Modifier.fillMaxWidth().height(160.dp)) {
                    WayliAsyncImage(
                        model = url,
                        contentDescription = entry.title ?: "Entry",
                        modifier = Modifier.fillMaxSize(),
                    )
                }
            }
            Row(
                modifier = Modifier.fillMaxWidth().padding(16.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                DateBadge(isoDate = entry.entryDate)
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        entry.title ?: "Entry",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    if (photoCount > 0) {
                        Text(
                            "$photoCount ${if (photoCount == 1) "photo" else "photos"}",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    entry.body?.let {
                        Spacer(Modifier.height(4.dp))
                        Text(
                            it,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
            }
        }
    }
}

/**
 * "Auto-detect trips" bottom sheet — submits the trip-generation job with an
 * optional date range (web travel-dashboard parity). Disabled in demo mode.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TripDetectSheet(
    isDemo: Boolean,
    running: Boolean,
    onDismiss: () -> Unit,
    onSubmit: (startDate: String?, endDate: String?) -> Unit,
) {
    var startDate by remember { androidx.compose.runtime.mutableStateOf("") }
    var endDate by remember { androidx.compose.runtime.mutableStateOf("") }

    androidx.compose.material3.ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 24.dp)
                .padding(bottom = 32.dp),
        ) {
            Text("Auto-detect trips", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(8.dp))
            Text(
                "Scan your location history and create trips from detected movement. Runs in the background — detected trips appear here when done.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(16.dp))

            androidx.compose.material3.OutlinedTextField(
                value = startDate,
                onValueChange = { startDate = it },
                label = { Text("From (YYYY-MM-DD, optional)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(8.dp))
            androidx.compose.material3.OutlinedTextField(
                value = endDate,
                onValueChange = { endDate = it },
                label = { Text("To (YYYY-MM-DD, optional)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(16.dp))

            androidx.compose.material3.Button(
                onClick = { onSubmit(startDate, endDate) },
                enabled = !isDemo && !running,
                modifier = Modifier.fillMaxWidth().height(48.dp),
            ) {
                Text(if (running) "Submitting…" else if (isDemo) "Demo mode" else "Detect trips")
            }
        }
    }
}
