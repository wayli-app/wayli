package io.github.nimbleflux.wayli.feature.home

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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Comment
import androidx.compose.material.icons.filled.Explore
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import io.github.nimbleflux.wayli.designsystem.DateRange
import io.github.nimbleflux.wayli.designsystem.ErrorState
import io.github.nimbleflux.wayli.designsystem.LoadingState
import io.github.nimbleflux.wayli.designsystem.SectionHeader
import io.github.nimbleflux.wayli.designsystem.WayliAsyncImage
import io.github.nimbleflux.wayli.designsystem.WayliLogo
import io.github.nimbleflux.wayli.designsystem.displayLabel
import io.github.nimbleflux.wayli.designsystem.map.MapPoint
import io.github.nimbleflux.wayli.designsystem.map.MapTrack
import io.github.nimbleflux.wayli.designsystem.map.WayliMap
import io.github.nimbleflux.wayli.models.Notification
import io.github.nimbleflux.wayli.models.Trip
import io.github.nimbleflux.wayli.models.WantToVisit
import java.time.LocalDate
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import org.maplibre.android.geometry.LatLng

/**
 * The Home tab — a scrollable overview dashboard. In demo mode it's populated
 * instantly from [io.github.nimbleflux.wayli.demo.DemoData]: greeting, headline
 * stats, a map of recent activity, recent trips, a wishlist teaser, and recent
 * activity. This replaces the old inert full-screen map home.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    onStatsClick: () -> Unit,
    onTripClick: (Trip) -> Unit,
    onWishlistClick: () -> Unit,
    onNotificationsClick: () -> Unit = {},
    autoStartRecording: Boolean = false,
    onAutoActionConsumed: () -> Unit = {},
    viewModel: HomeViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()
    val track by viewModel.track.collectAsState()
    val visitedCountries by viewModel.visitedCountries.collectAsState()
    val windowLoading by viewModel.windowLoading.collectAsState()
    val windowError by viewModel.windowError.collectAsState()
    val selectedRange by viewModel.selectedRange.collectAsState()
    val online by viewModel.online.collectAsState()

    // One silent retry when returning to a failed dashboard — e.g. the app
    // resumed with connectivity restored.
    val lifecycleOwner = androidx.compose.ui.platform.LocalLifecycleOwner.current
    androidx.compose.runtime.DisposableEffect(lifecycleOwner) {
        var retried = false
        val observer = object : androidx.lifecycle.DefaultLifecycleObserver {
            override fun onResume(owner: androidx.lifecycle.LifecycleOwner) {
                if (!retried && uiState is HomeUiState.Error && !viewModel.isDemoMode) {
                    retried = true
                    viewModel.load()
                }
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    Scaffold { padding ->
        when (val state = uiState) {
            is HomeUiState.Loading -> LoadingState(Modifier.padding(padding))
            is HomeUiState.Error -> ErrorState(
                state.message,
                modifier = Modifier.padding(padding),
                onRetry = { viewModel.load() },
            )
            is HomeUiState.Success -> Column(Modifier.fillMaxSize().padding(padding)) {
                io.github.nimbleflux.wayli.designsystem.OfflineBanner(visible = !online)
                HomeContent(
                    data = state.data,
                    isDemo = viewModel.isDemoMode,
                    track = track,
                    visitedCountries = visitedCountries,
                    selectedRange = selectedRange,
                    windowLoading = windowLoading,
                    windowError = windowError,
                    onRangeSelected = viewModel::setRange,
                    onStatsClick = onStatsClick,
                    onTripClick = onTripClick,
                    onWishlistClick = onWishlistClick,
                    onNotificationsClick = onNotificationsClick,
                    autoStartRecording = autoStartRecording,
                    onAutoActionConsumed = onAutoActionConsumed,
                )
            }
        }
    }
}

@Composable
private fun HomeContent(
    data: HomeData,
    isDemo: Boolean,
    track: List<Pair<Double, Double>>,
    visitedCountries: Set<String>,
    selectedRange: DateRange,
    windowLoading: Boolean = false,
    windowError: Boolean = false,
    onRangeSelected: (DateRange) -> Unit,
    onStatsClick: () -> Unit,
    onTripClick: (Trip) -> Unit,
    onWishlistClick: () -> Unit,
    onNotificationsClick: () -> Unit = {},
    autoStartRecording: Boolean = false,
    onAutoActionConsumed: () -> Unit = {},
    modifier: Modifier = Modifier,
) {
    val recordingVm: RecordingViewModel = hiltViewModel()
    val isRecording by recordingVm.isRecording.collectAsState()
    val context = androidx.compose.ui.platform.LocalContext.current

    // Location permission gate — the foreground service can't run without it.
    // On the gplay flavor we then also request activity recognition (adaptive
    // tracking); denial is non-fatal — tracking falls back to fixed intervals.
    // Notification permission is requested alongside (Android 13+) so the
    // tracking toggle in the drawer is visible; its denial is non-fatal too.
    val activityPermissionLauncher = androidx.activity.compose.rememberLauncherForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.RequestPermission(),
    ) { recordingVm.resume() }

    val notifPermissionLauncher = androidx.activity.compose.rememberLauncherForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.RequestPermission(),
    ) {
        // Granted or not, continue into the activity-recognition step / resume.
        if (io.github.nimbleflux.wayli.di.FlavorCapabilities.requestsActivityRecognition &&
            androidx.core.content.ContextCompat.checkSelfPermission(
                context, android.Manifest.permission.ACTIVITY_RECOGNITION,
            ) != android.content.pm.PackageManager.PERMISSION_GRANTED
        ) {
            activityPermissionLauncher.launch(android.Manifest.permission.ACTIVITY_RECOGNITION)
        } else {
            recordingVm.resume()
        }
    }

    /** Request notification permission once (non-fatal), then continue [next]. */
    val withNotificationPermission: (() -> Unit) -> Unit = { next ->
        if (android.os.Build.VERSION.SDK_INT >= 33 &&
            androidx.core.content.ContextCompat.checkSelfPermission(
                context, android.Manifest.permission.POST_NOTIFICATIONS,
            ) != android.content.pm.PackageManager.PERMISSION_GRANTED
        ) {
            notifPermissionLauncher.launch(android.Manifest.permission.POST_NOTIFICATIONS)
        } else {
            next()
        }
    }

    val permissionLauncher = androidx.activity.compose.rememberLauncherForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.RequestPermission(),
    ) { granted ->
        if (!granted) {
            recordingVm.pause()
            return@rememberLauncherForActivityResult
        }
        withNotificationPermission {
            if (io.github.nimbleflux.wayli.di.FlavorCapabilities.requestsActivityRecognition &&
                androidx.core.content.ContextCompat.checkSelfPermission(
                    context, android.Manifest.permission.ACTIVITY_RECOGNITION,
                ) != android.content.pm.PackageManager.PERMISSION_GRANTED
            ) {
                activityPermissionLauncher.launch(android.Manifest.permission.ACTIVITY_RECOGNITION)
            } else {
                recordingVm.resume()
            }
        }
    }
    val resumeWithPermission: () -> Unit = {
        if (recordingVm.isDemo || androidx.core.content.ContextCompat.checkSelfPermission(
                context, android.Manifest.permission.ACCESS_FINE_LOCATION,
            ) == android.content.pm.PackageManager.PERMISSION_GRANTED
        ) {
            withNotificationPermission {
                if (io.github.nimbleflux.wayli.di.FlavorCapabilities.requestsActivityRecognition &&
                    androidx.core.content.ContextCompat.checkSelfPermission(
                        context, android.Manifest.permission.ACTIVITY_RECOGNITION,
                    ) != android.content.pm.PackageManager.PERMISSION_GRANTED
                ) {
                    activityPermissionLauncher.launch(android.Manifest.permission.ACTIVITY_RECOGNITION)
                } else {
                    recordingVm.resume()
                }
            }
        } else {
            permissionLauncher.launch(android.Manifest.permission.ACCESS_FINE_LOCATION)
        }
    }

    // "Start recording" launcher shortcut: run the permission-gated resume flow once.
    androidx.compose.runtime.LaunchedEffect(autoStartRecording) {
        if (autoStartRecording && !recordingVm.isDemo) {
            resumeWithPermission()
            onAutoActionConsumed()
        }
    }

    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(
            horizontal = 16.dp,
            vertical = 8.dp,
        ),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item { HomeHeader(data, onNotificationsClick) }

        if (!isDemo) {
            item {
                Column {
                    androidx.compose.foundation.layout.Row(
                        verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
                    ) {
                        io.github.nimbleflux.wayli.designsystem.DateRangeSelector(
                            selected = selectedRange,
                            onSelect = onRangeSelected,
                            modifier = Modifier.weight(1f),
                        )
                        if (windowLoading) {
                            Spacer(Modifier.width(8.dp))
                            androidx.compose.material3.CircularProgressIndicator(
                                modifier = Modifier.size(18.dp),
                                strokeWidth = 2.dp,
                            )
                        }
                    }
                    if (windowError) {
                        Text(
                            "Couldn't refresh — showing the previous numbers",
                            style = androidx.compose.material3.MaterialTheme.typography.labelSmall,
                            color = androidx.compose.material3.MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = 4.dp),
                        )
                    }
                }
            }
        }
        item {
            StatsCard(
                stats = data.stats,
                rangeLabel = if (isDemo) "Sample data · all time" else selectedRange.displayLabel(),
                onClick = onStatsClick,
            )
        }

        item {
            RecordingControl(
                isRecording = isRecording,
                onPause = recordingVm::pause,
                onResume = resumeWithPermission,
            )
        }

        item { MapHeroCard(data = data, isDemo = isDemo, track = track) }

        item {
            io.github.nimbleflux.wayli.designsystem.WorldMapCard(
                visited = visitedCountries,
                title = if (isDemo) "Where I've Been · sample" else "Where I've Been",
            )
        }

        item {
            SectionHeader(
                title = "Recent trips",
                trailing = {
                    TextButton(onStatsClick, "See all") // stats holds the overview; trips live in Travel
                },
            )
        }
        item { TripCarousel(trips = data.trips, onTripClick = onTripClick) }

        item {
            SectionHeader(
                title = "Wishlist",
                trailing = { TextButton(onWishlistClick, "See all") },
            )
        }
        item { WishlistTeaser(places = data.wishlist, onSeeAll = onWishlistClick) }

        item {
            SectionHeader(title = "Recent activity")
        }
        item { ActivitySection(activity = data.activity) }

        item { Spacer(Modifier.height(100.dp)) } // clear the floating dock
    }
}

