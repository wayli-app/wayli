package io.github.nimbleflux.wayli.nav

import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoStories
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.TravelExplore
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.launch
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.nimbleflux.fluxbase.FluxbaseClient
import io.github.nimbleflux.wayli.auth.ForgotPasswordScreen
import io.github.nimbleflux.wayli.auth.SignInScreen
import io.github.nimbleflux.wayli.auth.SignUpScreen
import io.github.nimbleflux.wayli.auth.TwoFactorScreen
import io.github.nimbleflux.wayli.designsystem.WayliBottomBar
import io.github.nimbleflux.wayli.designsystem.WayliTab
import io.github.nimbleflux.wayli.feature.history.HistoryScreen
import io.github.nimbleflux.wayli.feature.home.HomeScreen
import io.github.nimbleflux.wayli.feature.settings.AdminMaintenanceScreen
import io.github.nimbleflux.wayli.feature.settings.AdminUsersScreen
import io.github.nimbleflux.wayli.feature.settings.ConnectionsScreen
import io.github.nimbleflux.wayli.feature.settings.DataSamplingScreen
import io.github.nimbleflux.wayli.feature.settings.ImportExportScreen
import io.github.nimbleflux.wayli.feature.settings.PreferencesScreen
import io.github.nimbleflux.wayli.feature.settings.ProfileEditScreen
import io.github.nimbleflux.wayli.feature.settings.SecuritySettingsScreen
import io.github.nimbleflux.wayli.feature.settings.SettingsScreen
import io.github.nimbleflux.wayli.feature.settings.TripExclusionsScreen
import io.github.nimbleflux.wayli.feature.settings.TwoFactorSetupScreen
import io.github.nimbleflux.wayli.feature.stats.StatsScreen
import io.github.nimbleflux.wayli.feature.tracking.TrackingScreen
import io.github.nimbleflux.wayli.feature.tracking.TrackingSettingsScreen
import io.github.nimbleflux.wayli.feature.travel.TripDetailScreen
import io.github.nimbleflux.wayli.feature.travel.TripsListScreen
import io.github.nimbleflux.wayli.feature.wishlist.WishlistScreen
import io.github.nimbleflux.wayli.models.Trip
import io.github.nimbleflux.wayli.onboarding.InstanceSetupScreen
import io.github.nimbleflux.wayli.session.InstanceManager
import javax.inject.Inject

object Routes {
    const val INSTANCE_SETUP = "instance_setup"
    const val SIGN_IN = "sign_in"
    const val SIGN_UP = "sign_up"
    const val TWO_FACTOR = "two_factor/{userId}"
    const val FORGOT_PASSWORD = "forgot_password"

    // Tab routes
    const val MAP = "map" // The first tab is the Home dashboard (route name kept for continuity)
    const val TRAVEL = "travel"
    const val WISHLIST = "wishlist"
    const val SETTINGS = "settings"

    // Pushed screens
    const val LIVE_TRACKING = "live_tracking"
    const val TRIP_DETAIL = "trip_detail/{tripId}"
    const val ENTRY_EDITOR = "entry_editor/{tripId}?entryId={entryId}&draftId={draftId}"
    const val STATS = "stats"
    const val HISTORY = "history"
    const val TRACKING_SETTINGS = "tracking_settings"
    const val PROFILE = "profile"
    const val SECURITY = "security"
    const val PREFERENCES = "preferences"
    const val CONNECTIONS = "connections"
    const val DATA_SAMPLING = "data_sampling"
    const val TWO_FACTOR_SETUP = "two_factor_setup"
    const val TRIP_EXCLUSIONS = "trip_exclusions"
    const val IMPORT_EXPORT = "import_export"
    const val ADMIN_USERS = "admin_users"
    const val ADMIN_MAINTENANCE = "admin_maintenance"
}

private val tabs = listOf(
    WayliTab(Routes.MAP, "Home", Icons.Filled.Home),
    WayliTab(Routes.TRAVEL, "Travel", Icons.Filled.TravelExplore),
    WayliTab(Routes.WISHLIST, "Wishlist", Icons.Filled.Star),
    WayliTab(Routes.SETTINGS, "Settings", Icons.Filled.Settings),
)

