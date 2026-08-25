package io.github.nimbleflux.wayli.designsystem.map

import android.content.Context
import android.os.Bundle
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import org.maplibre.android.camera.CameraPosition
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.geometry.LatLngBounds
import org.maplibre.android.maps.MapLibreMap
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.OnMapReadyCallback
import org.maplibre.android.maps.Style
import org.maplibre.android.style.layers.CircleLayer
import org.maplibre.android.style.layers.LineLayer
import org.maplibre.android.style.layers.PropertyFactory
import org.maplibre.android.style.sources.GeoJsonSource
import java.util.concurrent.atomic.AtomicInteger

data class MapPoint(
    val lat: Double,
    val lng: Double,
    val title: String? = null,
    val color: String = "#233869",
)

data class MapTrack(
    val points: List<LatLng>,
    val color: String = "#3b82f6",
    val width: Float = 4f,
)

/**
 * Reusable MapLibre composable. Renders a vector map with CartoDB tiles
 * (same as the web app). No Google dependency — works in both flavors.
 *
 * Lifecycle: forwards the host's create/start/resume/pause/stop/destroy to the
 * underlying [MapView] (via [DefaultLifecycleObserver]) so it doesn't leak GPU
 * * memory or crash on backgrounding. [darkTheme] resolves LIGHT/DARK/SYSTEM so
 * * the map follows the app theme (see LocalWayliDarkTheme). Per-point [MapPoint]
 * colors are honored, GeoJSON is built with kotlinx.serialization (no string
 * injection), and points/tracks re-render when the arguments change.
 */
@Composable
fun WayliMap(
    modifier: Modifier = Modifier,
    points: List<MapPoint> = emptyList(),
    tracks: List<MapTrack> = emptyList(),
    center: LatLng? = null,
    zoom: Double = 10.0,
    // Defaults to the APP theme (LIGHT/DARK/SYSTEM setting), not just the OS
    // one — see LocalWayliDarkTheme.
    darkTheme: Boolean = io.github.nimbleflux.wayli.designsystem.LocalWayliDarkTheme.current,
    /**
     * Mini maps embedded in scrollable lists must disable pan: a full-gesture
     * MapView steals vertical drags from the surrounding LazyColumn, which is
     * exactly the "sometimes it pans, sometimes it scrolls" lottery. Pinch
     * zoom stays enabled (it doesn't conflict with list scrolling); an expand
     * affordance opens a fullscreen map with all gestures.
     */
    panEnabled: Boolean = true,
) {
    // MapLibre.getInstance() is called in WayliApplication.onCreate() — must
    // happen before any MapView is created.
    val context: Context = LocalContext.current
    val mapView = remember { MapView(context) }
    val lifecycleOwner = LocalLifecycleOwner.current

    var mapRef by remember { mutableStateOf<MapLibreMap?>(null) }
    var styleRef by remember { mutableStateOf<Style?>(null) }
    // Track layers/sources we add so we can clean them up before re-rendering.
    val addedLayerIds = remember { mutableStateListOf<String>() }
    val addedSourceIds = remember { mutableStateListOf<String>() }

    // Forward the host lifecycle to MapView (the previous version only called
    // onCreate, which leaked the map and could crash when backgrounded).
    DisposableEffect(lifecycleOwner) {
        val observer = object : DefaultLifecycleObserver {
            override fun onCreate(owner: LifecycleOwner) = mapView.onCreate(Bundle())
            override fun onStart(owner: LifecycleOwner) = mapView.onStart()
            override fun onResume(owner: LifecycleOwner) = mapView.onResume()
            override fun onPause(owner: LifecycleOwner) = mapView.onPause()
            override fun onStop(owner: LifecycleOwner) = mapView.onStop()
            override fun onDestroy(owner: LifecycleOwner) = mapView.onDestroy()
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
            mapView.onDestroy()
        }
    }

    // Bundled style descriptors (asset://) — no network round-trip on first
    // paint; tiles/sprites/glyphs still stream from CartoDB as usual.
    val styleUrl = if (darkTheme) {
        "asset://map-styles/dark-matter.json"
    } else {
        "asset://map-styles/positron.json"
    }

    AndroidView(
        factory = {
            mapView.apply {
                getMapAsync(OnMapReadyCallback { map: MapLibreMap ->
                    map.uiSettings.isScrollGesturesEnabled = panEnabled
                    mapRef = map
                })
            }
        },
        modifier = modifier,
    )

    // Apply (and re-apply) the style whenever the theme changes — the factory
    // runs once, so a theme switch mid-session would otherwise leave the map
    // frozen on the old palette. MapLibre preserves the camera across
    // setStyle; layers/sources re-add via the styleRef effect below.
    LaunchedEffect(mapRef, darkTheme) {
        val map = mapRef ?: return@LaunchedEffect
        map.setStyle(Style.Builder().fromUri(styleUrl)) { style: Style ->
            styleRef = style
        }
    }

    // Render points/tracks whenever the style is ready or the data changes.
    LaunchedEffect(styleRef, points, tracks) {
        val style = styleRef ?: return@LaunchedEffect
        val map = mapRef ?: return@LaunchedEffect

        // Remove previously added layers/sources.
        addedLayerIds.toList().forEach { runCatching { style.removeLayer(it) } }
        addedSourceIds.toList().forEach { runCatching { style.removeSource(it) } }
        addedLayerIds.clear()
        addedSourceIds.clear()

        addPointsToMap(style, points) { layerId, sourceId ->
            addedLayerIds += layerId
            addedSourceIds += sourceId
        }
        addTracksToMap(style, tracks) { layerId, sourceId ->
            addedLayerIds += layerId
            addedSourceIds += sourceId
        }

        // If no explicit center was supplied, frame all the geometry.
        if (center == null) {
            val all = points.map { LatLng(it.lat, it.lng) } + tracks.flatMap { it.points }
            if (all.isNotEmpty()) {
                runCatching {
                    val bounds = LatLngBounds.Builder().includes(all).build()
                    map.animateCamera(CameraUpdateFactory.newLatLngBounds(bounds, 100))
                }
            }
        }
    }

    // Apply the explicit camera position when a center is supplied.
    LaunchedEffect(styleRef, center, zoom) {
        val map = mapRef ?: return@LaunchedEffect
        center?.let { c ->
            map.cameraPosition = CameraPosition.Builder().target(c).zoom(zoom).build()
        }
    }
}

