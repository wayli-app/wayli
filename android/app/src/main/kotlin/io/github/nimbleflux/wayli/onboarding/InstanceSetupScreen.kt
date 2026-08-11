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
    var anonKey by remember { mutableStateOf("") }
    var showAdvanced by remember { mutableStateOf(false) }
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
            Spacer(Modifier.height(8.dp))
            Text(
                "Wayli is the app; Fluxbase is the self-hosted backend it connects to.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            Spacer(Modifier.height(48.dp))

            // Instance URL field
                OutlinedTextField(
                    value = url,
                    onValueChange = { url = it },
                    label = { Text("Fluxbase backend URL") },
                    placeholder = { Text("https://fluxbase.example.com") },
                    supportingText = {
                        Text("Address of the Fluxbase server that stores your Wayli data — not the Wayli web app.")
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

            // Anon key (collapsible)
            if (showAdvanced) {
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = anonKey,
                    onValueChange = { anonKey = it },
                    label = { Text("Anon Key") },
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Password,
                        imeAction = ImeAction.Done,
                    ),
                    singleLine = true,
                    shape = RoundedCornerShape(16.dp),
                    modifier = Modifier.fillMaxWidth(),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = MaterialTheme.colorScheme.primary,
                        focusedLabelColor = MaterialTheme.colorScheme.primary,
                    ),
                )
            } else {
                Spacer(Modifier.height(8.dp))
                Text(
                    "Need an anon key? Tap here",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.primary,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier
                        .clickable { showAdvanced = true }
                        .padding(4.dp),
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
                            error = "Please enter an instance URL"
                            return@Button
                        }
                        if (anonKey.isBlank()) {
                            error = "An anon key is required."
                            showAdvanced = true
                            return@Button
                        }
                        error = null
                        viewModel.connect(url, anonKey) { success, msg ->
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

    fun connect(url: String, anonKey: String, onResult: (Boolean, String) -> Unit) {
        loading = true
        viewModelScope.launch(Dispatchers.IO) {
            try {
                val normalizedUrl = url.trimEnd('/')
                val conn = java.net.URL("$normalizedUrl/health").openConnection()
                conn.connectTimeout = 10_000
                conn.readTimeout = 10_000
                val code = (conn as java.net.HttpURLConnection).responseCode
                if (code != 200) {
                    withContext(Dispatchers.Main) {
                        loading = false
                        onResult(false, "HTTP $code")
                    }
                    return@launch
                }
                instanceManager.setConfig(normalizedUrl, anonKey)
                withContext(Dispatchers.Main) {
                    loading = false
                    onResult(true, "")
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    loading = false
                    onResult(false, "Could not reach: ${e.message}")
                }
            }
        }
    }
}