@HiltViewModel
class NavViewModel @Inject constructor(
    private val instanceManager: InstanceManager,
    private val demoManager: io.github.nimbleflux.wayli.demo.DemoManager,
    private val fluxbaseClient: FluxbaseClient,
    private val encryptedStorage: io.github.nimbleflux.wayli.session.EncryptedStorageAdapter,
    private val deviceTokenStore: io.github.nimbleflux.wayli.session.DeviceTokenStore,
    private val deviceTokenRepo: io.github.nimbleflux.wayli.repo.DeviceTokenRepository,
) : ViewModel() {
    /** Live read — demo mode can flip mid-session (Try Demo / Exit demo). */
    val isDemoMode: Boolean get() = demoManager.isDemoMode

    val startRoute: String = when {
        demoManager.isDemoMode -> Routes.MAP
        !instanceManager.isConfigured -> Routes.INSTANCE_SETUP
        else -> {
            if (fluxbaseClient.auth.currentSession != null) Routes.MAP else Routes.SIGN_IN
        }
    }

    /**
     * Session state as a flow — emits on sign-in/out/refresh. [WayliNavHost]
     * collects this to re-route when a session ends (e.g. revoked or expired
     * server-side), not just on the manual Settings sign-out.
     */
    val authEvents: Flow<io.github.nimbleflux.fluxbase.auth.AuthState> = callbackFlow {
        val unsubscribe = fluxbaseClient.auth.onAuthStateChange { state -> trySend(state) }
        awaitClose { unsubscribe() }
    }

    /**
     * Sign out of the current session. In demo mode this just clears the demo
     * flag; in real mode it calls the Fluxbase auth signOut endpoint. The
     * caller then navigates to INSTANCE_SETUP (demo) or SIGN_IN (real).
     *
     * Hardened: the persisted session is removed locally even when the network
     * call fails (the SDK only clears its storage after a successful POST),
     * and the device's GPS token is revoked + cleared.
     */
    fun signOut() {
        if (demoManager.isDemoMode) {
            demoManager.disableDemoMode()
            return
        }
        viewModelScope.launch(Dispatchers.IO) {
            // Best-effort server-side sign-out and token revocation — local
            // state must be cleared regardless of network outcome.
            runCatching { fluxbaseClient.auth.signOut() }
            deviceTokenStore.tokenId?.let { id -> runCatching { deviceTokenRepo.revoke(id) } }
            deviceTokenStore.clear()
            encryptedStorage.removeItem(SESSION_STORAGE_KEY)
        }
    }

    /** The currently configured server URL, if any (for display in Settings). */
    val instanceUrl: String? get() = instanceManager.getConfig()?.url

    /**
     * Clear the stored instance config and sign out, so the user is returned to
     * the instance-setup screen to connect to a different Wayli server.
     */
    fun reconfigureServer() {
        instanceManager.clear()
        if (demoManager.isDemoMode) {
            demoManager.disableDemoMode()
        } else {
            viewModelScope.launch(Dispatchers.IO) {
                runCatching { fluxbaseClient.auth.signOut() }
                deviceTokenStore.tokenId?.let { id -> runCatching { deviceTokenRepo.revoke(id) } }
                deviceTokenStore.clear()
                encryptedStorage.removeItem(SESSION_STORAGE_KEY)
            }
        }
    }

    companion object {
        /** Storage key the SDK persists its session under. */
        private const val SESSION_STORAGE_KEY = "fluxbase.auth.session"
    }
}

