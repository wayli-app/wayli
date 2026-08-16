package io.github.nimbleflux.wayli

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.getValue
import dagger.hilt.android.AndroidEntryPoint
import io.github.nimbleflux.wayli.designsystem.ThemeManager
import io.github.nimbleflux.wayli.designsystem.WayliTheme
import io.github.nimbleflux.wayli.nav.WayliNavHost
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject
    lateinit var themeManager: ThemeManager

    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
        io.github.nimbleflux.wayli.auth.OAuthDeepLinkBus.deliver(intent.data)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        io.github.nimbleflux.wayli.auth.OAuthDeepLinkBus.deliver(intent?.data)
        setContent {
            // themeModeState is a MutableState — recomposes on theme change
            WayliTheme(themeMode = themeManager.themeModeState.value) {
                WayliNavHost()
            }
        }
    }
}
