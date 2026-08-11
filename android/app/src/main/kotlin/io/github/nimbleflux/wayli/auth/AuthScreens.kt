package io.github.nimbleflux.wayli.auth

import androidx.compose.foundation.background
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
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.nimbleflux.fluxbase.FluxbaseClient
import io.github.nimbleflux.fluxbase.auth.AuthResult
import io.github.nimbleflux.wayli.designsystem.WayliLogo
import javax.inject.Inject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private val fieldShape = RoundedCornerShape(16.dp)
private val btnShape = RoundedCornerShape(16.dp)

@Composable
private fun fieldColors() = OutlinedTextFieldDefaults.colors(
    focusedBorderColor = MaterialTheme.colorScheme.primary,
    focusedLabelColor = MaterialTheme.colorScheme.primary,
    unfocusedBorderColor = MaterialTheme.colorScheme.outlineVariant,
)

@Composable
private fun WayliLogoSmall() = WayliLogo(size = 64.dp)

@Composable
private fun AuthScreenContainer(content: @Composable () -> Unit) {
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
        ) { content() }
    }
}

@Composable
fun SignInScreen(
    onSignedIn: () -> Unit,
    onNeed2FA: (String) -> Unit,
    onSignUp: () -> Unit,
    onForgotPassword: () -> Unit,
    viewModel: AuthViewModel = hiltViewModel(),
) {
    var email by mutableStateOf("")
    var password by mutableStateOf("")
    var error by mutableStateOf<String?>(null)

    AuthScreenContainer {
        WayliLogoSmall()
        Spacer(Modifier.height(24.dp))
        Text(
            "Welcome back",
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onBackground,
        )
        Spacer(Modifier.height(8.dp))
        Text(
            "Sign in to continue your journey",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(40.dp))

        OutlinedTextField(
            value = email,
            onValueChange = { email = it },
            label = { Text("Email") },
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Email,
                imeAction = ImeAction.Next,
            ),
            singleLine = true,
            shape = fieldShape,
            modifier = Modifier.fillMaxWidth(),
            colors = fieldColors(),
        )
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = { Text("Password") },
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Password,
                imeAction = ImeAction.Done,
            ),
            singleLine = true,
            shape = fieldShape,
            modifier = Modifier.fillMaxWidth(),
            colors = fieldColors(),
        )
        Spacer(Modifier.height(24.dp))

        if (viewModel.loading) {
            CircularProgressIndicator(
                modifier = Modifier.size(28.dp),
                strokeWidth = 2.dp,
                color = MaterialTheme.colorScheme.primary,
            )
        } else {
            Button(
                onClick = {
                    if (email.isBlank() || password.isBlank()) {
                        error = "Enter email and password"
                        return@Button
                    }
                    error = null
                    viewModel.signIn(email, password) { result, requires2FA, userId, err ->
                        when {
                            err != null -> error = err
                            requires2FA -> onNeed2FA(userId!!)
                            result?.session != null -> onSignedIn()
                            else -> error = "Unexpected response"
                        }
                    }
                },
                modifier = Modifier.fillMaxWidth().height(56.dp),
                shape = btnShape,
            ) {
                Text("Sign In", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            }
        }

        error?.let {
            Spacer(Modifier.height(12.dp))
            Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        }

        Spacer(Modifier.height(16.dp))
        TextButton(onClick = onForgotPassword) {
            Text("Forgot password?", style = MaterialTheme.typography.labelLarge)
        }
        Spacer(Modifier.height(4.dp))
        TextButton(onClick = onSignUp) {
            Text("Create account", style = MaterialTheme.typography.labelLarge)
        }
    }
}

