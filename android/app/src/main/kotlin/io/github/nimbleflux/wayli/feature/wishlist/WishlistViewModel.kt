package io.github.nimbleflux.wayli.feature.wishlist

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.nimbleflux.fluxbase.FluxbaseClient
import io.github.nimbleflux.wayli.demo.DemoManager
import io.github.nimbleflux.wayli.models.WantToVisit
import io.github.nimbleflux.wayli.repo.GeocodingService
import io.github.nimbleflux.wayli.repo.PlaceSuggestion
import io.github.nimbleflux.wayli.repo.WishlistRepository
import javax.inject.Inject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Loads the wishlist. Demo mode is handled by the caller (DemoData is passed
 * to the screen directly); real mode fetches the user's places from the
 * `want_to_visit_places` table.
 */
@HiltViewModel
class WishlistViewModel @Inject constructor(
    private val demoManager: DemoManager,
    private val client: FluxbaseClient,
    private val repo: WishlistRepository,
    private val geocoder: GeocodingService,
    onlineMonitor: io.github.nimbleflux.wayli.util.OnlineMonitor,
) : ViewModel() {

    /** Live connectivity — drives the offline banner (cached data served). */
    val online: StateFlow<Boolean> = onlineMonitor.online

    private val _places = MutableStateFlow<List<WantToVisit>>(emptyList())
    val places: StateFlow<List<WantToVisit>> = _places.asStateFlow()

    /** Autocomplete hits for the add-place search field (debounced). */
    private val _suggestions = MutableStateFlow<List<PlaceSuggestion>>(emptyList())
    val suggestions: StateFlow<List<PlaceSuggestion>> = _suggestions.asStateFlow()

    private var searchJob: kotlinx.coroutines.Job? = null

    /** Debounced place search — ≥3 characters, 300ms after the last keystroke. */
    fun search(query: String) {
        searchJob?.cancel()
        val q = query.trim()
        if (q.length < 3) {
            _suggestions.value = emptyList()
            return
        }
        searchJob = viewModelScope.launch(Dispatchers.IO) {
            kotlinx.coroutines.delay(300)
            geocoder.autocomplete(q)
                .onSuccess { _suggestions.value = it }
                .onFailure { _suggestions.value = emptyList() }
        }
    }

    fun clearSuggestions() {
        searchJob?.cancel()
        _suggestions.value = emptyList()
    }

    /** Reverse-geocode picked coordinates into a title/address prefill. */
    fun reverseLookup(lat: Double, lng: Double, onResult: (PlaceSuggestion?) -> Unit) {
        viewModelScope.launch(Dispatchers.IO) {
            onResult(geocoder.reverse(lat, lng).getOrNull())
        }
    }

    init {
        if (!demoManager.isDemoMode) load()
    }

    fun load() {
        if (demoManager.isDemoMode) return
        val userId = client.auth.currentSession?.user?.id ?: return
        viewModelScope.launch(Dispatchers.IO) {
            repo.listPlaces(userId)
                .onSuccess { _places.value = it }
        }
    }

    private val _busy = MutableStateFlow(false)
    val busy: StateFlow<Boolean> = _busy.asStateFlow()

    /** Persist via the add-want-to-visit RPC (real) / prepend in memory (demo). */
    fun addPlace(title: String, lat: Double, lng: Double, address: String?) {
        if (_busy.value) return
        if (demoManager.isDemoMode) {
            _places.value = listOf(
                WantToVisit(
                    id = "local-${System.currentTimeMillis()}",
                    userId = "local",
                    title = title,
                    location = kotlinx.serialization.json.JsonPrimitive("POINT($lng $lat)"),
                    address = address,
                    markerColor = "#3B82F6",
                ),
            ) + _places.value
            return
        }
        viewModelScope.launch(Dispatchers.IO) {
            _busy.value = true
            repo.addPlace(title, lat, lng, address)
            load()
            _busy.value = false
        }
    }
}