// ---- GeoJSON builders (safe — uses kotlinx.serialization, no string concat) ----

private fun pointFeatureGeoJson(point: MapPoint): kotlinx.serialization.json.JsonObject = buildJsonObject {
    put("type", "Feature")
    putJsonObject("geometry") {
        put("type", "Point")
        putJsonArray("coordinates") {
            add(point.lng)
            add(point.lat)
        }
    }
    putJsonObject("properties") {
        put("color", point.color)
        point.title?.let { put("title", it) }
    }
}

private fun trackFeatureGeoJson(track: MapTrack): kotlinx.serialization.json.JsonObject = buildJsonObject {
    put("type", "Feature")
    putJsonObject("geometry") {
        put("type", "LineString")
        putJsonArray("coordinates") {
            track.points.forEach { p ->
                add(buildJsonArray { add(p.longitude); add(p.latitude) })
            }
        }
    }
    putJsonObject("properties") {
        put("color", track.color)
    }
}

private fun featureCollection(features: List<kotlinx.serialization.json.JsonObject>): String = buildJsonObject {
    put("type", "FeatureCollection")
    putJsonArray("features") {
        // add(JsonObject) keeps features nested — stringifying them first
        // would wrap every feature in quotes and MapLibre would drop them.
        features.forEach { add(it) }
    }
}.toString()

// ---- Layer management ----

private val layerIdCounter = AtomicInteger(0)

private fun nextId() = layerIdCounter.incrementAndGet()

/**
 * Adds one circle layer per distinct color (each backed by its own source
 * filtered to that color). Avoids data-driven color expressions while still
 * honoring each [MapPoint.color]. [register] records the created ids for cleanup.
 */
private fun addPointsToMap(
    style: Style,
    points: List<MapPoint>,
    register: (layerId: String, sourceId: String) -> Unit,
) {
    if (points.isEmpty()) return
    points.groupBy { it.color }.forEach { (color, colored) ->
        val id = "wayli-points-${nextId()}-${color.removePrefix("#")}"
        val sourceId = "$id-src"
        style.addSource(GeoJsonSource(sourceId, featureCollection(colored.map(::pointFeatureGeoJson))))
        style.addLayer(
            CircleLayer(id, sourceId).withProperties(
                PropertyFactory.circleRadius(7f),
                PropertyFactory.circleColor(color),
                PropertyFactory.circleStrokeWidth(2f),
                PropertyFactory.circleStrokeColor("#ffffff"),
            ),
        )
        register(id, sourceId)
    }
}

private fun addTracksToMap(
    style: Style,
    tracks: List<MapTrack>,
    register: (layerId: String, sourceId: String) -> Unit,
) {
    if (tracks.isEmpty()) return
    tracks.forEachIndexed { index, track ->
        if (track.points.size < 2) return@forEachIndexed
        val id = "wayli-track-$index-${nextId()}"
        val sourceId = "$id-src"
        style.addSource(GeoJsonSource(sourceId, trackFeatureGeoJson(track).toString()))
        style.addLayer(
            LineLayer(id, sourceId).withProperties(
                PropertyFactory.lineColor(track.color),
                PropertyFactory.lineWidth(track.width),
                PropertyFactory.lineOpacity(0.7f),
            ),
        )
        register(id, sourceId)
    }
}