@Composable
fun SignUpScreen(
    onSignedUp: () -> Unit,
    onBack: () -> Unit,
    viewModel: AuthViewModel = hiltViewModel(),
) {
    var email by mutableStateOf("")
    var password by mutableStateOf("")
    var error by mutableStateOf<String?>(null)

    AuthScreenContainer {
        WayliLogoSmall()
        Spacer(Modifier.height(24.dp))
        Text(
            "Create account",
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onBackground,
        )
        Spacer(Modifier.height(8.dp))
        Text(
            "Start tracking your adventures",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(40.dp))

        OutlinedTextField(
            value = email,
            onValueChange = { email = it },
            label = { Text("Email") },
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Email,
                imeAction = ImeAction.Next,
            ),
            singleLine = true,
            shape = fieldShape,
            modifier = Modifier.fillMaxWidth(),
            colors = fieldColors(),
        )
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = { Text("Password") },
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Password,
                imeAction = ImeAction.Done,
            ),
            singleLine = true,
            shape = fieldShape,
            modifier = Modifier.fillMaxWidth(),
            colors = fieldColors(),
        )
        Spacer(Modifier.height(24.dp))

        if (viewModel.loading) {
            CircularProgressIndicator(
                modifier = Modifier.size(28.dp),
                strokeWidth = 2.dp,
                color = MaterialTheme.colorScheme.primary,
            )
        } else {
            Button(
                onClick = {
                    if (email.isBlank() || password.isBlank()) {
                        error = "Enter email and password"
                        return@Button
                    }
                    error = null
                    viewModel.signUp(email, password) { s, e ->
                        if (s) onSignedUp() else error = e
                    }
                },
                modifier = Modifier.fillMaxWidth().height(56.dp),
                shape = btnShape,
            ) {
                Text("Sign Up", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            }
        }

        error?.let {
            Spacer(Modifier.height(12.dp))
            Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        }

        Spacer(Modifier.height(16.dp))
        TextButton(onClick = onBack) {
            Text("Back to sign in", style = MaterialTheme.typography.labelLarge)
        }
    }
}

@Composable
fun TwoFactorScreen(
    userId: String,
    onVerified: () -> Unit,
    viewModel: AuthViewModel = hiltViewModel(),
) {
    var code by mutableStateOf("")
    var error by mutableStateOf<String?>(null)

    AuthScreenContainer {
        WayliLogoSmall()
        Spacer(Modifier.height(24.dp))
        Text(
            "Two-Factor Auth",
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onBackground,
        )
        Spacer(Modifier.height(8.dp))
        Text(
            "Enter the code from your authenticator app",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
        )
        Spacer(Modifier.height(40.dp))

        OutlinedTextField(
            value = code,
            onValueChange = { if (it.length <= 6) code = it.filter { c -> c.isDigit() } },
            label = { Text("6-digit code") },
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Number,
                imeAction = ImeAction.Done,
            ),
            singleLine = true,
            shape = fieldShape,
            modifier = Modifier.fillMaxWidth(),
            colors = fieldColors(),
        )
        Spacer(Modifier.height(24.dp))

        if (viewModel.loading) {
            CircularProgressIndicator(
                modifier = Modifier.size(28.dp),
                strokeWidth = 2.dp,
                color = MaterialTheme.colorScheme.primary,
            )
        } else {
            Button(
                onClick = {
                    if (code.length != 6) {
                        error = "Enter a 6-digit code"
                        return@Button
                    }
                    error = null
                    viewModel.verify2FA(userId, code) { s, e ->
                        if (s) onVerified() else error = e
                    }
                },
                modifier = Modifier.fillMaxWidth().height(56.dp),
                shape = btnShape,
            ) {
                Text("Verify", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            }
        }
        error?.let {
            Spacer(Modifier.height(12.dp))
            Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        }
    }
}

