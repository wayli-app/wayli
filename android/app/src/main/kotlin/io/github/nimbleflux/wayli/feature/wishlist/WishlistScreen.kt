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
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import io.github.nimbleflux.wayli.designsystem.LightPrimary
import io.github.nimbleflux.wayli.models.WantToVisit

/**
 * Wishlist — mobile-native design:
 * - Toggle between Map and List views (segmented button)
 * - List: compact place cards with marker icon, name, rating
 * - FAB to add a new place (opens bottom sheet)
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WishlistScreen(
    places: List<WantToVisit>,
) {
    var viewMode by remember { mutableStateOf(WishlistViewMode.LIST) }

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
                onClick = { /* TODO: open add-place bottom sheet */ },
                icon = { Icon(Icons.Filled.Add, contentDescription = null) },
                text = { Text("Add Place") },
                containerColor = LightPrimary,
            )
        },
    ) { padding ->
        when (viewMode) {
            WishlistViewMode.MAP -> {
                // Real MapLibre map with wishlist markers
                val mapPoints = places.map { p ->
                    val (lat, lng) = parsePostgisPoint(p.location)
                    io.github.nimbleflux.wayli.designsystem.map.MapPoint(
                        lat = lat, lng = lng, title = p.title, color = p.markerColor,
                    )
                }
                io.github.nimbleflux.wayli.designsystem.map.WayliMap(
                    modifier = Modifier.fillMaxSize().padding(padding),
                    points = mapPoints,
                )
            }
            WishlistViewMode.LIST -> {
                if (places.isEmpty()) {
                    Box(
                        modifier = Modifier.fillMaxSize().padding(padding),
                        contentAlignment = Alignment.Center,
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("📍", style = MaterialTheme.typography.headlineLarge)
                            Spacer(Modifier.height(8.dp))
                            Text("No places yet", style = MaterialTheme.typography.titleMedium)
                        }
                    }
                } else {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize().padding(padding).padding(horizontal = 16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        items(places) { place -> PlaceCard(place = place) {} }
                        item { Spacer(Modifier.height(80.dp)) }
                    }
                }
            }
        }
    }
}

@Composable
private fun PlaceCard(place: WantToVisit, onClick: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick),
        shape = RoundedCornerShape(12.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Thumbnail image (or marker icon fallback)
            place.imageUrl?.let { url ->
                AsyncImage(
                    model = url,
                    contentDescription = place.title,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier
                        .size(48.dp)
                        .clip(RoundedCornerShape(10.dp)),
                )
            } ?: run {
                Box(
                    modifier = Modifier
                        .size(48.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .background(MaterialTheme.colorScheme.surfaceVariant),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Icons.Filled.LocationOn, contentDescription = null, tint = LightPrimary)
                }
            }
            Spacer(Modifier.size(12.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(place.title, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium)
                place.address?.let {
                    Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }

            // Rating
            place.rating?.let { rating ->
                BadgedBox(badge = { }) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.Star, contentDescription = null, modifier = Modifier.size(16.dp), tint = LightPrimary)
                        Text(" $rating", style = MaterialTheme.typography.labelLarge)
                    }
                }
            }
        }
    }
}

enum class WishlistViewMode { LIST, MAP }

/** Parse a PostGIS POINT(lon lat) string to a (lat, lng) pair. */
private fun parsePostgisPoint(pointStr: String): Pair<Double, Double> {
    // Format: "POINT(lon lat)" or "SRID=4326;POINT(lon lat)"
    val match = Regex("""POINT\((-?[\d.]+)\s+(-?[\d.]+)\)""").find(pointStr)
    val lng = match?.groupValues?.get(1)?.toDoubleOrNull() ?: 0.0
    val lat = match?.groupValues?.get(2)?.toDoubleOrNull() ?: 0.0
    return lat to lng
}
