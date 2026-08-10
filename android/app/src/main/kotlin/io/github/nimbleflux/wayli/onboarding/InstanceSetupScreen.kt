package io.github.nimbleflux.wayli.onboarding

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.nimbleflux.wayli.designsystem.LightPrimary
import javax.inject.Inject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Instance setup screen — the first screen a new user sees. Enter the Wayli
 * instance URL to connect. QR pairing will be added in a follow-up.
 */
@Composable
fun InstanceSetupScreen(
    onConfigured: () -> Unit,
    viewModel: InstanceSetupViewModel = hiltViewModel(),
) {
    var url by remember { mutableStateOf("") }
    var anonKey by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }

    Scaffold { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Text(
                text = "Wayli",
                style = MaterialTheme.typography.headlineLarge,
                color = LightPrimary,
            )
            Spacer(Modifier.height(8.dp))
            Text(
                text = "Connect to your Wayli instance",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(32.dp))

            OutlinedTextField(
                value = url,
                onValueChange = { url = it },
                label = { Text("Instance URL") },
                placeholder = { Text("https://flux.example.com") },
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Uri,
                    imeAction = ImeAction.Next,
                ),
                singleLine = true,
                modifier = Modifier.fillMaxSize(),
            )
            Spacer(Modifier.height(12.dp))

            OutlinedTextField(
                value = anonKey,
                onValueChange = { anonKey = it },
                label = { Text("Anon Key (optional)") },
                placeholder = { Text("Auto-detected from instance") },
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Password,
                    imeAction = ImeAction.Done,
                ),
                singleLine = true,
                modifier = Modifier.fillMaxSize(),
            )
            Spacer(Modifier.height(24.dp))

            if (viewModel.loading) {
                CircularProgressIndicator()
            } else {
                Button(
                    onClick = {
                        if (url.isBlank()) {
                            error = "Please enter an instance URL"
                            return@Button
                        }
                        error = null
                        viewModel.connect(url, anonKey) { success, msg ->
                            if (success) onConfigured()
                            else error = msg
                        }
                    },
                    modifier = Modifier.fillMaxSize(),
                ) { Text("Connect") }
            }

            error?.let {
                Spacer(Modifier.height(12.dp))
                Text(it, color = MaterialTheme.colorScheme.error)
            }
        }
    }
}

@HiltViewModel
class InstanceSetupViewModel @Inject constructor(
    private val instanceManager: io.github.nimbleflux.wayli.session.InstanceManager,
) : ViewModel() {

    var loading by mutableStateOf(false)
        private set

    fun connect(url: String, anonKey: String, onResult: (Boolean, String) -> Unit) {
        loading = true
        viewModelScope.launch(Dispatchers.IO) {
            try {
                val normalizedUrl = url.trimEnd('/')
                // Health check: verify the instance is reachable
                val client = java.net.URL("${normalizedUrl}/health").openConnection()
                client.connectTimeout = 10_000
                client.readTimeout = 10_000
                val responseCode = (client as java.net.HttpURLConnection).responseCode
                if (responseCode != 200) {
                    withContext(Dispatchers.Main) {
                        loading = false
                        onResult(false, "Instance returned HTTP $responseCode")
                    }
                    return@launch
                }

                // Try to get the anon key from auth config if not provided
                val resolvedKey = if (anonKey.isNotBlank()) {
                    anonKey
                } else {
                    // Attempt to fetch from the instance's config endpoint
                    try {
                        val configConn = java.net.URL("${normalizedUrl}/api/v1/auth/config").openConnection()
                        configConn.setRequestProperty("Accept", "application/json")
                        configConn.connectTimeout = 10_000
                        configConn.readTimeout = 10_000
                        val configText = (configConn as java.net.HttpURLConnection)
                            .inputStream.bufferedReader().readText()
                        // The anon key is typically embedded in the page or available
                        // via a public endpoint. For now, require it manually.
                        anonKey
                    } catch (_: Exception) {
                        anonKey
                    }
                }

                if (resolvedKey.isBlank()) {
                    withContext(Dispatchers.Main) {
                        loading = false
                        onResult(false, "Anon key is required. Find it in your instance settings.")
                    }
                    return@launch
                }

                instanceManager.setConfig(normalizedUrl, resolvedKey)
                withContext(Dispatchers.Main) {
                    loading = false
                    onResult(true, "")
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    loading = false
                    onResult(false, "Could not reach instance: ${e.message}")
                }
            }
        }
    }
}
