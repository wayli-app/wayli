package io.github.nimbleflux.wayli.designsystem

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes
import androidx.compose.ui.unit.dp

/**
 * Wayli shape scale — single source of truth for corner radii across the app.
 * Mirrors the radii already in use (cards 14dp, surfaces/banners 20dp, dock/sheets 28dp)
 * so components pick from a small, consistent set instead of hardcoding dp values.
 *
 * Accessed via [androidx.compose.material3.MaterialTheme.shapes] inside [WayliTheme].
 */
val WayliShapes = Shapes(
    extraSmall = RoundedCornerShape(8.dp),
    small = RoundedCornerShape(12.dp),
    medium = RoundedCornerShape(14.dp), // cards
    large = RoundedCornerShape(20.dp), // surfaces, banners
    extraLarge = RoundedCornerShape(28.dp), // dock, bottom sheets
)
