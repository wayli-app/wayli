package io.github.nimbleflux.wayli.feature.home

import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.nimbleflux.wayli.gps.TrackingConfigStore
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Recording control layer. Holds the user's recording on/off intent (on by
 * default) and persists it via [TrackingConfigStore.isTracking].
 *
 * NOTE: this round only manages the *intent* + UI state (Pause/Resume). The
 * actual location-capture pipeline (LocationProvider + foreground service +
 * persistence) is a separate milestone — flipping this today does not yet
 * record GPS points.
 */
@HiltViewModel
class RecordingViewModel @Inject constructor(
    private val store: TrackingConfigStore,
) : ViewModel() {
    private val _isRecording = MutableStateFlow(store.isTracking)
    val isRecording: StateFlow<Boolean> = _isRecording.asStateFlow()

    fun pause() {
        _isRecording.value = false
        store.isTracking = false
    }

    fun resume() {
        _isRecording.value = true
        store.isTracking = true
    }
}