@Composable
fun WayliNavHost() {
    val navController = rememberNavController()
    val viewModel: NavViewModel = hiltViewModel()
    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = backStackEntry?.destination?.route
    val isTabRoute = currentRoute in tabs.map { it.route }

    // Re-route when the session ends outside the manual sign-out flow —
    // e.g. revoked/expired server-side. The manual Settings sign-out already
    // navigates; the launchSingleTop guard makes the duplicate event a no-op.
    androidx.compose.runtime.LaunchedEffect(Unit) {
        viewModel.authEvents.collect { state ->
            val route = navController.currentBackStackEntry?.destination?.route
            val onTabs = route in tabs.map { it.route }
            if (state.event == io.github.nimbleflux.fluxbase.auth.AuthChangeEvent.SIGNED_OUT && onTabs) {
                navController.navigate(Routes.SIGN_IN) {
                    popUpTo(Routes.MAP) { inclusive = true }
                    launchSingleTop = true
                }
            }
        }
    }

    // Switching to a tab restores its saved state and pops back to Home.
    val switchTab: (String) -> Unit = { route ->
        navController.navigate(route) {
            popUpTo(Routes.MAP) { saveState = true }
            launchSingleTop = true
            restoreState = true
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        NavHost(
            navController = navController,
            startDestination = viewModel.startRoute,
            modifier = Modifier.fillMaxSize(),
            enterTransition = { fadeIn(animationSpec = tween(220)) },
            exitTransition = { fadeOut(animationSpec = tween(220)) },
            popEnterTransition = { fadeIn(animationSpec = tween(220)) },
            popExitTransition = { fadeOut(animationSpec = tween(220)) },
        ) {
            composable(Routes.INSTANCE_SETUP) {
                InstanceSetupScreen(
                    onDemoEnabled = {
                        navController.navigate(Routes.MAP) {
                            popUpTo(Routes.INSTANCE_SETUP) { inclusive = true }
                        }
                    },
                )
            }
            composable(Routes.SIGN_IN) {
                SignInScreen(
                    onSignedIn = {
                        navController.navigate(Routes.MAP) {
                            popUpTo(Routes.SIGN_IN) { inclusive = true }
                        }
                    },
                    onNeed2FA = { userId -> navController.navigate("two_factor/$userId") },
                    onSignUp = { navController.navigate(Routes.SIGN_UP) },
                    onForgotPassword = { navController.navigate(Routes.FORGOT_PASSWORD) },
                )
            }
            composable(Routes.SIGN_UP) {
                SignUpScreen(
                    onSignedUp = {
                        navController.navigate(Routes.MAP) {
                            popUpTo(Routes.SIGN_UP) { inclusive = true }
                        }
                    },
                    onBack = { navController.popBackStack() },
                )
            }
            composable(
                route = Routes.TWO_FACTOR,
                arguments = listOf(navArgument("userId") { type = NavType.StringType }),
            ) { entry ->
                TwoFactorScreen(
                    userId = entry.arguments?.getString("userId") ?: "",
                    onVerified = {
                        navController.navigate(Routes.MAP) {
                            popUpTo(Routes.SIGN_IN) { inclusive = true }
                        }
                    },
                )
            }
            composable(Routes.FORGOT_PASSWORD) {
                ForgotPasswordScreen(onBack = { navController.popBackStack() })
            }

            // ---- Tab screens ----
            composable(Routes.MAP) {
                HomeScreen(
                    onStatsClick = { navController.navigate(Routes.STATS) },
                    onStartTracking = { navController.navigate(Routes.LIVE_TRACKING) },
                    onTripClick = { trip: Trip -> navController.navigate("trip_detail/${trip.id}") },
                    onWishlistClick = { switchTab(Routes.WISHLIST) },
                    onHistory = { navController.navigate(Routes.HISTORY) },
                )
            }
            composable(Routes.TRAVEL) {
                TripsListScreen(
                    onTripClick = { trip -> navController.navigate("trip_detail/${trip.id}") },
                    onNewTrip = {},
                )
            }
            composable(Routes.WISHLIST) {
                WishlistScreen(
                    places = if (viewModel.isDemoMode) {
                        io.github.nimbleflux.wayli.demo.DemoData.wishlist
                    } else {
                        emptyList()
                    },
                )
            }
            composable(Routes.SETTINGS) {
                SettingsScreen(
                    demoMode = viewModel.isDemoMode,
                    serverUrl = viewModel.instanceUrl,
                    onProfile = { navController.navigate(Routes.PROFILE) },
                    onSecurity = { navController.navigate(Routes.SECURITY) },
                    onTrackingSettings = { navController.navigate(Routes.TRACKING_SETTINGS) },
                    onConnections = { navController.navigate(Routes.CONNECTIONS) },
                    onDataSampling = { navController.navigate(Routes.DATA_SAMPLING) },
                    onTripExclusions = { navController.navigate(Routes.TRIP_EXCLUSIONS) },
                    onImportExport = { navController.navigate(Routes.IMPORT_EXPORT) },
                    onPreferences = { navController.navigate(Routes.PREFERENCES) },
                    onAdminUsers = { navController.navigate(Routes.ADMIN_USERS) },
                    onAdminMaintenance = { navController.navigate(Routes.ADMIN_MAINTENANCE) },
                    onStats = { navController.navigate(Routes.STATS) },
                    onReconfigureServer = {
                        viewModel.reconfigureServer()
                        navController.navigate(Routes.INSTANCE_SETUP) {
                            popUpTo(Routes.MAP) { inclusive = true }
                        }
                    },
                    onSignOut = {
                        val dest = if (viewModel.isDemoMode) Routes.INSTANCE_SETUP else Routes.SIGN_IN
                        viewModel.signOut()
                        navController.navigate(dest) {
                            popUpTo(Routes.MAP) { inclusive = true }
                        }
                    },
                )
            }

            // ---- Pushed screens ----
            composable(Routes.LIVE_TRACKING) {
                TrackingScreen(onTrackingSettings = { navController.navigate(Routes.TRACKING_SETTINGS) })
            }
            composable(
                route = Routes.TRIP_DETAIL,
                arguments = listOf(navArgument("tripId") { type = NavType.StringType }),
            ) { entry ->
                val detailVm: io.github.nimbleflux.wayli.feature.travel.TripDetailViewModel =
                    androidx.hilt.navigation.compose.hiltViewModel(entry)

                // Apply the editor's save result when we come back to this entry.
                val entrySaved by entry.savedStateHandle
                    .getStateFlow("entry_saved", false)
                    .collectAsState()
                LaunchedEffect(entrySaved) {
                    if (entrySaved) {
                        entry.savedStateHandle["entry_saved"] = false
                        val saved = io.github.nimbleflux.wayli.feature.travel.EntryEditorResultCache.entry
                        io.github.nimbleflux.wayli.feature.travel.EntryEditorResultCache.entry = null
                        detailVm.applyEditorResult(saved)
                    }
                }

                TripDetailScreen(
                    onBack = { navController.popBackStack() },
                    onOpenDraft = { draft ->
                        navController.navigate("entry_editor/${detailVm.tripId}?draftId=${draft.id}")
                    },
                    onOpenEditor = { journalEntry ->
                        journalEntry?.let {
                            io.github.nimbleflux.wayli.feature.travel.EntryEditorInputCache.entry = it
                        }
                        val target = journalEntry?.id
                        navController.navigate(
                            if (target != null) {
                                "entry_editor/${detailVm.tripId}?entryId=$target"
                            } else {
                                "entry_editor/${detailVm.tripId}"
                            },
                        )
                    },
                    viewModel = detailVm,
                )
            }
            composable(
                route = Routes.ENTRY_EDITOR,
                arguments = listOf(
                    navArgument("tripId") { type = NavType.StringType },
                    navArgument("entryId") {
                        type = NavType.StringType
                        defaultValue = ""
                    },
                    navArgument("draftId") {
                        type = NavType.StringType
                        defaultValue = ""
                    },
                ),
            ) {
                io.github.nimbleflux.wayli.feature.travel.EntryEditorScreen(
                    onBack = { navController.popBackStack() },
                    onSaved = {
                        navController.previousBackStackEntry
                            ?.savedStateHandle?.set("entry_saved", true)
                        navController.popBackStack()
                    },
                )
            }
            composable(Routes.STATS) {
                StatsScreen(
                    demoMode = viewModel.isDemoMode,
                    onBack = { navController.popBackStack() },
                    onViewHistory = { navController.navigate(Routes.HISTORY) },
                )
            }
            composable(Routes.HISTORY) {
                HistoryScreen(onBack = { navController.popBackStack() })
            }
            composable(Routes.TRACKING_SETTINGS) {
                TrackingSettingsScreen(onBack = { navController.popBackStack() })
            }
            composable(Routes.PROFILE) {
                ProfileEditScreen(onBack = { navController.popBackStack() })
            }
            composable(Routes.SECURITY) {
                SecuritySettingsScreen(
                    onBack = { navController.popBackStack() },
                    demoMode = viewModel.isDemoMode,
                    onTwoFactor = { navController.navigate(Routes.TWO_FACTOR_SETUP) },
                )
            }
            composable(Routes.PREFERENCES) {
                PreferencesScreen(onBack = { navController.popBackStack() })
            }
            composable(Routes.CONNECTIONS) {
                ConnectionsScreen(onBack = { navController.popBackStack() })
            }
            composable(Routes.DATA_SAMPLING) {
                DataSamplingScreen(onBack = { navController.popBackStack() }, demoMode = viewModel.isDemoMode)
            }
            composable(Routes.TWO_FACTOR_SETUP) {
                TwoFactorSetupScreen(onBack = { navController.popBackStack() })
            }
            composable(Routes.TRIP_EXCLUSIONS) {
                TripExclusionsScreen(onBack = { navController.popBackStack() })
            }
            composable(Routes.IMPORT_EXPORT) {
                ImportExportScreen(onBack = { navController.popBackStack() })
            }
            composable(Routes.ADMIN_USERS) {
                AdminUsersScreen(onBack = { navController.popBackStack() })
            }
            composable(Routes.ADMIN_MAINTENANCE) {
                AdminMaintenanceScreen(onBack = { navController.popBackStack() })
            }
        }

        // Floating dock navigation — overlays content, only on tab routes
        if (isTabRoute) {
            WayliBottomBar(
                tabs = tabs,
                currentRoute = currentRoute,
                onTabSelected = switchTab,
                modifier = Modifier.align(Alignment.BottomCenter),
            )
        }
    }
}
