package io.github.nimbleflux.wayli

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import dagger.hilt.android.AndroidEntryPoint
import io.github.nimbleflux.wayli.designsystem.WayliTheme
import io.github.nimbleflux.wayli.nav.WayliNavHost

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            WayliTheme {
                WayliNavHost()
            }
        }
    }
}
