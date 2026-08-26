package io.github.nimbleflux.wayli.designsystem

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.Image
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil.compose.SubcomposeAsyncImage
import coil.request.ImageRequest

/**
 * Shared Wayli UI components. Consolidates composables that were previously
 * duplicated per-screen (settings cards, rows, empty/error/loading states) and
 * adds Coil-backed image + avatar helpers with consistent loading/error states.
 *
 * Lives in the :app module (not :core) because the image helpers need Coil,
 * which is only available here — same reason [WayliLogo] lives here.
 */

// ---- Section cards & rows (were duplicated in Settings/TrackingSettings) ----

/**
 * A titled, elevated card grouping a section of settings/content.
 * Replaces the two identical `SettingsCard` defs in SettingsScreen and
 * TrackingSettingsScreen.
 */
@Composable
fun WayliSectionCard(
    modifier: Modifier = Modifier,
    title: String? = null,
    content: @Composable () -> Unit,
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.medium,
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            if (title != null) {
                Text(
                    title,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.primary,
                )
                Spacer(Modifier.height(8.dp))
            }
            content()
        }
    }
}

/** Section title rendered in the brand primary color. */
@Composable
fun SectionHeader(
    title: String,
    modifier: Modifier = Modifier,
    trailing: @Composable (() -> Unit)? = null,
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            title,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
        )
        trailing?.invoke()
    }
}

/** A single settings row: leading icon, label, trailing chevron. */
@Composable
fun SettingRow(
    icon: ImageVector,
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    trailing: @Composable (() -> Unit)? = null,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            icon,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.size(24.dp),
        )
        Spacer(Modifier.size(16.dp))
        Text(
            label,
            style = MaterialTheme.typography.bodyLarge,
            modifier = Modifier.weight(1f),
        )
        trailing?.invoke()
            ?: Icon(
                Icons.AutoMirrored.Filled.KeyboardArrowRight,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
    }
}

/** Label + current value on top, slider below. */
@Composable
fun SliderRow(
    label: String,
    value: Float,
    range: ClosedFloatingPointRange<Float>,
    valueText: String,
    onValueChange: (Float) -> Unit,
) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(label, style = MaterialTheme.typography.bodyMedium)
            Text(
                valueText,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.primary,
                fontWeight = FontWeight.Medium,
            )
        }
        Slider(value = value, onValueChange = onValueChange, valueRange = range)
    }
}

/** Label on the left, switch on the right. */
@Composable
fun SwitchRow(
    label: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, style = MaterialTheme.typography.bodyMedium)
        Switch(checked = checked, onCheckedChange = onCheckedChange)
    }
}

// ---- States: loading / error / empty ----

/** Centered indeterminate spinner. */
@Composable
fun LoadingState(modifier: Modifier = Modifier) {
    Box(
        modifier = modifier.fillMaxSize(),
        contentAlignment = Alignment.Center,
    ) {
        CircularProgressIndicator()
    }
}

/** "Where I've Been" card — offline canvas world map with visited countries highlighted. */
@Composable
fun WorldMapCard(
    visited: Set<String>,
    modifier: Modifier = Modifier,
    title: String = "Where I've Been",
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.medium,
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = androidx.compose.foundation.layout.Arrangement.SpaceBetween,
            ) {
                Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                Text(
                    "${visited.size} ${if (visited.size == 1) "country" else "countries"}",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(Modifier.height(12.dp))
            io.github.nimbleflux.wayli.designsystem.map.WorldMap(
                visited = visited,
                baseColor = MaterialTheme.colorScheme.surfaceVariant,
                highlightColor = MaterialTheme.colorScheme.primary,
                modifier = Modifier.fillMaxWidth(),
            )
            if (visited.isNotEmpty()) {
                Spacer(Modifier.height(10.dp))
                Text(
                    visited.sorted().joinToString(" ") { flagEmoji(it) },
                    style = MaterialTheme.typography.titleMedium,
                )
            }
        }
    }
}

/** ISO alpha-2 → regional-indicator flag emoji. */
fun flagEmoji(countryCode: String): String =
    countryCode.uppercase().map { 127397 + it.code }.joinToString("") { String(Character.toChars(it)) }

