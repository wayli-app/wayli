package io.github.nimbleflux.wayli.onboarding

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.nimbleflux.wayli.designsystem.WayliLogo
import io.github.nimbleflux.wayli.util.restartApp
import javax.inject.Inject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun InstanceSetupScreen(
    onDemoEnabled: () -> Unit,
    viewModel: InstanceSetupViewModel = hiltViewModel(),
) {
    val context = LocalContext.current
    var url by remember { mutableStateOf("") }
    var selfSigned by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 32.dp)
                .imePadding()
                .navigationBarsPadding(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            // Logo
            WayliLogo(size = 96.dp)

            Spacer(Modifier.height(32.dp))

            // Headline
            Text(
                "Welcome to Wayli",
                style = MaterialTheme.typography.headlineLarge,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onBackground,
            )
            Spacer(Modifier.height(8.dp))
            Text(
                "Track your travels. Relive your journeys.",
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(48.dp))

            // Wayli URL field — the address users already know from the browser
                OutlinedTextField(
                    value = url,
                    onValueChange = { url = it },
                    label = { Text("Wayli URL") },
                    placeholder = { Text("https://wayli.example.com") },
                    supportingText = {
                        Text("The address you use in your browser — we'll find the backend and key automatically.")
                    },
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Uri,
                    imeAction = ImeAction.Next,
                ),
                singleLine = true,
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier.fillMaxWidth(),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = MaterialTheme.colorScheme.primary,
                    focusedLabelColor = MaterialTheme.colorScheme.primary,
                    unfocusedBorderColor = MaterialTheme.colorScheme.outlineVariant,
                ),
            )

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                androidx.compose.material3.Checkbox(
                    checked = selfSigned,
                    onCheckedChange = { selfSigned = it },
                )
                Text(
                    "Server uses a self-signed certificate",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(start = 4.dp),
                )
            }

            Spacer(Modifier.height(24.dp))

            // Connect button
            if (viewModel.loading) {
                CircularProgressIndicator(
                    color = MaterialTheme.colorScheme.primary,
                    strokeWidth = 2.dp,
                    modifier = Modifier.size(28.dp),
                )
            } else {
                Button(
                    onClick = {
                        if (url.isBlank()) {
                            error = "Please enter your Wayli URL"
                            return@Button
                        }
                        error = null
                        viewModel.connect(url, allowInsecureTls = selfSigned) { success, msg ->
                            // Restart so the new instance config is picked up by the
                            // FluxbaseClient singleton; on relaunch the user lands on sign-in.
                            if (success) restartApp(context) else error = msg
                        }
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(56.dp),
                    shape = RoundedCornerShape(16.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.primary,
                    ),
                ) {
                    Text(
                        "Connect",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }

            error?.let {
                Spacer(Modifier.height(12.dp))
                Text(
                    it,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )
            }

            Spacer(Modifier.height(40.dp))

            // Divider
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .height(1.dp)
                        .background(MaterialTheme.colorScheme.outlineVariant),
                )
                Text(
                    "or",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = 16.dp),
                )
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .height(1.dp)
                        .background(MaterialTheme.colorScheme.outlineVariant),
                )
            }

            Spacer(Modifier.height(24.dp))

            // Demo button
            OutlinedButton(
                onClick = { viewModel.enableDemo { onDemoEnabled() } },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp),
                shape = RoundedCornerShape(16.dp),
                colors = ButtonDefaults.outlinedButtonColors(
                    contentColor = MaterialTheme.colorScheme.primary,
                ),
            ) {
                Text(
                    "Try Demo",
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.SemiBold,
                )
            }

            Spacer(Modifier.height(8.dp))
            Text(
                "Explore with sample data — no server needed",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@HiltViewModel
class InstanceSetupViewModel @Inject constructor(
    private val instanceManager: io.github.nimbleflux.wayli.session.InstanceManager,
    private val demoManager: io.github.nimbleflux.wayli.demo.DemoManager,
) : ViewModel() {
    var loading by mutableStateOf(false)
        private set

    fun enableDemo(onDone: () -> Unit) {
        demoManager.enableDemoMode()
        onDone()
    }

    /**
     * Connect from a Wayli URL: discover the Fluxbase backend automatically.
     * 1. `{wayliUrl}/wayli-app.json` (instance manifest — best)
     * 2. `{wayliUrl}/api/v1/auth/config` (API proxied under the web origin)
     * 3. The input is itself a Fluxbase URL (health check confirms)
     */
    fun connect(wayliUrl: String, allowInsecureTls: Boolean = false, onResult: (Boolean, String) -> Unit) {
        val normalized = ServerDiscovery.normalizeUrl(wayliUrl)
            ?: run {
                onResult(false, "Please enter a valid URL")
                return
            }
        loading = true
        viewModelScope.launch(Dispatchers.IO) {
            val finish: suspend (Boolean, String) -> Unit = { success, message ->
                withContext(Dispatchers.Main) {
                    loading = false
                    onResult(success, message)
                }
            }
            try {
                val discovered = discoverFrom(normalized, allowInsecureTls)

                if (discovered == null) {
                    finish(false, "Couldn't find a Fluxbase backend at $normalized — check the address.")
                    return@launch
                }

                // Verify the backend is actually alive before storing anything.
                if (!healthCheck(discovered.fluxbaseUrl, allowInsecureTls)) {
                    finish(false, "Found backend ${discovered.fluxbaseUrl} but it didn't respond to a health check.")
                    return@launch
                }
                if (discovered.anonKey == null) {
                    finish(false, "This server doesn't publish an anon key yet — update your Wayli deployment and try again.")
                    return@launch
                }

                instanceManager.setConfig(discovered.fluxbaseUrl, discovered.anonKey, allowInsecureTls)
                finish(true, "")
            } catch (e: Exception) {
                finish(false, "Could not reach: ${e.message}")
            }
        }
    }

    private suspend fun discoverFrom(url: String, allowInsecureTls: Boolean = false): ServerDiscovery.Discovered? {
        // 1. Instance manifest served by the Wayli web app.
        httpGet("$url/wayli-app.json", allowInsecureTls)?.let { body ->
            ServerDiscovery.parseAppManifest(body)?.let { return it }
        }
        // 2. Fluxbase API proxied under the web origin.
        httpGet("$url/api/v1/auth/config", allowInsecureTls)?.let { body ->
            ServerDiscovery.parseAnonKeyFromAuthConfig(body)?.let { key ->
                return ServerDiscovery.Discovered(url, key)
            }
        }
        // 3. The input itself is a Fluxbase server.
        if (healthCheck(url, allowInsecureTls)) {
            val key = httpGet("$url/api/v1/auth/config", allowInsecureTls)
                ?.let(ServerDiscovery::parseAnonKeyFromAuthConfig)
            return ServerDiscovery.Discovered(url, key)
        }
        return null
    }

    private fun healthCheck(baseUrl: String, allowInsecureTls: Boolean = false): Boolean = runCatching {
        val conn = java.net.URL("$baseUrl/health").openConnection() as java.net.HttpURLConnection
        if (allowInsecureTls) io.github.nimbleflux.wayli.session.InsecureTls.applyTo(conn)
        conn.connectTimeout = 5_000
        conn.readTimeout = 5_000
        try {
            conn.responseCode in 200..299
        } finally {
            conn.disconnect()
        }
    }.getOrDefault(false)

    /** GET returning the body only on HTTP 2xx; null otherwise. */
    private fun httpGet(url: String, allowInsecureTls: Boolean = false): String? = runCatching {
        val conn = java.net.URL(url).openConnection() as java.net.HttpURLConnection
        if (allowInsecureTls) io.github.nimbleflux.wayli.session.InsecureTls.applyTo(conn)
        conn.connectTimeout = 5_000
        conn.readTimeout = 5_000
        try {
            if (conn.responseCode !in 200..299) return null
            conn.inputStream.bufferedReader().use { it.readText() }
        } finally {
            conn.disconnect()
        }
    }.getOrNull()

}
