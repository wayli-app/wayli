package io.github.nimbleflux.wayli.feature.wishlist

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.StarBorder
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
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
import io.github.nimbleflux.wayli.designsystem.WayliAsyncImage
import io.github.nimbleflux.wayli.models.WantToVisit

/**
 * Wishlist — toggle between Map and List views of places you want to visit.
 * Real mode loads places from the WishlistRepository; demo mode serves
 * DemoData. The "Add Place" FAB opens a bottom sheet that prepends a new
 * place to the list (kept in-memory for now).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WishlistScreen(
    places: List<WantToVisit> = emptyList(),
    viewModel: WishlistViewModel = androidx.hilt.navigation.compose.hiltViewModel(),
) {
    val loadedPlaces by viewModel.places.collectAsState()
    // Demo/explicit places take precedence; otherwise use the loaded repo data.
    val effectivePlaces = if (places.isNotEmpty()) places else loadedPlaces

    var viewMode by remember { mutableStateOf(WishlistViewMode.LIST) }
    var placeState by remember(effectivePlaces) { mutableStateOf(effectivePlaces) }
    var showAdd by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Wishlist") },
                actions = {
                    SingleChoiceSegmentedButtonRow(modifier = Modifier.padding(end = 16.dp)) {
                        WishlistViewMode.entries.forEachIndexed { index, mode ->
                            SegmentedButton(
                                selected = viewMode == mode,
                                onClick = { viewMode = mode },
                                shape = SegmentedButtonDefaults.itemShape(index, WishlistViewMode.entries.size),
                            ) {
                                Text(if (mode == WishlistViewMode.MAP) "Map" else "List")
                            }
                        }
                    }
                },
            )
        },
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = { showAdd = true },
                icon = { Icon(Icons.Filled.Add, contentDescription = null) },
                text = { Text("Add Place") },
                containerColor = MaterialTheme.colorScheme.primary,
                contentColor = MaterialTheme.colorScheme.onPrimary,
            )
        },
    ) { padding ->
        when (viewMode) {
            WishlistViewMode.MAP -> {
                val mapPoints = remember(placeState) {
                    placeState.mapNotNull { p ->
                        parsePostgisPoint(p.location)?.let { (lat, lng) ->
                            io.github.nimbleflux.wayli.designsystem.map.MapPoint(
                                lat = lat, lng = lng, title = p.title, color = p.markerColor,
                            )
                        }
                    }
                }
                io.github.nimbleflux.wayli.designsystem.map.WayliMap(
                    modifier = Modifier.fillMaxSize().padding(padding),
                    points = mapPoints,
                )
            }
            WishlistViewMode.LIST -> {
                if (placeState.isEmpty()) {
                    EmptyState(
                        emoji = "📍",
                        title = "No places yet",
                        subtitle = "Tap 'Add Place' to save somewhere you'd like to go",
                        modifier = Modifier.padding(padding),
                    )
                } else {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize().padding(padding).padding(horizontal = 16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        items(placeState, key = { it.id }) { place -> PlaceCard(place = place) {} }
                        item { Spacer(Modifier.size(80.dp)) }
                    }
                }
            }
        }
    }

    if (showAdd) {
        AddPlaceSheet(
            onDismiss = { showAdd = false },
            onAdd = { place ->
                placeState = listOf(place) + placeState
                showAdd = false
            },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AddPlaceSheet(onDismiss: () -> Unit, onAdd: (WantToVisit) -> Unit) {
    val sheetState = rememberModalBottomSheetState()
    var title by remember { mutableStateOf("") }
    var address by remember { mutableStateOf("") }
    var rating by remember { mutableStateOf(5) }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("Add a place", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            OutlinedTextField(
                value = title,
                onValueChange = { title = it },
                label = { Text("Title") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = address,
                onValueChange = { address = it },
                label = { Text("Address (optional)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Rating", style = MaterialTheme.typography.bodyLarge)
                Row {
                    (1..5).forEach { star ->
                        IconButton(onClick = { rating = star }) {
                            Icon(
                                if (star <= rating) Icons.Filled.Star else Icons.Filled.StarBorder,
                                contentDescription = "$star star${if (star > 1) "s" else ""}",
                                tint = MaterialTheme.colorScheme.primary,
                            )
                        }
                    }
                }
            }
            Button(
                onClick = {
                    if (title.isNotBlank()) {
                        onAdd(
                            WantToVisit(
                                id = "local-${System.currentTimeMillis()}",
                                userId = "local",
                                title = title.trim(),
                                location = "POINT(5.0 52.0)", // default; geocoding the address is a follow-up
                                address = address.ifBlank { null },
                                rating = rating,
                                markerColor = "#3B82F6",
                            ),
                        )
                    }
                },
                enabled = title.isNotBlank(),
                modifier = Modifier.fillMaxWidth(),
            ) { Text("Add") }
            Spacer(Modifier.size(8.dp))
        }
    }
}

@Composable
private fun PlaceCard(place: WantToVisit, onClick: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick),
        shape = MaterialTheme.shapes.medium,
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            place.imageUrl?.let { url ->
                WayliAsyncImage(
                    model = url,
                    contentDescription = place.title,
                    modifier = Modifier.size(48.dp).clip(RoundedCornerShape(10.dp)),
                )
            } ?: Box(
                modifier = Modifier
                    .size(48.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Filled.LocationOn, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
            }
            Spacer(Modifier.size(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(place.title, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium)
                place.address?.let {
                    Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            place.rating?.let { rating ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.Star, contentDescription = null, modifier = Modifier.size(16.dp), tint = MaterialTheme.colorScheme.primary)
                    Text(" $rating", style = MaterialTheme.typography.labelLarge)
                }
            }
        }
    }
}

enum class WishlistViewMode { LIST, MAP }

/** Parse a PostGIS POINT(lon lat) string to a (lat, lng) pair, or null. */
private fun parsePostgisPoint(pointStr: String): Pair<Double, Double>? {
    val match = Regex("""POINT\((-?[\d.]+)\s+(-?[\d.]+)\)""").find(pointStr) ?: return null
    val lng = match.groupValues[1].toDoubleOrNull() ?: return null
    val lat = match.groupValues[2].toDoubleOrNull() ?: return null
    return lat to lng
}