/** Slim banner shown while offline — repositories serve cached data. */
@Composable
fun OfflineBanner(visible: Boolean, modifier: Modifier = Modifier) {
    if (!visible) return
    androidx.compose.material3.Surface(
        modifier = modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.surfaceVariant,
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Icon(
                Icons.Filled.CloudOff,
                contentDescription = null,
                modifier = Modifier.size(16.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                "Offline — showing saved data",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

/** A shimmering placeholder box used for skeletons and image loading. */
@Composable
fun SkeletonBox(modifier: Modifier = Modifier) {
    val transition = rememberInfiniteTransition(label = "skeleton")
    val alpha by transition.animateFloat(
        initialValue = 0.4f,
        targetValue = 0.85f,
        animationSpec = infiniteRepeatable(tween(900), RepeatMode.Reverse),
        label = "skeletonAlpha",
    )
    Box(
        modifier.background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = alpha)),
    )
}

/** Centered emoji in a tinted circle + title + optional subtitle + action. */
@Composable
fun EmptyState(
    emoji: String,
    title: String,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    action: @Composable (() -> Unit)? = null,
) {
    Box(
        modifier = modifier.fillMaxSize().padding(32.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Box(
                modifier = Modifier
                    .size(72.dp)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.1f)),
                contentAlignment = Alignment.Center,
            ) {
                Text(emoji, style = MaterialTheme.typography.headlineMedium)
            }
            Spacer(Modifier.height(16.dp))
            Text(title, style = MaterialTheme.typography.titleMedium)
            subtitle?.let {
                Spacer(Modifier.height(4.dp))
                Text(
                    it,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            action?.let {
                Spacer(Modifier.height(16.dp))
                it()
            }
        }
    }
}

/** Centered error with optional retry button. */
@Composable
fun ErrorState(
    message: String,
    modifier: Modifier = Modifier,
    emoji: String = "⚠️",
    onRetry: (() -> Unit)? = null,
) {
    Box(
        modifier = modifier.fillMaxSize().padding(32.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Box(
                modifier = Modifier
                    .size(72.dp)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.error.copy(alpha = 0.1f)),
                contentAlignment = Alignment.Center,
            ) {
                Text(emoji, style = MaterialTheme.typography.headlineMedium)
            }
            Spacer(Modifier.height(16.dp))
            Text(message, style = MaterialTheme.typography.bodyMedium)
            onRetry?.let {
                Spacer(Modifier.height(16.dp))
                it()
            }
        }
    }
}

// ---- Images & avatars ----

/**
 * Coil-backed image with crossfade and shimmer/placeholder while loading and
 * an icon fallback on error. Route all remote trip/wishlist images through
 * here so they glide in consistently.
 */
@Composable
fun WayliAsyncImage(
    model: Any?,
    contentDescription: String?,
    modifier: Modifier = Modifier,
    contentScale: ContentScale = ContentScale.Crop,
) {
    val context = LocalContext.current
    SubcomposeAsyncImage(
        model = ImageRequest.Builder(context)
            .data(model)
            .crossfade(true)
            .build(),
        contentDescription = contentDescription,
        contentScale = contentScale,
        modifier = modifier,
        loading = { SkeletonBox(Modifier.fillMaxSize()) },
        error = {
            Box(
                modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.surfaceVariant),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    Icons.Filled.Image,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f),
                )
            }
        },
    )
}

/**
 * Circular avatar. Shows the image when [url] is present, otherwise a
 * brand-colored circle with the user's [initials]. Demo profiles have no
 * avatar URL, so the initials fallback ("AT") is the common path.
 */
@Composable
fun Avatar(
    initials: String,
    modifier: Modifier = Modifier,
    url: String? = null,
    size: Dp = 40.dp,
) {
    Box(
        modifier = modifier
            .size(size)
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.primary),
        contentAlignment = Alignment.Center,
    ) {
        if (url != null) {
            WayliAsyncImage(
                model = url,
                contentDescription = null,
                modifier = Modifier.fillMaxSize(),
            )
        } else {
            Text(
                initials.take(2).uppercase(),
                color = MaterialTheme.colorScheme.onPrimary,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold,
            )
        }
    }
}
