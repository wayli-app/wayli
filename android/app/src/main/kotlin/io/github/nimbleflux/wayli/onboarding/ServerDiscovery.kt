package io.github.nimbleflux.wayli.onboarding

/**
 * Pure helpers for discovering a Wayli instance's Fluxbase backend from the
 * URL the user actually knows — their Wayli web address.
 *
 * Discovery sources (in order, tried by [InstanceSetupViewModel]):
 * 1. `{wayliUrl}/wayli-app.json` — instance manifest served by the Wayli web
 *    app (fluxbaseUrl + anonKey), with runtime-injected values.
 * 2. `{wayliUrl}/api/v1/auth/config` — when the operator proxies the Fluxbase
 *    API under the web origin; returns `anon_key` on Fluxbase 2026.8.8+.
 * 3. The input itself is a Fluxbase URL (health check confirms).
 */
object ServerDiscovery {

    data class Discovered(val fluxbaseUrl: String, val anonKey: String?)

    /**
     * Normalize user input: trim, prepend a scheme when missing (http for
     * loopback/addresses — e.g. the Android emulator's 10.0.2.2 host alias —
     * https otherwise), strip trailing slashes. Null for blank/unsupported.
     */
    fun normalizeUrl(input: String): String? {
        val trimmed = input.trim()
        if (trimmed.isBlank()) return null
        val withScheme = when {
            trimmed.startsWith("http://", ignoreCase = true) || trimmed.startsWith("https://", ignoreCase = true) -> trimmed
            trimmed.contains("://") -> return null // ftp:// etc. — not supported
            isLocalAddress(trimmed) -> "http://$trimmed"
            else -> "https://$trimmed"
        }
        return withScheme.trimEnd('/')
    }

    /** Loopback / emulator-host aliases / raw IPs where TLS is unlikely. */
    private fun isLocalAddress(value: String): Boolean =
        value.startsWith("10.0.2.2") ||
            value.startsWith("localhost") ||
            value.startsWith("127.") ||
            Regex("^\\d{1,3}(\\.\\d{1,3}){3}(:\\d+)?").matches(value)

    /** True for unsubstituted runtime placeholders ("{{FLUXBASE_...}}"). */
    fun isPlaceholder(value: String): Boolean = value.startsWith("{{") || value.isBlank()

    /**
     * Parse the wayli-app.json manifest:
     * `{"fluxbaseUrl": "...", "anonKey": "..."}`. Returns null when the
     * payload is malformed or still contains unsubstituted placeholders
     * (e.g. a dev build served without env injection).
     */
    fun parseAppManifest(json: String): Discovered? = runCatching {
        val obj = kotlinx.serialization.json.Json.parseToJsonElement(json)
            .let { it as? kotlinx.serialization.json.JsonObject ?: return null }
        val fluxUrl = (obj["fluxbaseUrl"] as? kotlinx.serialization.json.JsonPrimitive)?.content
        val anonKey = (obj["anonKey"] as? kotlinx.serialization.json.JsonPrimitive)?.content
        if (fluxUrl == null || isPlaceholder(fluxUrl)) return null
        Discovered(
            fluxbaseUrl = fluxUrl.trimEnd('/'),
            anonKey = anonKey?.takeUnless { isPlaceholder(it) },
        )
    }.getOrNull()

    /**
     * Extract `anon_key` from a Fluxbase /api/v1/auth/config response.
     * Null when absent, null-y, or placeholder.
     */
    fun parseAnonKeyFromAuthConfig(json: String): String? = runCatching {
        val obj = kotlinx.serialization.json.Json.parseToJsonElement(json)
            .let { it as? kotlinx.serialization.json.JsonObject ?: return null }
        (obj["anon_key"] as? kotlinx.serialization.json.JsonPrimitive)
            ?.content
            ?.takeUnless { isPlaceholder(it) }
    }.getOrNull()
}
