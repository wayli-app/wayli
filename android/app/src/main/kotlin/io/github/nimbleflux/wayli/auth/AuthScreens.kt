package io.github.nimbleflux.wayli.auth

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
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
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
import javax.inject.Inject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Sign in screen — email/password with 2FA branch.
 */
@Composable
fun SignInScreen(
    onSignedIn: () -> Unit,
    onNeed2FA: (userId: String) -> Unit,
    onSignUp: () -> Unit,
    onForgotPassword: () -> Unit,
    viewModel: AuthViewModel = hiltViewModel(),
) {
    var email by androidx.compose.runtime.mutableStateOf("")
    var password by androidx.compose.runtime.mutableStateOf("")
    var error by androidx.compose.runtime.mutableStateOf<String?>(null)

    Scaffold { padding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(padding).padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Text("Sign In", style = MaterialTheme.typography.headlineMedium)
            Spacer(Modifier.height(24.dp))

            OutlinedTextField(
                value = email,
                onValueChange = { email = it },
                label = { Text("Email") },
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Email,
                    imeAction = ImeAction.Next,
                ),
                singleLine = true,
                modifier = Modifier.fillMaxSize(),
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
                modifier = Modifier.fillMaxSize(),
            )
            Spacer(Modifier.height(24.dp))

            if (viewModel.loading) {
                CircularProgressIndicator()
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
                    modifier = Modifier.fillMaxSize(),
                ) { Text("Sign In") }
            }

            error?.let {
                Spacer(Modifier.height(12.dp))
                Text(it, color = MaterialTheme.colorScheme.error)
            }

            Spacer(Modifier.height(16.dp))
            OutlinedButton(onClick = onForgotPassword) { Text("Forgot password?") }
            Spacer(Modifier.height(8.dp))
            OutlinedButton(onClick = onSignUp) { Text("Create account") }
        }
    }
}

/**
 * Sign up screen.
 */
@Composable
fun SignUpScreen(
    onSignedUp: () -> Unit,
    onBack: () -> Unit,
    viewModel: AuthViewModel = hiltViewModel(),
) {
    var email by androidx.compose.runtime.mutableStateOf("")
    var password by androidx.compose.runtime.mutableStateOf("")
    var error by androidx.compose.runtime.mutableStateOf<String?>(null)

    Scaffold { padding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(padding).padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Text("Create Account", style = MaterialTheme.typography.headlineMedium)
            Spacer(Modifier.height(24.dp))

            OutlinedTextField(
                value = email,
                onValueChange = { email = it },
                label = { Text("Email") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
                singleLine = true,
                modifier = Modifier.fillMaxSize(),
            )
            Spacer(Modifier.height(12.dp))

            OutlinedTextField(
                value = password,
                onValueChange = { password = it },
                label = { Text("Password") },
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
                singleLine = true,
                modifier = Modifier.fillMaxSize(),
            )
            Spacer(Modifier.height(24.dp))

            if (viewModel.loading) {
                CircularProgressIndicator()
            } else {
                Button(
                    onClick = {
                        if (email.isBlank() || password.isBlank()) {
                            error = "Enter email and password"
                            return@Button
                        }
                        error = null
                        viewModel.signUp(email, password) { success, err ->
                            if (success) onSignedUp()
                            else error = err
                        }
                    },
                    modifier = Modifier.fillMaxSize(),
                ) { Text("Sign Up") }
            }

            error?.let {
                Spacer(Modifier.height(12.dp))
                Text(it, color = MaterialTheme.colorScheme.error)
            }

            Spacer(Modifier.height(16.dp))
            OutlinedButton(onClick = onBack) { Text("Back to sign in") }
        }
    }
}

/**
 * 2FA verification screen — enter TOTP code after signIn returns requires_2fa.
 */
