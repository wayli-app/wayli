package io.github.nimbleflux.wayli.designsystem

import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil.ImageLoader
import coil.compose.AsyncImage
import coil.decode.SvgDecoder
import coil.request.ImageRequest

/**
 * The Wayli logo icon — loads the actual SVG logo from assets.
 * Renders at the given [size] with proper aspect ratio.
 *
 * Uses Coil's SVG decoder to render the vector logo at any resolution.
 */
/**
 * Shared SVG-capable ImageLoader — built once and remembered across recompositions
 * to avoid GC churn. Coil caches decoded bitmaps, so the SVG is only parsed once.
 */
@Composable
private fun rememberSvgImageLoader(): ImageLoader {
    val context = LocalContext.current
    return remember(context) {
        ImageLoader.Builder(context)
            .components { add(SvgDecoder.Factory()) }
            .build()
    }
}

@Composable
fun WayliLogo(
    size: Dp = 64.dp,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val loader = rememberSvgImageLoader()

    AsyncImage(
        model = ImageRequest.Builder(context)
            .data("file:///android_asset/wayli_logo.svg")
            .build(),
        contentDescription = "Wayli",
        imageLoader = loader,
        contentScale = ContentScale.Fit,
        modifier = modifier.size(size),
    )
}

/**
 * Full Wayli logo with wordmark — loads the full SVG from assets.
 */
@Composable
fun WayliLogoFull(
    height: Dp = 56.dp,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val loader = rememberSvgImageLoader()

    AsyncImage(
        model = ImageRequest.Builder(context)
            .data("file:///android_asset/wayli_logo_full.svg")
            .build(),
        contentDescription = "Wayli",
        imageLoader = loader,
        contentScale = ContentScale.Fit,
        modifier = modifier.size(height = height, width = height * 3.3f),
    )
}
