package io.github.nimbleflux.wayli.feature.settings

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Base64
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.nimbleflux.fluxbase.FluxbaseClient
import io.github.nimbleflux.wayli.designsystem.WayliSectionCard
import io.github.nimbleflux.wayli.demo.DemoManager
import javax.inject.Inject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

@HiltViewModel
class TwoFactorViewModel @Inject constructor(
    private val demoManager: DemoManager,
    private val client: FluxbaseClient,
) : ViewModel() {

    val isDemo: Boolean get() = demoManager.isDemoMode

    sealed class Phase {
        object Loading : Phase()
        data class Loaded(val enabled: Boolean) : Phase()
        data class Setup(val secret: String, val uri: String, val qrDataUrl: String?) : Phase()
        data class BackupCodes(val codes: List<String>) : Phase()
    }

    private val _phase = MutableStateFlow<Phase>(Phase.Loading)
    val phase: StateFlow<Phase> = _phase.asStateFlow()

    private val _busy = MutableStateFlow(false)
    val busy: StateFlow<Boolean> = _busy.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    init { load() }

    fun load() {
        if (isDemo) { _phase.value = Phase.Loaded(false); return }
        viewModelScope.launch(Dispatchers.IO) {
            val res = client.auth.get2FAStatus()
            val status = res.data
            _phase.value = Phase.Loaded(enabled = status?.totp?.isNotEmpty() == true)
        }
    }

    fun beginSetup() {
        if (isDemo || _busy.value) return
        viewModelScope.launch(Dispatchers.IO) {
            _busy.value = true; _error.value = null
            val res = client.auth.setup2FA()
            val data = res.data
            if (data != null) {
                _phase.value = Phase.Setup(
                    secret = data.totp.secret,
                    uri = data.totp.uri,
                    qrDataUrl = data.totp.qrCode,
                )
            } else {
                _error.value = res.error?.message ?: "Setup failed"
            }
            _busy.value = false
        }
    }

    fun verify(code: String) {
        if (_busy.value) return
        viewModelScope.launch(Dispatchers.IO) {
            _busy.value = true; _error.value = null
            val res = client.auth.enable2FA(code.trim())
            val data = res.data
            if (data != null && data.success) {
                _phase.value = Phase.BackupCodes(data.backupCodes)
            } else {
                _error.value = res.error?.message ?: data?.message ?: "Verification failed"
            }
            _busy.value = false
        }
    }

    fun disable(password: String) {
        if (_busy.value) return
        viewModelScope.launch(Dispatchers.IO) {
            _busy.value = true; _error.value = null
            val res = client.auth.disable2FA(password)
            val err = res.error
            if (err == null) {
                _phase.value = Phase.Loaded(false)
            } else {
                _error.value = err.message ?: "Disable failed"
            }
            _busy.value = false
        }
    }

    fun doneWithBackupCodes() { _phase.value = Phase.Loaded(true) }
    fun cancelSetup() { _phase.value = Phase.Loaded(false) }
    fun clearError() { _error.value = null }
}

