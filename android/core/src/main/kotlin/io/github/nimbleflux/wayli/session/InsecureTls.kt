package io.github.nimbleflux.wayli.session

import java.net.HttpURLConnection
import java.security.SecureRandom
import java.security.cert.X509Certificate
import javax.net.ssl.HttpsURLConnection
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLSocketFactory
import javax.net.ssl.TrustManager
import javax.net.ssl.X509TrustManager

/**
 * Opt-in TLS relaxation for instances behind self-signed certificates.
 * Validation stays ON unless the user explicitly enables it for their
 * instance (onboarding toggle) — the flag is persisted per instance.
 *
 * Two mechanisms:
 *  - [applyTo]: per-connection trust-all, scoped exactly to the connection
 *    (used by discovery and the upload worker).
 *  - [installGlobalFor]: X509TrustManager cannot see the peer host, so the
 *    SDK's OkHttp engine and Coil are covered via a global trust-all
 *    SSLContext; the default hostname verifier still validates every OTHER
 *    host and only skips the configured instance host.
 *    TODO: replace with per-engine config once fluxbase-kotlin rc.3 ships
 *    `FluxbaseClientOptions.trustSslCertificates`.
 */
object InsecureTls {

    private val trustAllManager = object : X509TrustManager {
        override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) = Unit
        override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) = Unit
        override fun getAcceptedIssuers(): Array<X509Certificate> = arrayOf()
    }

    private val trustAllFactory: SSLSocketFactory = SSLContext.getInstance("TLS").apply {
        init(null, arrayOf<TrustManager>(trustAllManager), SecureRandom())
    }.socketFactory

    private val systemVerifier: javax.net.ssl.HostnameVerifier =
        HttpsURLConnection.getDefaultHostnameVerifier()

    private var installedFor: String? = null

    /** Trust-all for this one connection only. */
    fun applyTo(conn: HttpURLConnection) {
        if (conn is HttpsURLConnection) {
            conn.sslSocketFactory = trustAllFactory
            conn.hostnameVerifier = javax.net.ssl.HostnameVerifier { _, _ -> true }
        }
    }

    /**
     * Global install for the configured instance host (idempotent). Covers
     * everything built on the JVM-default SSLContext (OkHttp inside the
     * Fluxbase SDK, Coil). Other hosts still get hostname verification.
     */
    fun installGlobalFor(host: String) {
        if (installedFor == host) return
        SSLContext.setDefault(
            SSLContext.getInstance("TLS").apply {
                init(null, arrayOf<TrustManager>(trustAllManager), SecureRandom())
            },
        )
        HttpsURLConnection.setDefaultHostnameVerifier(javax.net.ssl.HostnameVerifier { hostname, session ->
            hostname == host || systemVerifier.verify(hostname, session)
        })
        installedFor = host
    }

    /** Extract the host from a base URL ("https://a.b:8443/x" → "a.b"). */
    fun hostOf(baseUrl: String): String? = runCatching {
        java.net.URI(baseUrl).host
    }.getOrNull()
}
