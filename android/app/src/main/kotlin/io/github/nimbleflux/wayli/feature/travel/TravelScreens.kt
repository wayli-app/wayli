package io.github.nimbleflux.wayli.feature.travel

import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.tween
import androidx.compose.foundation.clickable
import androidx.compose.foundation.background
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.AutoStories
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberModalBottomSheetState

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
import io.github.nimbleflux.wayli.designsystem.EmptyState
import io.github.nimbleflux.wayli.designsystem.ErrorState
import io.github.nimbleflux.wayli.designsystem.LoadingState
import io.github.nimbleflux.wayli.designsystem.SkeletonBox
import io.github.nimbleflux.wayli.designsystem.WayliAsyncImage
import io.github.nimbleflux.wayli.designsystem.map.MapTrack
import io.github.nimbleflux.wayli.designsystem.map.WayliMap
import io.github.nimbleflux.wayli.models.Trip
import io.github.nimbleflux.wayli.models.TripEntry
import org.maplibre.android.geometry.LatLng

/**
 * Trips list — mobile-optimized with:
 * - LazyColumn of trip cards (not a grid)
 * - Each card: title, date range, cover image, entry count
 * - FAB to create a new trip
 * - Tap a card → navigate to detail
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TripsListScreen(
    onTripClick: (Trip) -> Unit,
    onNewTrip: () -> Unit,
    viewModel: TripViewModel = androidx.hilt.navigation.compose.hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()
    val detectMessage by viewModel.detectMessage.collectAsState()
    val detectRunning by viewModel.detectRunning.collectAsState()
    var showCreateDialog by remember { androidx.compose.runtime.mutableStateOf(false) }
    var showDetectSheet by remember { androidx.compose.runtime.mutableStateOf(false) }
    val snackbar = remember { SnackbarHostState() }

    LaunchedEffect(Unit) { viewModel.loadTrips() }

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

    Scaffold(
        snackbarHost = { SnackbarHost(snackbar) },
        topBar = {
            TopAppBar(
                title = { Text("Travel") },
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
        Crossfade(
            targetState = uiState,
            label = "tripsState",
            animationSpec = tween(300),
        ) { state ->
            when (state) {
                is TripUiState.Loading -> {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize().padding(padding).padding(horizontal = 16.dp),
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
                        modifier = Modifier.padding(padding),
                    )
                }
                is TripUiState.Success -> {
                    if (state.trips.isEmpty()) {
                        EmptyState(
                            emoji = "🧳",
                            title = "No trips yet",
                            subtitle = "Tap 'New Trip' to create one",
                            modifier = Modifier.padding(padding),
                        )
                    } else {
                        LazyColumn(
                            modifier = Modifier.fillMaxSize().padding(padding).padding(horizontal = 16.dp),
                            verticalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            item { Spacer(Modifier.height(8.dp)) }
                            items(state.trips, key = { it.id }) { trip ->
                                val preview by viewModel.journalPreviews.collectAsState()
                                TripCard(
                                    trip = trip,
                                    journalPreview = preview[trip.id],
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

/** Shimmering placeholder shown while trips load. */
@Composable
private fun TripCardSkeleton() {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.medium,
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
    ) {
        Column {
            SkeletonBox(Modifier.fillMaxWidth().height(140.dp))
            Column(modifier = Modifier.padding(16.dp)) {
                SkeletonBox(Modifier.fillMaxWidth(0.6f).height(20.dp))
                Spacer(Modifier.height(8.dp))
                SkeletonBox(Modifier.fillMaxWidth(0.4f).height(14.dp))
            }
        }
    }
}

/**
 * Trip card — compact, tappable card showing the trip's key info.
 */
@Composable
private fun TripCard(trip: Trip, journalPreview: JournalPreview? = null, onClick: () -> Unit) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(16.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
    ) {
        Column {
            // Cover image — loads from URL via Coil, with gradient overlay
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(140.dp)
                    .clip(RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp)),
                contentAlignment = Alignment.Center,
            ) {
                trip.imageUrl?.let { url ->
                    WayliAsyncImage(
                        model = url,
                        contentDescription = trip.title,
                        modifier = Modifier.fillMaxSize(),
                    )
                } ?: run {
                    // Gradient placeholder when no image
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(MaterialTheme.colorScheme.surfaceVariant),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            Icons.Filled.LocationOn,
                            contentDescription = null,
                            modifier = Modifier.size(32.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f),
                        )
                    }
                }
            }

            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    trip.title,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                )
                Spacer(Modifier.height(4.dp))

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Icon(
                        Icons.Filled.DateRange,
                        contentDescription = null,
                        modifier = Modifier.size(14.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        "${trip.startDate.take(7)} • ${trip.endDate?.take(7) ?: "ongoing"}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }

                // Journal summary — merges the old Journals tab into Travel.
                journalPreview?.let { preview ->
                    Spacer(Modifier.height(8.dp))
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Icon(
                            Icons.Filled.AutoStories,
                            contentDescription = null,
                            modifier = Modifier.size(14.dp),
                            tint = MaterialTheme.colorScheme.primary,
                        )
                        if (preview.entryCount > 0 && preview.latestTitle != null) {
                            Text(
                                "${preview.latestTitle} · ${preview.entryCount} " +
                                    if (preview.entryCount == 1) "entry" else "entries",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.primary,
                                maxLines = 1,
                                overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                            )
                        } else {
                            Text(
                                "No entries yet",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }

                trip.description?.takeIf { it.isNotBlank() }?.let {
                    Spacer(Modifier.height(4.dp))
                    Text(
                        it.take(100),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 2,
                    )
                }
            }
        }
    }
}

