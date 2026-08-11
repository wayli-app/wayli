package io.github.nimbleflux.wayli.nav

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Explore
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.TravelExplore
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
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
import io.github.nimbleflux.wayli.feature.discover.DiscoverScreen
import io.github.nimbleflux.wayli.feature.settings.ConnectionsScreen
import io.github.nimbleflux.wayli.feature.settings.DataSamplingScreen
import io.github.nimbleflux.wayli.feature.settings.LanguageScreen
import io.github.nimbleflux.wayli.feature.settings.ProfileScreen
import io.github.nimbleflux.wayli.feature.settings.SecurityScreen
import io.github.nimbleflux.wayli.feature.settings.SettingsScreen
import io.github.nimbleflux.wayli.feature.stats.StatsScreen
import io.github.nimbleflux.wayli.feature.tracking.TrackingScreen
import io.github.nimbleflux.wayli.feature.tracking.TrackingSettingsScreen
import io.github.nimbleflux.wayli.feature.travel.TripsListScreen
import io.github.nimbleflux.wayli.feature.wishlist.WishlistScreen
import io.github.nimbleflux.wayli.onboarding.InstanceSetupScreen
import io.github.nimbleflux.wayli.session.InstanceManager
import javax.inject.Inject

object Routes {
    const val INSTANCE_SETUP = "instance_setup"
    const val SIGN_IN = "sign_in"
    const val SIGN_UP = "sign_up"
    const val TWO_FACTOR = "two_factor/{userId}"
    const val FORGOT_PASSWORD = "forgot_password"
    const val MAP = "map"
    const val TRAVEL = "travel"
    const val DISCOVER = "discover"
    const val WISHLIST = "wishlist"
    const val SETTINGS = "settings"
    const val TRACKING_SETTINGS = "tracking_settings"
    const val PROFILE = "profile"
    const val SECURITY = "security"
    const val LANGUAGE = "language"
    const val CONNECTIONS = "connections"
    const val DATA_SAMPLING = "data_sampling"
}

private val tabs = listOf(
    WayliTab(Routes.MAP, "Map", Icons.Filled.Map),
    WayliTab(Routes.TRAVEL, "Travel", Icons.Filled.TravelExplore),
    WayliTab(Routes.DISCOVER, "Discover", Icons.Filled.Explore),
    WayliTab(Routes.WISHLIST, "Wishlist", Icons.Filled.Star),
    WayliTab(Routes.SETTINGS, "Settings", Icons.Filled.Settings),
)

@HiltViewModel
class NavViewModel @Inject constructor(
    private val instanceManager: InstanceManager,
    private val demoManager: io.github.nimbleflux.wayli.demo.DemoManager,
    private val fluxbaseClient: FluxbaseClient,
) : ViewModel() {
    val isDemoMode: Boolean = demoManager.isDemoMode

    val startRoute: String = when {
        demoManager.isDemoMode -> Routes.MAP
        !instanceManager.isConfigured -> Routes.INSTANCE_SETUP
        else -> {
            if (fluxbaseClient.auth.currentSession != null) Routes.MAP else Routes.SIGN_IN
        }
    }
}

@Composable
fun WayliNavHost() {
    val navController = rememberNavController()
    val viewModel: NavViewModel = hiltViewModel()
    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = backStackEntry?.destination?.route
    val isTabRoute = currentRoute in tabs.map { it.route }

    Box(modifier = Modifier.fillMaxSize()) {
        NavHost(
            navController = navController,
            startDestination = viewModel.startRoute,
            modifier = Modifier.fillMaxSize(),
        ) {
            composable(Routes.INSTANCE_SETUP) {
                InstanceSetupScreen(
                    onInstanceConfigured = {
                        navController.navigate(Routes.SIGN_IN) {
                            popUpTo(Routes.INSTANCE_SETUP) { inclusive = true }
                        }
                    },
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

            // Tab screens
            composable(Routes.MAP) {
                TrackingScreen(onTrackingSettings = { navController.navigate(Routes.TRACKING_SETTINGS) })
            }
            composable(Routes.TRAVEL) {
                TripsListScreen(onTripClick = {}, onNewTrip = {})
            }
            composable(Routes.DISCOVER) { DiscoverScreen() }
            composable(Routes.WISHLIST) {
                WishlistScreen(places = if (viewModel.isDemoMode) io.github.nimbleflux.wayli.demo.DemoData.wishlist else emptyList())
            }
            composable(Routes.SETTINGS) {
                SettingsScreen(
                    demoMode = viewModel.isDemoMode,
                    onProfile = { navController.navigate(Routes.PROFILE) },
                    onSecurity = { navController.navigate(Routes.SECURITY) },
                    onTrackingSettings = { navController.navigate(Routes.TRACKING_SETTINGS) },
                    onConnections = { navController.navigate(Routes.CONNECTIONS) },
                    onDataSampling = { navController.navigate(Routes.DATA_SAMPLING) },
                    onLanguage = { navController.navigate(Routes.LANGUAGE) },
                )
            }

            // Settings sub-screens
            composable(Routes.TRACKING_SETTINGS) {
                TrackingSettingsScreen(onBack = { navController.popBackStack() })
            }
            composable(Routes.PROFILE) {
                ProfileScreen(onBack = { navController.popBackStack() })
            }
            composable(Routes.SECURITY) {
                SecurityScreen(onBack = { navController.popBackStack() }, demoMode = viewModel.isDemoMode)
            }
            composable(Routes.LANGUAGE) {
                LanguageScreen(onBack = { navController.popBackStack() })
            }
            composable(Routes.CONNECTIONS) {
                ConnectionsScreen(onBack = { navController.popBackStack() })
            }
            composable(Routes.DATA_SAMPLING) {
                DataSamplingScreen(onBack = { navController.popBackStack() }, demoMode = viewModel.isDemoMode)
            }
        }

        // Floating dock navigation — overlays content, only on tab routes
        if (isTabRoute) {
            WayliBottomBar(
                tabs = tabs,
                currentRoute = currentRoute,
                onTabSelected = { route ->
                    navController.navigate(route) {
                        popUpTo(Routes.MAP) { saveState = true }
                        launchSingleTop = true
                        restoreState = true
                    }
                },
                modifier = Modifier.align(Alignment.BottomCenter),
            )
        }
    }
}
