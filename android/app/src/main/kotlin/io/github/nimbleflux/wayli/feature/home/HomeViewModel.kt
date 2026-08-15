package io.github.nimbleflux.wayli.feature.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.nimbleflux.fluxbase.FluxbaseClient
import io.github.nimbleflux.wayli.demo.DemoData
import io.github.nimbleflux.wayli.demo.DemoManager
import io.github.nimbleflux.wayli.models.Notification
import io.github.nimbleflux.wayli.models.Trip
import io.github.nimbleflux.wayli.models.UserProfile
import io.github.nimbleflux.wayli.models.WantToVisit
import io.github.nimbleflux.wayli.repo.StatsAggregator
import io.github.nimbleflux.wayli.repo.StatsRepository
import io.github.nimbleflux.wayli.repo.TripRepository
import io.github.nimbleflux.wayli.repo.UserRepository
import io.github.nimbleflux.wayli.repo.WishlistRepository
import java.time.LocalDate
import javax.inject.Inject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** Headline numbers shown in the "At a glance" grid. */
data class HomeStats(
    val distanceKm: String,
    val countries: String,
    val timeMovingHours: String,
    val trips: String,
)

/** Everything the Home dashboard renders. */
data class HomeData(
    val profile: UserProfile?,
    val initials: String,
    val stats: HomeStats,
    val trips: List<Trip>,
    val wishlist: List<WantToVisit>,
    val activity: List<Notification>,
)

sealed interface HomeUiState {
    data object Loading : HomeUiState
    data class Error(val message: String) : HomeUiState
    data class Success(val data: HomeData) : HomeUiState
}

/**
 * Feeds the Home dashboard. In demo mode it serves [DemoData] instantly so the
 * front page is immediately full of content. In real mode it loads trips +
 * wishlist from the repositories (stats beyond trip count aren't aggregated
 * client-side yet, so they show "—").
 */
@HiltViewModel
class HomeViewModel @Inject constructor(
    private val demoManager: DemoManager,
    private val fluxbaseClient: FluxbaseClient,
    private val tripRepo: TripRepository,
    private val wishlistRepo: WishlistRepository,
    private val statsRepo: StatsRepository,
    private val userRepo: UserRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow<HomeUiState>(HomeUiState.Loading)
    val uiState: StateFlow<HomeUiState> = _uiState.asStateFlow()

    val isDemoMode: Boolean = demoManager.isDemoMode

    init {
        load()
    }

    fun load() {
        if (demoManager.isDemoMode) {
            val d = DemoData
            _uiState.value = HomeUiState.Success(
                HomeData(
                    profile = d.profile,
                    initials = initials(d.profile),
                    stats = HomeStats(
                        distanceKm = formatNumber(d.totalDistanceKm),
                        countries = d.countriesVisited.toString(),
                        timeMovingHours = d.timeMovingHours.toString(),
                        trips = d.trips.size.toString(),
                    ),
                    trips = d.trips.sortedByDescending { it.startDate },
                    wishlist = d.wishlist,
                    activity = d.notifications,
                ),
            )
            return
        }
        val userId = fluxbaseClient.auth?.currentSession?.user?.id ?: run {
            _uiState.value = HomeUiState.Error("Not authenticated")
            return
        }
        viewModelScope.launch(Dispatchers.IO) {
            _uiState.value = HomeUiState.Loading
            val tripsResult = tripRepo.listTrips(userId)
            val wishlistResult = wishlistRepo.listPlaces(userId)
            if (tripsResult.isSuccess) {
                val trips = tripsResult.getOrDefault(emptyList())
                val wishlist = wishlistResult.getOrDefault(emptyList())

                // Headline stats: aggregate daily activity + points over 90 days.
                val today = LocalDate.now()
                val start = today.minusDays(90)
                val daily = statsRepo.fetchDailyActivity(userId, start.toString(), today.toString())
                    .getOrDefault(emptyList())
                val pointRows = statsRepo.fetchPoints(userId, start.toString(), today.toString())
                    .getOrDefault(emptyList())
                val totals = StatsAggregator.totalsFromDailyActivity(daily)
                val profile = userRepo.getProfile(userId).getOrNull()

                _uiState.value = HomeUiState.Success(
                    HomeData(
                        profile = profile,
                        initials = initials(profile),
                        stats = HomeStats(
                            distanceKm = "%.0f".format(totals.totalDistanceKm),
                            countries = StatsAggregator.countries(pointRows).toString(),
                            timeMovingHours = "%.0f".format(totals.timeMovingHours),
                            trips = trips.size.toString(),
                        ),
                        trips = trips,
                        wishlist = wishlist,
                        activity = emptyList(),
                    ),
                )
            } else {
                _uiState.value =
                    HomeUiState.Error(tripsResult.exceptionOrNull()?.message ?: "Failed to load")
            }
        }
    }

    private fun initials(profile: UserProfile?): String {
        val first = profile?.firstName?.firstOrNull()?.uppercase() ?: ""
        val last = profile?.lastName?.firstOrNull()?.uppercase() ?: ""
        return "$first$last".ifBlank { "W" }
    }

    private fun formatNumber(n: Int): String = "%,d".format(n)
}