@Composable
fun TwoFactorScreen(
    userId: String,
    onVerified: () -> Unit,
    viewModel: AuthViewModel = hiltViewModel(),
) {
    var code by androidx.compose.runtime.mutableStateOf("")
    var error by androidx.compose.runtime.mutableStateOf<String?>(null)

    Scaffold { padding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(padding).padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Text("Two-Factor Authentication", style = MaterialTheme.typography.headlineMedium)
            Spacer(Modifier.height(16.dp))
            Text("Enter the code from your authenticator app", style = MaterialTheme.typography.bodyMedium)
            Spacer(Modifier.height(24.dp))

            OutlinedTextField(
                value = code,
                onValueChange = { if (it.length <= 6) code = it.filter { c -> c.isDigit() } },
                label = { Text("6-digit code") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number, imeAction = ImeAction.Done),
                singleLine = true,
                modifier = Modifier.fillMaxSize(),
            )
            Spacer(Modifier.height(24.dp))

            if (viewModel.loading) {
                CircularProgressIndicator()
            } else {
                Button(
                    onClick = {
                        if (code.length != 6) {
                            error = "Enter a 6-digit code"
                            return@Button
                        }
                        error = null
                        viewModel.verify2FA(userId, code) { success, err ->
                            if (success) onVerified()
                            else error = err
                        }
                    },
                    modifier = Modifier.fillMaxSize(),
                ) { Text("Verify") }
            }

            error?.let {
                Spacer(Modifier.height(12.dp))
                Text(it, color = MaterialTheme.colorScheme.error)
            }
        }
    }
}

/**
 * Forgot password screen.
 */
@Composable
fun ForgotPasswordScreen(
    onBack: () -> Unit,
    viewModel: AuthViewModel = hiltViewModel(),
) {
    var email by androidx.compose.runtime.mutableStateOf("")
    var sent by androidx.compose.runtime.mutableStateOf(false)
    var error by androidx.compose.runtime.mutableStateOf<String?>(null)

    Scaffold { padding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(padding).padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Text("Reset Password", style = MaterialTheme.typography.headlineMedium)
            Spacer(Modifier.height(24.dp))

            if (sent) {
                Text("Check your email for reset instructions.")
                Spacer(Modifier.height(24.dp))
                OutlinedButton(onClick = onBack) { Text("Back to sign in") }
            } else {
                OutlinedTextField(
                    value = email,
                    onValueChange = { email = it },
                    label = { Text("Email") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Done),
                    singleLine = true,
                    modifier = Modifier.fillMaxSize(),
                )
                Spacer(Modifier.height(24.dp))

                if (viewModel.loading) {
                    CircularProgressIndicator()
                } else {
                    Button(
                        onClick = {
                            if (email.isBlank()) {
                                error = "Enter your email"
                                return@Button
                            }
                            error = null
                            viewModel.sendPasswordReset(email) { success, err ->
                                if (success) sent = true
                                else error = err
                            }
                        },
                        modifier = Modifier.fillMaxSize(),
                    ) { Text("Send Reset Email") }
                }

                error?.let {
                    Spacer(Modifier.height(12.dp))
                    Text(it, color = MaterialTheme.colorScheme.error)
                }

                Spacer(Modifier.height(16.dp))
                OutlinedButton(onClick = onBack) { Text("Back to sign in") }
            }
        }
    }
}

// ---- ViewModel ----

@HiltViewModel
class AuthViewModel @Inject constructor(
    private val fluxbaseClient: dagger.Lazy<FluxbaseClient?>,
) : ViewModel() {

    var loading by mutableStateOf(false)
        private set

    private fun client(): FluxbaseClient =
        fluxbaseClient.get() ?: throw IllegalStateException("FluxbaseClient not configured")

    fun signIn(email: String, password: String, onResult: (AuthResult?, Boolean, String?, String?) -> Unit) {
        loading = true
        viewModelScope.launch(Dispatchers.IO) {
            try {
                val result = client().auth.signInWithPassword(email, password)
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
                val result = client().auth.signUp(email, password)
                withContext(Dispatchers.Main) {
                    loading = false
                    if (result.error != null) onResult(false, result.error!!.message)
                    else onResult(true, null)
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
                val result = client().auth.verify2FA(userId, code)
                withContext(Dispatchers.Main) {
                    loading = false
                    if (result.error != null) onResult(false, result.error!!.message)
                    else onResult(true, null)
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
                val result = client().auth.sendPasswordReset(email)
                withContext(Dispatchers.Main) {
                    loading = false
                    if (result.error != null) onResult(false, result.error!!.message)
                    else onResult(true, null)
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) { loading = false; onResult(false, e.message) }
            }
        }
    }
}
