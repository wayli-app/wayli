package io.github.nimbleflux.wayli.designsystem.map

import android.content.Context
import android.os.Bundle
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import org.maplibre.android.MapLibre
import org.maplibre.android.camera.CameraPosition
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.geometry.LatLngBounds
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.MapLibreMap
import org.maplibre.android.maps.OnMapReadyCallback
import org.maplibre.android.maps.Style
import org.maplibre.android.style.layers.LineLayer
import org.maplibre.android.style.layers.PropertyFactory
import org.maplibre.android.style.layers.CircleLayer
import org.maplibre.android.style.sources.GeoJsonSource

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
 */
@Composable
fun WayliMap(
    modifier: Modifier = Modifier,
    points: List<MapPoint> = emptyList(),
    tracks: List<MapTrack> = emptyList(),
    center: LatLng? = null,
    zoom: Double = 10.0,
    darkTheme: Boolean = false,
) {
    val context = androidx.compose.ui.platform.LocalContext.current

    DisposableEffect(Unit) {
        MapLibre.getInstance(context)
        onDispose { }
    }

    AndroidView(
        factory = { ctx: Context ->
            val mapView = MapView(ctx)
            mapView.onCreate(Bundle())
            mapView.getMapAsync(OnMapReadyCallback { map: MapLibreMap ->
                val styleUrl = if (darkTheme) {
                    "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
                } else {
                    "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
                }
                map.setStyle(Style.Builder().fromUri(styleUrl)) { style: Style ->
                    // Style loaded callback
                    center?.let { c ->
                        map.cameraPosition = CameraPosition.Builder()
                            .target(c)
                            .zoom(zoom)
                            .build()
                    }
                    addPointsToMap(style, points)
                    addTracksToMap(style, tracks)
                    if (center == null) {
                        val allLatLngs = points.map { LatLng(it.lat, it.lng) } +
                            tracks.flatMap { it.points }
                        if (allLatLngs.isNotEmpty()) {
                            val bounds = LatLngBounds.Builder()
                                .includes(allLatLngs)
                                .build()
                            map.animateCamera(
                                CameraUpdateFactory.newLatLngBounds(bounds, 100),
                            )
                        }
                    }
                }
            })
            mapView
        },
        modifier = modifier,
    )
}

private var layerCounter = 0

private fun addPointsToMap(style: Style, points: List<MapPoint>) {
    if (points.isEmpty()) return
    val id = "wayli-points-${layerCounter++}"
    val geoJson = points.joinToString(",") { pt ->
        """{"type":"Feature","geometry":{"type":"Point","coordinates":[${pt.lng},${pt.lat}]},"properties":{"color":"${pt.color}","title":"${pt.title ?: ""}"}}"""
    }
    style.addSource(GeoJsonSource("$id-src", """{"type":"FeatureCollection","features":[$geoJson]}"""))
    style.addLayer(
        CircleLayer(id, "$id-src").withProperties(
            PropertyFactory.circleRadius(6f),
            PropertyFactory.circleColor("#233869"),
            PropertyFactory.circleStrokeWidth(2f),
            PropertyFactory.circleStrokeColor("#ffffff"),
        ),
    )
}

private fun addTracksToMap(style: Style, tracks: List<MapTrack>) {
    if (tracks.isEmpty()) return
    tracks.forEachIndexed { index, track ->
        if (track.points.size < 2) return@forEachIndexed
        val id = "wayli-track-$index-${layerCounter++}"
        val coords = track.points.joinToString(",") { "[${it.longitude},${it.latitude}]" }
        style.addSource(GeoJsonSource("$id-src", """{"type":"Feature","geometry":{"type":"LineString","coordinates":[$coords]}}"""))
        style.addLayer(
            LineLayer(id, "$id-src").withProperties(
                PropertyFactory.lineColor(track.color),
                PropertyFactory.lineWidth(track.width),
                PropertyFactory.lineOpacity(0.7f),
            ),
        )
    }
}
