package io.github.nimbleflux.wayli.feature.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.nimbleflux.fluxbase.FluxbaseClient
import io.github.nimbleflux.fluxbase.from
import io.github.nimbleflux.wayli.demo.DemoManager
import io.github.nimbleflux.wayli.models.UserProfile
import javax.inject.Inject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Holds session-level flags for the current user — notably whether they're a
 * server admin (`user_profiles.role == "admin"`). Used to gate the Server admin
 * entry (Phase C). Demo mode reports admin = true so reviewers can preview the
 * admin surface (read-only / seeded).
 */
@HiltViewModel
class SessionViewModel @Inject constructor(
    private val fluxbaseClient: FluxbaseClient,
    private val demoManager: DemoManager,
) : ViewModel() {

    private val _isAdmin = MutableStateFlow(false)
    val isAdmin: StateFlow<Boolean> = _isAdmin.asStateFlow()

    init {
        if (demoManager.isDemoMode) {
            _isAdmin.value = true
        } else {
            refreshRole()
        }
    }

    /** Re-query the user's role (call after sign-in / profile changes). */
    fun refreshRole() {
        val userId = fluxbaseClient.auth?.currentSession?.user?.id ?: return
        viewModelScope.launch(Dispatchers.IO) {
            runCatching {
                val result = fluxbaseClient.from<UserProfile>("user_profiles")
                    .select()
                    .eq("id", userId)
                    .maybeSingle()
                _isAdmin.value = result.data?.role == "admin"
            }
        }
    }
}
