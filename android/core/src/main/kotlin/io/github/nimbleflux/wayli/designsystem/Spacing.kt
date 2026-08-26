package io.github.nimbleflux.wayli.designsystem

import androidx.compose.ui.unit.dp

/**
 * Wayli spacing tokens. Prefer these over raw `dp` literals so paddings/gaps
 * stay consistent. Existing screens still use literals; new code and refactors
 * should pull from here.
 */
object Spacing {
    val xs = 4.dp
    val sm = 8.dp
    val md = 12.dp
    val lg = 16.dp
    val xl = 20.dp
    val xxl = 24.dp
    val xxxl = 32.dp
}
