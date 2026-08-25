package io.github.nimbleflux.wayli.designsystem

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Map
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlin.math.min

/**
 * Overlay building blocks for the immersive cover style (web public-trip-page
 * parity): glass pills, gradient scrims, cover fallbacks, calendar date
 * badges, and staggered card entrances.
 */

/** Semi-transparent pill overlaid on cover photos (web's backdrop-blur pill). */
@Composable
fun GlassPill(text: String, modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier,
        shape = CircleShape,
        color = Color.Black.copy(alpha = 0.35f),
        border = androidx.compose.foundation.BorderStroke(1.dp, Color.White.copy(alpha = 0.25f)),
    ) {
        Text(
            text,
            color = Color.White,
            style = androidx.compose.material3.MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
        )
    }
}

/** Round glass container for icon buttons floating on cover photos. */
@Composable
fun GlassIconButton(
    icon: ImageVector,
    contentDescription: String?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier.size(40.dp),
        shape = CircleShape,
        color = Color.Black.copy(alpha = 0.35f),
        border = androidx.compose.foundation.BorderStroke(1.dp, Color.White.copy(alpha = 0.25f)),
    ) {
        androidx.compose.material3.IconButton(onClick = onClick) {
            Icon(
                icon,
                contentDescription = contentDescription,
                tint = Color.White,
                modifier = Modifier.size(20.dp),
            )
        }
    }
}

/**
 * Draws a bottom-up dark gradient over the content it wraps — use on a Box
 * that contains a cover photo so overlaid text stays readable.
 */
fun Modifier.bottomScrim(): Modifier = drawWithContent {
    drawContent()
    drawRect(
        brush = Brush.verticalGradient(
            colors = listOf(Color.Transparent, Color.Black.copy(alpha = 0.35f), Color.Black.copy(alpha = 0.85f)),
            startY = size.height * 0.35f,
            endY = size.height,
        ),
    )
}

/** Dark slate gradient stand-in for missing cover photos (web's slate-700→900). */
@Composable
fun CoverFallback(modifier: Modifier = Modifier, icon: ImageVector = Icons.Filled.Map) {
    Box(
        modifier = modifier.background(
            Brush.linearGradient(listOf(Color(0xFF334155), Color(0xFF0F172A))),
        ),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            icon,
            contentDescription = null,
            tint = Color.White.copy(alpha = 0.5f),
            modifier = Modifier.size(40.dp),
        )
    }
}

/**
 * Locale-friendly entry date ("Aug 15, 2026"); null when [isoDate] can't be
 * parsed. Shared by journal cards, story cards and detail sheets.
 */
fun formatEntryDate(isoDate: String?): String? {
    val date = io.github.nimbleflux.wayli.util.parseIsoDate(isoDate) ?: return null
    return java.time.format.DateTimeFormatter.ofPattern("MMM d, yyyy").format(date)
}

/** Calendar-tile badge: month abbreviation over day number (web's date badge). */
@Composable
fun DateBadge(isoDate: String, modifier: Modifier = Modifier) {
    val date = remember(isoDate) { io.github.nimbleflux.wayli.util.parseIsoDate(isoDate) }
    val month = remember(date) {
        date?.let { java.time.format.DateTimeFormatter.ofPattern("MMM").format(it)?.uppercase() }
            // Unparseable dates still show something identifiable.
            ?: isoDate.take(3).uppercase().ifBlank { "·" }
    }
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(12.dp),
        color = androidx.compose.material3.MaterialTheme.colorScheme.primary.copy(alpha = 0.10f),
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                month,
                style = androidx.compose.material3.MaterialTheme.typography.labelSmall,
                color = androidx.compose.material3.MaterialTheme.colorScheme.primary,
            )
            Text(
                date?.dayOfMonth?.toString() ?: "·",
                style = androidx.compose.material3.MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.ExtraBold,
                color = androidx.compose.material3.MaterialTheme.colorScheme.primary,
            )
        }
    }
}

/**
 * Staggered entrance: fade in and slide up 24dp, delayed by `index`
 * (60ms per slot, capped at 400ms — the web's animate-fade-in-up parity).
 */
fun Modifier.fadeInUp(index: Int = 0): Modifier = composed {
    val progress = remember { Animatable(0f) }
    LaunchedEffect(Unit) {
        delay(min(index * 60L, 400L))
        progress.animateTo(1f, spring(dampingRatio = 0.85f))
    }
    graphicsLayer {
        alpha = progress.value
        translationY = (1f - progress.value) * 24.dp.toPx()
    }
}
