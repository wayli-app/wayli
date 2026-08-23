package io.github.nimbleflux.wayli.auth

import io.github.nimbleflux.fluxbase.FluxbaseClient
import io.github.nimbleflux.fluxbase.auth.OAuthOptions
import io.github.nimbleflux.fluxbase.auth.OAuthProviderInfo
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * App-side OAuth orchestration on top of the SDK's auth methods:
 * providers list, authorize URL (opened in the system browser), and the
 * deep-link code exchange. The SDK remembers the pending provider +
 * redirect URI (encrypted storage — survives process death during the
 * browser round-trip) and persists the established session itself.
 */
@Singleton
class AppOAuthClient @Inject constructor(
    private val client: FluxbaseClient,
) {

    /** The redirect URI registered for the app on the IdP. */
    val redirectUri: String = "wayli://oauth/callback"

    suspend fun providers(): List<OAuthProviderInfo> = withContext(Dispatchers.IO) {
        client.auth.getOAuthProviders().data ?: emptyList()
    }

    suspend fun passwordLoginEnabled(): Boolean = withContext(Dispatchers.IO) {
        client.auth.getAuthConfig().data?.passwordLoginEnabled != false
    }

    /** Result of starting an OAuth flow: the URL on success, else the server's error. */
    data class OAuthBegin(val url: String?, val error: String?)

    /** Returns the IdP authorization URL to open in the browser. */
    suspend fun beginOAuth(provider: String): OAuthBegin = withContext(Dispatchers.IO) {
        val response = client.auth.getOAuthUrl(provider, OAuthOptions(redirectUri = redirectUri))
        OAuthBegin(
            url = response.data?.url,
            error = response.data?.url?.let { null } ?: response.error?.message,
        )
    }

    /** Exchange the deep-link code; the SDK establishes + persists the session. */
    suspend fun completeOAuth(code: String, state: String?): Boolean = withContext(Dispatchers.IO) {
        val result = client.auth.exchangeCodeForSession(code, state)
        result.error == null
    }
}

/**
 * Deep-link bus: MainActivity delivers wayli://oauth/callback intents here
 * (launch + onNewIntent); the sign-in screen collects and completes them.
 */
object OAuthDeepLinkBus {
    val uri = kotlinx.coroutines.flow.MutableStateFlow<android.net.Uri?>(null)
    fun deliver(u: android.net.Uri?) {
        if (u != null) uri.value = u
    }
}
