package io.github.nimbleflux.wayli.feature.wishlist

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.nimbleflux.fluxbase.FluxbaseClient
import io.github.nimbleflux.wayli.demo.DemoManager
import io.github.nimbleflux.wayli.models.WantToVisit
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
) : ViewModel() {

    private val _places = MutableStateFlow<List<WantToVisit>>(emptyList())
    val places: StateFlow<List<WantToVisit>> = _places.asStateFlow()

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
}