@Composable
fun TwoFactorSetupScreen(
    onBack: () -> Unit,
    viewModel: TwoFactorViewModel = hiltViewModel(),
) {
    val phase by viewModel.phase.collectAsState()
    val busy by viewModel.busy.collectAsState()
    val error by viewModel.error.collectAsState()

    var code by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }

    SubScreenScaffold(title = "Two-Factor Auth", onBack = onBack) {
        when (val p = phase) {
            is TwoFactorViewModel.Phase.Loading -> ProfileCard("Status", "Loading…")

            is TwoFactorViewModel.Phase.Loaded -> {
                InfoCard(
                    title = "Authenticator app",
                    body = if (p.enabled)
                        "2FA is enabled. You'll need a code from your authenticator app to sign in."
                    else
                        "Add an extra layer of security. When enabled, you'll need a code from your authenticator app to sign in.",
                    status = if (p.enabled) "Enabled" else "Not enabled",
                )
                Spacer(Modifier.height(12.dp))
                if (p.enabled) {
                    OutlinedTextField(
                        value = password,
                        onValueChange = { password = it },
                        label = { Text("Current password") },
                        singleLine = true,
                        enabled = !viewModel.isDemo,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Spacer(Modifier.height(8.dp))
                    Button(
                        onClick = { viewModel.disable(password); password = "" },
                        enabled = !viewModel.isDemo && password.isNotBlank() && !busy,
                        modifier = Modifier.fillMaxWidth().height(48.dp),
                    ) { Text(if (busy) "Disabling…" else "Disable 2FA") }
                } else {
                    Button(
                        onClick = { viewModel.beginSetup() },
                        enabled = !viewModel.isDemo && !busy,
                        modifier = Modifier.fillMaxWidth().height(48.dp),
                    ) { Text(if (busy) "Starting…" else "Enable 2FA") }
                }
                if (viewModel.isDemo) {
                    Spacer(Modifier.height(8.dp))
                    Text(
                        "Demo mode — connect to a real instance to configure 2FA.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            is TwoFactorViewModel.Phase.Setup -> {
                Text("Scan this QR in your authenticator app, or enter the secret manually.", style = MaterialTheme.typography.bodyMedium)
                Spacer(Modifier.height(12.dp))
                p.qrDataUrl?.let { QrImage(dataUrl = it) } ?: Text(
                    "No QR available — use the secret below.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )
                Spacer(Modifier.height(12.dp))
                Card(elevation = CardDefaults.cardElevation(1.dp), modifier = Modifier.fillMaxWidth()) {
                    Text(
                        p.secret,
                        modifier = Modifier.fillMaxWidth().padding(16.dp),
                        style = MaterialTheme.typography.titleMedium,
                        fontFamily = FontFamily.Monospace,
                        textAlign = TextAlign.Center,
                    )
                }
                Spacer(Modifier.height(16.dp))
                OutlinedTextField(
                    value = code,
                    onValueChange = { code = it.filter { c -> c.isDigit() }.take(6) },
                    label = { Text("6-digit code") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(8.dp))
                Button(
                    onClick = { viewModel.verify(code); code = "" },
                    enabled = code.length == 6 && !busy,
                    modifier = Modifier.fillMaxWidth().height(48.dp),
                ) { Text(if (busy) "Verifying…" else "Verify & enable") }
                Spacer(Modifier.height(8.dp))
                OutlinedButton(
                    onClick = { viewModel.cancelSetup() },
                    enabled = !busy,
                    modifier = Modifier.fillMaxWidth().height(48.dp),
                ) { Text("Cancel") }
            }

            is TwoFactorViewModel.Phase.BackupCodes -> {
                Text(
                    "Save these one-time backup codes somewhere safe. You can use them to sign in if you lose your device.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(12.dp))
                Card(elevation = CardDefaults.cardElevation(1.dp), modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.fillMaxWidth().padding(16.dp)) {
                        if (p.codes.isEmpty()) {
                            Text("No backup codes returned.", style = MaterialTheme.typography.bodyMedium)
                        } else {
                            p.codes.chunked(2).forEach { row ->
                                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                    row.forEach { Text(it, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.bodyLarge) }
                                    repeat(2 - row.size) { Spacer(Modifier.size(0.dp)) }
                                }
                                Spacer(Modifier.height(4.dp))
                            }
                        }
                    }
                }
                Spacer(Modifier.height(12.dp))
                Button(
                    onClick = { viewModel.doneWithBackupCodes() },
                    modifier = Modifier.fillMaxWidth().height(48.dp),
                ) { Text("I've saved them") }
            }
        }

        error?.let { msg ->
            Spacer(Modifier.height(8.dp))
            Text(msg, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        }
    }
}

/** Decodes a `data:image/png;base64,…` QR payload into a Compose [Image]. */
@Composable
private fun QrImage(dataUrl: String) {
    val bitmap = remember(dataUrl) { decodeQrDataUrl(dataUrl) }
    if (bitmap != null) {
        Card(
            modifier = Modifier.fillMaxWidth(),
            elevation = CardDefaults.cardElevation(1.dp),
        ) {
            Image(
                bitmap = bitmap.asImageBitmap(),
                contentDescription = "2FA QR code",
                modifier = Modifier.fillMaxWidth().height(220.dp).padding(16.dp),
            )
        }
    }
}

private fun decodeQrDataUrl(dataUrl: String): Bitmap? {
    val isDataUrl = dataUrl.startsWith("data:") && "base64" in dataUrl
    val b64 = if (isDataUrl) dataUrl.substringAfter(',') else return null
    return runCatching {
        val bytes = Base64.decode(b64, Base64.DEFAULT)
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
    }.getOrNull()
}
