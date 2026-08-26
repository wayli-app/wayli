package io.github.nimbleflux.wayli.util

import android.net.Uri
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * One-shot bus for launcher shortcuts and the system share-target, mirroring
 * [io.github.nimbleflux.wayli.auth.OAuthDeepLinkBus]: activities deliver, the
 * nav host consumes.
 */
object QuickActionBus {

    sealed interface QuickAction {
        /** App shortcut: go to Home and start the recording flow. */
        data object Record : QuickAction

        /** App shortcut: go to Travel and open the create-trip dialog. */
        data object NewTrip : QuickAction

        /** Share-target payload: shared text plus images already copied into app cache. */
        data class Shared(val text: String?, val photoPaths: List<String>) : QuickAction
    }

    private val _pending = MutableStateFlow<QuickAction?>(null)
    val pending: StateFlow<QuickAction?> = _pending.asStateFlow()

    fun deliver(action: QuickAction) {
        _pending.value = action
    }

    fun consume() {
        _pending.value = null
    }
}

/**
 * Copy a shared content [Uri] into the app's private cache so the grant's
 * lifetime doesn't matter. Returns the absolute file path.
 */
fun copySharedImage(context: android.content.Context, uri: Uri): String? = runCatching {
    val file = java.io.File(context.cacheDir, "shared-${java.util.UUID.randomUUID()}.jpg")
    context.contentResolver.openInputStream(uri)?.use { input ->
        file.outputStream().use { output -> input.copyTo(output) }
    } ?: return null
    file.absolutePath
}.getOrNull()