@Composable
fun ForgotPasswordScreen(
    onBack: () -> Unit,
    viewModel: AuthViewModel = hiltViewModel(),
) {
    var email by mutableStateOf("")
    var sent by mutableStateOf(false)
    var error by mutableStateOf<String?>(null)

    AuthScreenContainer {
        WayliLogoSmall()
        Spacer(Modifier.height(24.dp))
        Text(
            "Reset Password",
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onBackground,
        )
        Spacer(Modifier.height(40.dp))

        if (sent) {
            Text(
                "Check your email for reset instructions.",
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(24.dp))
            Button(onClick = onBack, modifier = Modifier.fillMaxWidth().height(52.dp), shape = btnShape) {
                Text("Back to sign in")
            }
        } else {
            OutlinedTextField(
                value = email,
                onValueChange = { email = it },
                label = { Text("Email") },
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Email,
                    imeAction = ImeAction.Done,
                ),
                singleLine = true,
                shape = fieldShape,
                modifier = Modifier.fillMaxWidth(),
                colors = fieldColors(),
            )
            Spacer(Modifier.height(24.dp))
            if (viewModel.loading) {
                CircularProgressIndicator(
                    modifier = Modifier.size(28.dp),
                    strokeWidth = 2.dp,
                    color = MaterialTheme.colorScheme.primary,
                )
            } else {
                Button(
                    onClick = {
                        if (email.isBlank()) {
                            error = "Enter your email"
                            return@Button
                        }
                        error = null
                        viewModel.sendPasswordReset(email) { s, e ->
                            if (s) sent = true else error = e
                        }
                    },
                    modifier = Modifier.fillMaxWidth().height(56.dp),
                    shape = btnShape,
                ) {
                    Text("Send Reset Email", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                }
            }
            error?.let {
                Spacer(Modifier.height(12.dp))
                Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
            }
            Spacer(Modifier.height(16.dp))
            TextButton(onClick = onBack) {
                Text("Back to sign in", style = MaterialTheme.typography.labelLarge)
            }
        }
    }
}

@HiltViewModel
class AuthViewModel @Inject constructor(
    private val fluxbaseClient: FluxbaseClient,
) : ViewModel() {
    var loading by mutableStateOf(false)
        private set

    fun signIn(
        email: String,
        password: String,
        onResult: (AuthResult?, Boolean, String?, String?) -> Unit,
    ) {
        loading = true
        viewModelScope.launch(Dispatchers.IO) {
            try {
                val result = fluxbaseClient.auth.signInWithPassword(email, password)
                withContext(Dispatchers.Main) {
                    loading = false
                    val data = result.data
                    when {
                        result.error != null -> onResult(null, false, null, result.error!!.message)
                        data?.is2faRequired == true -> onResult(data, true, data.userId2fa, null)
                        else -> onResult(data, false, null, null)
                    }
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) { loading = false; onResult(null, false, null, e.message) }
            }
        }
    }

    fun signUp(email: String, password: String, onResult: (Boolean, String?) -> Unit) {
        loading = true
        viewModelScope.launch(Dispatchers.IO) {
            try {
                val r = fluxbaseClient.auth.signUp(email, password)
                withContext(Dispatchers.Main) {
                    loading = false
                    if (r.error != null) onResult(false, r.error!!.message) else onResult(true, null)
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) { loading = false; onResult(false, e.message) }
            }
        }
    }

    fun verify2FA(userId: String, code: String, onResult: (Boolean, String?) -> Unit) {
        loading = true
        viewModelScope.launch(Dispatchers.IO) {
            try {
                val r = fluxbaseClient.auth.verify2FA(userId, code)
                withContext(Dispatchers.Main) {
                    loading = false
                    if (r.error != null) onResult(false, r.error!!.message) else onResult(true, null)
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) { loading = false; onResult(false, e.message) }
            }
        }
    }

    fun sendPasswordReset(email: String, onResult: (Boolean, String?) -> Unit) {
        loading = true
        viewModelScope.launch(Dispatchers.IO) {
            try {
                val r = fluxbaseClient.auth.sendPasswordReset(email)
                withContext(Dispatchers.Main) {
                    loading = false
                    if (r.error != null) onResult(false, r.error!!.message) else onResult(true, null)
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) { loading = false; onResult(false, e.message) }
            }
        }
    }
}
