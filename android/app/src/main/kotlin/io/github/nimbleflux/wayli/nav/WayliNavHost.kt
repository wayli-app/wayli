package io.github.nimbleflux.wayli.nav

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Explore
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.TravelExplore
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
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
import io.github.nimbleflux.wayli.feature.discover.DiscoverScreen
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
}

private data class TabItem(val route: String, val label: String, val icon: ImageVector)

private val tabs = listOf(
    TabItem(Routes.MAP, "Map", Icons.Filled.Map),
    TabItem(Routes.TRAVEL, "Travel", Icons.Filled.TravelExplore),
    TabItem(Routes.DISCOVER, "Discover", Icons.Filled.Explore),
    TabItem(Routes.WISHLIST, "Wishlist", Icons.Filled.Star),
    TabItem(Routes.SETTINGS, "Settings", Icons.Filled.Settings),
)

@HiltViewModel
class NavViewModel @Inject constructor(
    private val instanceManager: InstanceManager,
    private val fluxbaseClient: dagger.Lazy<FluxbaseClient?>,
) : ViewModel() {
    val startRoute: String = if (!instanceManager.isConfigured) {
        Routes.INSTANCE_SETUP
    } else {
        val client = fluxbaseClient.get()
        if (client?.auth?.currentSession != null) Routes.MAP else Routes.SIGN_IN
    }
}

@Composable
fun WayliNavHost() {
    val navController = rememberNavController()
    val viewModel: NavViewModel = hiltViewModel()
    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = backStackEntry?.destination?.route
    val isTabRoute = currentRoute in tabs.map { it.route }

    Scaffold(
        bottomBar = {
            if (isTabRoute) {
                NavigationBar {
                    tabs.forEach { tab ->
                        NavigationBarItem(
                            icon = { Icon(tab.icon, contentDescription = tab.label) },
                            label = { Text(tab.label) },
                            selected = currentRoute == tab.route,
                            onClick = {
                                navController.navigate(tab.route) {
                                    popUpTo(Routes.MAP) { saveState = true }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            },
                        )
                    }
                }
            }
        },
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = viewModel.startRoute,
            modifier = Modifier.padding(innerPadding),
        ) {
            composable(Routes.INSTANCE_SETUP) {
                InstanceSetupScreen(
                    onConfigured = {
                        navController.navigate(Routes.SIGN_IN) {
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
                TripsListScreen(trips = emptyList(), onTripClick = {}, onNewTrip = {})
            }
            composable(Routes.DISCOVER) { DiscoverScreen() }
            composable(Routes.WISHLIST) { WishlistScreen(places = emptyList()) }
            composable(Routes.SETTINGS) { SettingsScreen() }

            // Non-tab screens
            composable(Routes.TRACKING_SETTINGS) {
                TrackingSettingsScreen(onBack = { navController.popBackStack() })
            }
        }
    }
}
