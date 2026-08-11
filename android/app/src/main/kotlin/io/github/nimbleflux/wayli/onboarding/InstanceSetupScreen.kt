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
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
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
import io.github.nimbleflux.wayli.designsystem.LightPrimary
import javax.inject.Inject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun InstanceSetupScreen(
    onConfigured: () -> Unit,
    viewModel: InstanceSetupViewModel = hiltViewModel(),
) {
    var url by remember { mutableStateOf("") }
    var anonKey by remember { mutableStateOf("") }
    var showAdvanced by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    Scaffold(containerColor = MaterialTheme.colorScheme.background) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 28.dp)
                .imePadding()
                .navigationBarsPadding(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            io.github.nimbleflux.wayli.designsystem.WayliLogo(size = 88.dp)

            Spacer(Modifier.height(24.dp))
            Text("Wayli", style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Bold, fontSize = 36.sp, color = LightPrimary)
            Spacer(Modifier.height(6.dp))
            Text("Track your travels. Relive your journeys.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)

            Spacer(Modifier.height(40.dp))

            OutlinedTextField(
                value = url, onValueChange = { url = it },
                label = { Text("Instance URL") },
                placeholder = { Text("https://flux.example.com") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Next),
                singleLine = true, shape = RoundedCornerShape(14.dp),
                modifier = Modifier.fillMaxWidth(),
                colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = LightPrimary, focusedLabelColor = LightPrimary),
            )

            if (showAdvanced) {
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = anonKey, onValueChange = { anonKey = it },
                    label = { Text("Anon Key") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
                    singleLine = true, shape = RoundedCornerShape(14.dp),
                    modifier = Modifier.fillMaxWidth(),
                    colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = LightPrimary, focusedLabelColor = LightPrimary),
                )
            } else {
                Spacer(Modifier.height(8.dp))
                Text(
                    "Need an anon key? Tap here",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.clickable { showAdvanced = true }.padding(4.dp),
                )
            }

            Spacer(Modifier.height(20.dp))

            if (viewModel.loading) {
                CircularProgressIndicator(color = LightPrimary, strokeWidth = 2.dp, modifier = Modifier.size(24.dp))
            } else {
                Button(
                    onClick = {
                        if (url.isBlank()) { error = "Please enter an instance URL"; return@Button }
                        if (anonKey.isBlank()) { error = "Anon key is required."; showAdvanced = true; return@Button }
                        error = null
                        viewModel.connect(url, anonKey) { success, msg -> if (success) onConfigured() else error = msg }
                    },
                    modifier = Modifier.fillMaxWidth().height(52.dp),
                    shape = RoundedCornerShape(26.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = LightPrimary),
                ) { Text("Connect", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold) }
            }

            error?.let { Spacer(Modifier.height(12.dp)); Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error) }

            Spacer(Modifier.height(28.dp))
            Box(modifier = Modifier.fillMaxWidth(0.3f).height(1.dp).background(MaterialTheme.colorScheme.outlineVariant))
            Spacer(Modifier.height(20.dp))

            OutlinedButton(
                onClick = { viewModel.enableDemo { onConfigured() } },
                modifier = Modifier.fillMaxWidth().height(48.dp),
                shape = RoundedCornerShape(24.dp),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = LightPrimary),
            ) { Text("✨ Try Demo", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Medium) }

            Spacer(Modifier.height(8.dp))
            Text("Explore the app with sample data — no server needed", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
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

    fun enableDemo(onDone: () -> Unit) { demoManager.enableDemoMode(); onDone() }

    fun connect(url: String, anonKey: String, onResult: (Boolean, String) -> Unit) {
        loading = true
        viewModelScope.launch(Dispatchers.IO) {
            try {
                val normalizedUrl = url.trimEnd('/')
                val conn = java.net.URL("$normalizedUrl/health").openConnection()
                conn.connectTimeout = 10_000; conn.readTimeout = 10_000
                val code = (conn as java.net.HttpURLConnection).responseCode
                if (code != 200) { withContext(Dispatchers.Main) { loading = false; onResult(false, "HTTP $code") }; return@launch }
                instanceManager.setConfig(normalizedUrl, anonKey)
                withContext(Dispatchers.Main) { loading = false; onResult(true, "") }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) { loading = false; onResult(false, "Could not reach: ${e.message}") }
            }
        }
    }
}
