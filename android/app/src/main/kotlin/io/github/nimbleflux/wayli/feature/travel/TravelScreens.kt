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
import androidx.compose.material.icons.filled.DateRange
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
    var showCreateDialog by remember { androidx.compose.runtime.mutableStateOf(false) }

    LaunchedEffect(Unit) { viewModel.loadTrips() }

    if (showCreateDialog) {
        CreateTripDialog(
            onDismiss = { showCreateDialog = false },
            onCreate = { title, start, end, desc ->
                viewModel.createTrip(title, start, end, desc)
            },
        )
    }

    Scaffold(
        topBar = { TopAppBar(title = { Text("Travel") }) },
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = { showCreateDialog = true },
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
                        item { Spacer(Modifier.height(80.dp)) }
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
                                TripCard(trip = trip, onClick = {
                                    viewModel.selectTrip(trip)
                                    onTripClick(trip)
                                })
                            }
                            item { Spacer(Modifier.height(80.dp)) }
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
private fun TripCard(trip: Trip, onClick: () -> Unit) {
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
    viewModel: TripDetailViewModel = androidx.hilt.navigation.compose.hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()
    val entries by viewModel.entries.collectAsState()
    var showAdd by remember { mutableStateOf(false) }

    Scaffold(
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
                onClick = { showAdd = true },
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
                    item { TripMapCard(tripId = viewModel.tripId, isDemo = viewModel.isDemoMode) }
                    item {
                        Text(
                            "Journal",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(top = 4.dp),
                        )
                    }
                    if (entries.isEmpty()) {
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
                        items(entries, key = { it.id }) { entry -> JournalEntryCard(entry) }
                    }
                    item { Spacer(Modifier.height(24.dp)) }
                }
            }
        }
    }

    if (showAdd) {
        AddEntrySheet(
            onDismiss = { showAdd = false },
            onAdd = { title, date, body ->
                viewModel.addEntry(title, date, body)
                showAdd = false
            },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AddEntrySheet(
    onDismiss: () -> Unit,
    onAdd: (title: String, entryDate: String, body: String?) -> Unit,
) {
    val sheetState = rememberModalBottomSheetState()
    var title by remember { mutableStateOf("") }
    var date by remember { mutableStateOf(java.time.LocalDate.now().toString()) }
    var body by remember { mutableStateOf("") }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("New journal entry", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            OutlinedTextField(
                value = title,
                onValueChange = { title = it },
                label = { Text("Title") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = date,
                onValueChange = { date = it },
                label = { Text("Date (YYYY-MM-DD)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = body,
                onValueChange = { body = it },
                label = { Text("Entry") },
                modifier = Modifier.fillMaxWidth().height(120.dp),
            )
            Button(
                onClick = { if (title.isNotBlank()) onAdd(title.trim(), date.trim(), body.ifBlank { null }) },
                enabled = title.isNotBlank(),
                modifier = Modifier.fillMaxWidth(),
            ) { Text("Add entry") }
            Spacer(Modifier.height(8.dp))
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
private fun TripMapCard(tripId: String, isDemo: Boolean) {
    val center = if (isDemo) {
        io.github.nimbleflux.wayli.demo.DemoData.tripCenters[tripId]?.let { LatLng(it.first, it.second) }
    } else {
        null
    }
    val tracks = if (isDemo) {
        io.github.nimbleflux.wayli.demo.DemoData.tripTracks[tripId]?.let { coords ->
            listOf(MapTrack(coords.map { p -> LatLng(p.first, p.second) }, color = "#3b82f6", width = 5f))
        }.orEmpty()
    } else {
        emptyList()
    }
    Card(
        modifier = Modifier.fillMaxWidth().height(200.dp),
        shape = MaterialTheme.shapes.medium,
    ) {
        WayliMap(
            modifier = Modifier.fillMaxSize(),
            tracks = tracks,
            center = center,
            zoom = 5.0,
        )
    }
}

@Composable
private fun JournalEntryCard(entry: TripEntry) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.medium,
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
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
                Text(it, style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
}