// ---- Sections ----

@Composable
private fun HomeHeader(data: HomeData, onNotificationsClick: () -> Unit = {}) {
    val greeting = remember { greetingFor(LocalTime.now().hour) }
    val dateText = remember {
        DateTimeFormatter.ofPattern("EEEE, MMM d").format(LocalDate.now())
    }
    val unread = data.activity.count { it.readAt == null }
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                "$greeting,",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                data.profile?.fullName ?: "Traveler",
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
            )
            Spacer(Modifier.height(2.dp))
            Text(
                dateText,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        if (data.activity.isNotEmpty() || unread > 0) {
            androidx.compose.material3.BadgedBox(
                badge = {
                    if (unread > 0) {
                        androidx.compose.material3.Badge { Text(unread.toString()) }
                    }
                },
            ) {
                androidx.compose.material3.IconButton(onClick = onNotificationsClick) {
                    androidx.compose.material3.Icon(
                        Icons.Filled.Notifications,
                        contentDescription = "Notifications",
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            Spacer(Modifier.size(8.dp))
        }
        // Wayli logo mark (replaces the initials avatar)
        WayliLogo(size = 44.dp)
    }
}

@Composable
private fun StatsCard(stats: HomeStats, rangeLabel: String, onClick: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick),
        shape = MaterialTheme.shapes.medium,
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column {
                    Text("At a glance", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                    Text(
                        rangeLabel,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Icon(
                    Icons.AutoMirrored.Filled.KeyboardArrowRight,
                    contentDescription = "View statistics",
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(Modifier.height(12.dp))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                StatTile(Modifier.weight(1f), value = stats.distanceKm, label = "km tracked")
                StatTile(Modifier.weight(1f), value = stats.countries, label = "countries")
            }
            Spacer(Modifier.height(12.dp))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                StatTile(Modifier.weight(1f), value = stats.timeMovingHours, label = "hours moving")
                StatTile(Modifier.weight(1f), value = stats.trips, label = "trips")
            }
        }
    }
}

@Composable
private fun StatTile(modifier: Modifier, value: String, label: String) {
    Column(modifier = modifier) {
        Text(
            value,
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.primary,
        )
        Text(
            label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun RecordingControl(isRecording: Boolean, onPause: () -> Unit, onResume: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.medium,
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            val pulseAlpha by androidx.compose.animation.core.animateFloatAsState(
                targetValue = if (isRecording) 1f else 0f,
                animationSpec = androidx.compose.animation.core.spring(
                    dampingRatio = androidx.compose.animation.core.Spring.DampingRatioMediumBouncy,
                ),
                label = "recordingPulse",
            )
            Box(
                modifier = Modifier
                    .size(10.dp)
                    .clip(CircleShape)
                    .background(
                        if (isRecording) {
                            MaterialTheme.colorScheme.error.copy(alpha = pulseAlpha)
                        } else {
                            MaterialTheme.colorScheme.outline
                        },
                    ),
            )
            Spacer(Modifier.width(10.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    if (isRecording) "Recording" else "Paused",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    if (isRecording) "Recording is on — pause anytime." else "Resume to continue recording.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (isRecording) {
                OutlinedButton(onClick = onPause) { Text("Pause") }
            } else {
                Button(onClick = onResume) { Text("Resume") }
            }
        }
    }
}

@Composable
private fun MapHeroCard(data: HomeData, isDemo: Boolean, track: List<Pair<Double, Double>>) {
    val points = remember(isDemo, data.wishlist) {
        if (isDemo) {
            io.github.nimbleflux.wayli.demo.DemoData.homePoints
        } else {
            data.wishlist.mapNotNull { p ->
                io.github.nimbleflux.wayli.repo.StatsAggregator.parseLocation(p.location)?.let { (lat, lng) ->
                    MapPoint(lat = lat, lng = lng, title = p.title, color = p.markerColor)
                }
            }
        }
    }
    val tracks = remember(isDemo, track) {
        if (track.size >= 2) {
            listOf(MapTrack(points = track.map { LatLng(it.first, it.second) }, color = "#3b82f6", width = 5f))
        } else {
            emptyList()
        }
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.medium,
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Your journeys", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                Text(
                    if (isDemo) "Sample data" else if (tracks.isEmpty()) "No trips yet" else "Your track",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(Modifier.height(12.dp))
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(200.dp)
                    .clip(RoundedCornerShape(14.dp)),
            ) {
                WayliMap(
                    modifier = Modifier.fillMaxSize(),
                    points = points,
                    tracks = tracks,
                )
            }
        }
    }
}

@Composable
private fun TripCarousel(trips: List<Trip>, onTripClick: (Trip) -> Unit) {
    if (trips.isEmpty()) return
    LazyRow(
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(vertical = 2.dp),
    ) {
        items(trips, key = { it.id }) { trip ->
            CompactTripCard(trip = trip, onClick = { onTripClick(trip) })
        }
    }
}

@Composable
private fun CompactTripCard(trip: Trip, onClick: () -> Unit) {
    Card(
        modifier = Modifier.width(220.dp).clickable(onClick = onClick),
        shape = MaterialTheme.shapes.medium,
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
    ) {
        Column {
            Box(modifier = Modifier.fillMaxWidth().height(120.dp)) {
                trip.imageUrl?.let { url ->
                    WayliAsyncImage(
                        model = url,
                        contentDescription = trip.title,
                        modifier = Modifier.fillMaxSize(),
                    )
                } ?: Box(
                    modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.surfaceVariant),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        Icons.Filled.LocationOn,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f),
                    )
                }
            }
            Column(modifier = Modifier.padding(12.dp)) {
                Text(
                    trip.title,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                )
                Spacer(Modifier.height(2.dp))
                Text(
                    "${trip.startDate.take(7)} • ${trip.endDate?.take(7) ?: "ongoing"}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun WishlistTeaser(places: List<WantToVisit>, onSeeAll: () -> Unit) {
    if (places.isEmpty()) {
        Text(
            "Places you want to visit will appear here.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        return
    }
    LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        items(places.take(5), key = { it.id }) { place ->
            CompactWishlistCard(place = place)
        }
    }
}

@Composable
private fun CompactWishlistCard(place: WantToVisit) {
    Card(
        modifier = Modifier.width(160.dp),
        shape = MaterialTheme.shapes.medium,
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Column {
            Box(modifier = Modifier.fillMaxWidth().height(90.dp)) {
                place.imageUrl?.let { url ->
                    WayliAsyncImage(model = url, contentDescription = place.title, modifier = Modifier.fillMaxSize())
                } ?: Box(
                    modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.surfaceVariant),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Icons.Filled.LocationOn, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            Column(modifier = Modifier.padding(10.dp)) {
                Text(place.title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold, maxLines = 1)
                place.rating?.let { r ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.Star, contentDescription = null, modifier = Modifier.size(14.dp), tint = MaterialTheme.colorScheme.primary)
                        Text(" $r", style = MaterialTheme.typography.labelSmall)
                    }
                }
            }
        }
    }
}

@Composable
private fun ActivitySection(activity: List<Notification>) {
    if (activity.isEmpty()) {
        Text(
            "No recent activity yet.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        return
    }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        activity.forEach { notif ->
            ActivityRow(notif)
        }
    }
}

@Composable
private fun ActivityRow(notif: Notification) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.medium,
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.12f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    iconForNotification(notif.type),
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(20.dp),
                )
            }
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(notif.title, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
                notif.body?.let {
                    Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2)
                }
            }
        }
    }
}

// ---- Helpers ----

@Composable
private fun TextButton(onClick: () -> Unit, text: String) {
    androidx.compose.material3.TextButton(onClick = onClick) {
        Text(text, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
    }
}

private fun greetingFor(hour: Int): String = when (hour) {
    in 5..11 -> "Good morning"
    in 12..17 -> "Good afternoon"
    else -> "Good evening"
}

private fun iconForNotification(type: String): ImageVector = when (type) {
    "trip_detected" -> Icons.Filled.Explore
    "friend_request" -> Icons.Filled.Person
    "comment" -> Icons.Filled.Comment
    else -> Icons.Filled.Notifications
}

/** Parse "POINT(lng lat)" → (lat, lng), or null if unparseable. */
