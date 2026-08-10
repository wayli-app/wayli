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
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
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
import io.github.nimbleflux.wayli.onboarding.InstanceSetupScreen
import io.github.nimbleflux.wayli.session.InstanceManager
import javax.inject.Inject

// ---- Routes ----

object Routes {
    const val INSTANCE_SETUP = "instance_setup"
    const val SIGN_IN = "sign_in"
    const val SIGN_UP = "sign_up"
    const val TWO_FACTOR = "two_factor/{userId}"
    const val FORGOT_PASSWORD = "forgot_password"

    // Tab routes
    const val MAP = "map"
    const val TRAVEL = "travel"
    const val DISCOVER = "discover"
    const val WISHLIST = "wishlist"
    const val SETTINGS = "settings"
}

data class TabItem(
    val route: String,
    val label: String,
    val icon: ImageVector,
)

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
    val showBottomBar = isTabRoute

    Scaffold(
        bottomBar = {
            if (showBottomBar) {
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
            // Onboarding
            composable(Routes.INSTANCE_SETUP) {
                InstanceSetupScreen(
                    onConfigured = {
                        navController.navigate(Routes.SIGN_IN) {
                            popUpTo(Routes.INSTANCE_SETUP) { inclusive = true }
                        }
                    },
                )
            }

            // Auth
            composable(Routes.SIGN_IN) {
                SignInScreen(
                    onSignedIn = {
                        navController.navigate(Routes.MAP) {
                            popUpTo(Routes.SIGN_IN) { inclusive = true }
                        }
                    },
                    onNeed2FA = { userId ->
                        navController.navigate("two_factor/$userId")
                    },
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
            ) { backStackEntry ->
                val userId = backStackEntry.arguments?.getString("userId") ?: ""
                TwoFactorScreen(
                    userId = userId,
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

            // Tab screens (placeholders for now)
            composable(Routes.MAP) { PlaceholderScreen("Map") }
            composable(Routes.TRAVEL) { PlaceholderScreen("Travel") }
            composable(Routes.DISCOVER) { PlaceholderScreen("Discover") }
            composable(Routes.WISHLIST) { PlaceholderScreen("Wishlist") }
            composable(Routes.SETTINGS) { PlaceholderScreen("Settings") }
        }
    }
}

@Composable
private fun PlaceholderScreen(title: String) {
    Box(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(title, fontWeight = FontWeight.Bold)
    }
}