/**
 * Trip detail — trip header, a map of the route, and the journal entries.
 * Loads its data by trip id (from the nav route) via [TripDetailViewModel], so
 * in demo mode it shows the seeded entries and a representative route.
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
    val snackbar = remember { androidx.compose.material3.SnackbarHostState() }

    // Re-check drafts whenever the screen (re)appears — the editor may have
    // auto-saved one while we were away.
    LaunchedEffect(Unit) { viewModel.refreshDrafts() }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbar) },
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        (state as? TripDetailUiState.Success)?.data?.trip?.title ?: "Trip",
                        maxLines = 1,
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
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
                    modifier = Modifier.fillMaxSize().padding(padding).padding(horizontal = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    item { Spacer(Modifier.height(4.dp)) }
                    item { TripHeaderCard(data.trip) }
                    item {
                        val track by viewModel.track.collectAsState()
                        if (track.isNotEmpty()) TripMapCard(track = track)
                    }
                    item {
                        Text(
                            "Journal",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(top = 4.dp),
                        )
                    }
                    drafts.forEach { draft ->
                        item(key = "draft-${draft.id}") {
                            DraftCard(
                                title = draft.title.ifBlank { "Untitled draft" },
                                pendingSync = draft.pendingSync,
                                onEdit = { onOpenDraft(draft) },
                            )
                        }
                    }
                    if (entries.isEmpty() && drafts.isEmpty()) {
                        item {
                            Card(modifier = Modifier.fillMaxWidth(), shape = MaterialTheme.shapes.medium) {
                                Text(
                                    "No journal entries yet",
                                    style = MaterialTheme.typography.bodyMedium,
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
                            JournalEntryCard(entry = entry, heroUrl = hero, onClick = { onOpenEntry(entry) })
                        }
                    }
                    item { Spacer(Modifier.height(24.dp)) }
                }
            }
        }
    }
}

@Composable
private fun AssistChipDraft(label: String, onClick: () -> Unit) {
    androidx.compose.material3.AssistChip(
        onClick = onClick,
        label = { Text(label) },
        leadingIcon = {
            Icon(
                Icons.Filled.Edit,
                contentDescription = null,
                modifier = Modifier.size(18.dp),
            )
        },
    )
}

/** A locally saved draft: title + "Draft" label + edit button. */
@Composable
private fun DraftCard(
    title: String,
    pendingSync: Boolean,
    onEdit: () -> Unit,
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.medium,
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
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
                    androidx.compose.material3.Surface(
                        shape = androidx.compose.foundation.shape.RoundedCornerShape(6.dp),
                        color = MaterialTheme.colorScheme.primary.copy(alpha = 0.12f),
                    ) {
                        Text(
                            if (pendingSync) "Draft · online pending" else "Draft",
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.primary,
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

@Composable
private fun TripHeaderCard(trip: Trip) {
    Card(modifier = Modifier.fillMaxWidth(), shape = MaterialTheme.shapes.medium) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(trip.title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(4.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.LocationOn, contentDescription = null, modifier = Modifier.size(16.dp))
                Text(
                    "  ${trip.startDate} → ${trip.endDate ?: "ongoing"}",
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
            trip.description?.takeIf { it.isNotBlank() }?.let {
                Spacer(Modifier.height(8.dp))
                Text(it, style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
}

@Composable
private fun TripMapCard(track: List<Pair<Double, Double>>) {
    val center = track.firstOrNull()?.let { LatLng(it.first, it.second) }
    val tracks = listOf(MapTrack(track.map { p -> LatLng(p.first, p.second) }, color = "#3b82f6", width = 5f))
    Card(
        modifier = Modifier.fillMaxWidth().height(200.dp),
        shape = MaterialTheme.shapes.medium,
    ) {
        WayliMap(
            modifier = Modifier.fillMaxSize(),
            tracks = tracks,
            center = center,
            zoom = 10.0,
        )
    }
}

@Composable
private fun JournalEntryCard(entry: TripEntry, heroUrl: String? = null, onClick: () -> Unit = {}) {
    Card(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick),
        shape = MaterialTheme.shapes.medium,
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Column {
            heroUrl?.let { url ->
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(160.dp)
                        .clip(RoundedCornerShape(topStart = 12.dp, topEnd = 12.dp)),
                ) {
                    WayliAsyncImage(
                        model = url,
                        contentDescription = entry.title ?: "Entry",
                        modifier = Modifier.fillMaxSize(),
                    )
                }
            }
            Column(modifier = Modifier.padding(16.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(entry.title ?: "Entry", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    Text(entry.entryDate, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                entry.body?.let {
                    Spacer(Modifier.height(8.dp))
                    Text(it, style = MaterialTheme.typography.bodyMedium, maxLines = 3)
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
