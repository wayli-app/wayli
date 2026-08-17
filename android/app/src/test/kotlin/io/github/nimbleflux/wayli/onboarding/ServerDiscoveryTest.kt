package io.github.nimbleflux.wayli.onboarding

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ServerDiscoveryTest {

    // ---- URL normalization ----

    @Test
    fun `normalize adds scheme and strips trailing slashes`() {
        assertEquals("https://wayli.example.com", ServerDiscovery.normalizeUrl("wayli.example.com"))
        assertEquals("https://wayli.example.com", ServerDiscovery.normalizeUrl("https://wayli.example.com/"))
        assertEquals("http://localhost:4000", ServerDiscovery.normalizeUrl("http://localhost:4000/"))
        assertEquals("http://10.0.2.2:8080", ServerDiscovery.normalizeUrl(" 10.0.2.2:8080 "))
    }

    @Test
    fun `normalize rejects blank and unsupported schemes`() {
        assertNull(ServerDiscovery.normalizeUrl(""))
        assertNull(ServerDiscovery.normalizeUrl("   "))
        assertNull(ServerDiscovery.normalizeUrl("ftp://example.com"))
    }

    // ---- Manifest parsing ----

    @Test
    fun `manifest parses url and key`() {
        val d = ServerDiscovery.parseAppManifest(
            """{"fluxbaseUrl": "https://api.example.com/", "anonKey": "eyJanon..."}""",
        )
        assertNotNull(d)
        assertEquals("https://api.example.com", d.fluxbaseUrl)
        assertEquals("eyJanon...", d.anonKey)
    }

    @Test
    fun `manifest without key still yields the url`() {
        val d = ServerDiscovery.parseAppManifest("""{"fluxbaseUrl": "https://api.example.com"}""")
        assertNotNull(d)
        assertEquals("https://api.example.com", d.fluxbaseUrl)
        assertNull(d.anonKey)
    }

    @Test
    fun `manifest with unsubstituted placeholders is rejected`() {
        // Dev build without startup.sh env injection.
        val d = ServerDiscovery.parseAppManifest(
            """{"fluxbaseUrl": "{{FLUXBASE_PUBLIC_BASE_URL}}", "anonKey": "{{FLUXBASE_ANON_KEY}}"}""",
        )
        assertNull(d)
    }

    @Test
    fun `malformed manifest is rejected safely`() {
        assertNull(ServerDiscovery.parseAppManifest("<html>404</html>"))
        assertNull(ServerDiscovery.parseAppManifest("[]"))
        assertNull(ServerDiscovery.parseAppManifest("{"))
    }

    // ---- auth/config anon_key parsing ----

    @Test
    fun `auth config yields anon key`() {
        val key = ServerDiscovery.parseAnonKeyFromAuthConfig(
            """{"signup_enabled":true,"anon_key":"pk_live_xyz","captcha":null}""",
        )
        assertEquals("pk_live_xyz", key)
    }

    @Test
    fun `auth config without anon key yields null`() {
        // Older Fluxbase servers don't publish it.
        assertNull(ServerDiscovery.parseAnonKeyFromAuthConfig("""{"signup_enabled":true}"""))
        assertNull(ServerDiscovery.parseAnonKeyFromAuthConfig("""{"anon_key":""}"""))
    }

    @Test
    fun `json object detection separates Fluxbase from SPA fallbacks`() {
        assertTrue(ServerDiscovery.isJsonObject("""{"signup_enabled":true}"""))
        // The Wayli web app serves HTML with 200 for every unknown path.
        assertTrue(!ServerDiscovery.isJsonObject("<!doctype html><html>...</html>"))
        assertTrue(!ServerDiscovery.isJsonObject(""))
        assertTrue(!ServerDiscovery.isJsonObject("[]"))
        assertTrue(!ServerDiscovery.isJsonObject("{broken"))
    }

    @Test
    fun `placeholder detection`() {
        assertTrue(ServerDiscovery.isPlaceholder("{{FLUXBASE_ANON_KEY}}"))
        assertTrue(ServerDiscovery.isPlaceholder(""))
        assertTrue(!ServerDiscovery.isPlaceholder("pk_live_real"))
    }

    // ---- Explicit backend fallback ----

    @Test
    fun `explicit backend is accepted when auth config is JSON`() {
        val discovered = ServerDiscovery.fromBackendConfig(
            "https://flux.example.com",
            """{"signup_enabled":true,"anon_key":"pk_live_real"}""",
        )
        assertNotNull(discovered)
        assertEquals("https://flux.example.com", discovered.fluxbaseUrl)
        assertEquals("pk_live_real", discovered.anonKey)
    }

    @Test
    fun `explicit backend is rejected when the body is SPA HTML`() {
        assertNull(
            ServerDiscovery.fromBackendConfig(
                "https://track.example.com",
                "<!doctype html><html><body>Wayli</body></html>",
            ),
        )
        assertNull(ServerDiscovery.fromBackendConfig("https://flux.example.com", ""))
    }

    @Test
    fun `explicit backend without a published anon key yields a null key`() {
        val discovered = ServerDiscovery.fromBackendConfig(
            "https://flux.example.com",
            """{"signup_enabled":true}""",
        )
        assertNotNull(discovered)
        assertNull(discovered.anonKey)
    }
}
