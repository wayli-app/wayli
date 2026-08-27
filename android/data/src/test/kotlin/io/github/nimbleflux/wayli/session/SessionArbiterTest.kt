package io.github.nimbleflux.wayli.session

import io.github.nimbleflux.fluxbase.FluxbaseClient
import io.github.nimbleflux.fluxbase.FluxbaseError
import io.github.nimbleflux.fluxbase.FluxbaseResponse
import io.github.nimbleflux.fluxbase.auth.AuthSession
import io.github.nimbleflux.fluxbase.auth.User
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.test.runTest
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class SessionArbiterTest {

    private lateinit var client: FluxbaseClient
    private lateinit var arbiter: SessionArbiter

    private val session = AuthSession(
        user = User(id = "u1", email = "u@example.com"),
        accessToken = "at",
        refreshToken = "rt",
        expiresIn = 3600,
        expiresAt = System.currentTimeMillis() + 3_600_000,
    )

    @BeforeTest
    fun setUp() {
        client = mockk(relaxed = true)
        arbiter = SessionArbiter(client)
        SessionExpiryBus.consume()
    }

    @AfterTest
    fun tearDown() {
        SessionExpiryBus.consume()
    }

    // ---- classify: only a definitive server rejection is DEAD ----

    @Test
    fun `401 from the refresh endpoint is DEAD`() {
        assertEquals(SessionArbiter.Verdict.DEAD, SessionArbiter.classify(FluxbaseError(status = 401, message = "Invalid or expired refresh token")))
    }

    @Test
    fun `refresh wording without status is DEAD`() {
        assertEquals(SessionArbiter.Verdict.DEAD, SessionArbiter.classify(FluxbaseError(message = "Invalid or expired refresh token")))
    }

    @Test
    fun `network failure without status is TRANSIENT`() {
        assertEquals(SessionArbiter.Verdict.TRANSIENT, SessionArbiter.classify(FluxbaseError(message = "Connection reset by peer")))
    }

    @Test
    fun `5xx is TRANSIENT`() {
        assertEquals(SessionArbiter.Verdict.TRANSIENT, SessionArbiter.classify(FluxbaseError(status = 503, message = "Bad gateway")))
    }

    @Test
    fun `RPC 403 is TRANSIENT (not a refresh verdict)`() {
        assertEquals(SessionArbiter.Verdict.TRANSIENT, SessionArbiter.classify(FluxbaseError(status = 403, message = "procedure requires authentication")))
    }

    // ---- adjudicate: one explicit refresh decides ----

    @Test
    fun `successful refresh RECOVERS and never fires the bus`() = runTest {
        coEvery { client.auth.refreshSession() } returns FluxbaseResponse.Success(session)
        assertEquals(SessionArbiter.Verdict.RECOVERED, arbiter.adjudicate("test"))
        assertFalse(SessionExpiryBus.expired.value)
    }

    @Test
    fun `server-rejected refresh is DEAD and fires the bus`() = runTest {
        coEvery { client.auth.refreshSession() } returns FluxbaseResponse.Error(FluxbaseError(status = 401, message = "Invalid or expired refresh token"))
        assertEquals(SessionArbiter.Verdict.DEAD, arbiter.adjudicate("test"))
        assertTrue(SessionExpiryBus.expired.value)
    }

    @Test
    fun `network-failed refresh is TRANSIENT and never fires the bus`() = runTest {
        coEvery { client.auth.refreshSession() } returns FluxbaseResponse.Error(FluxbaseError(message = "SocketTimeoutException: connect timed out"))
        assertEquals(SessionArbiter.Verdict.TRANSIENT, arbiter.adjudicate("test"))
        assertFalse(SessionExpiryBus.expired.value)
    }

    @Test
    fun `concurrent adjudications settle on the same verdict`() = runTest {
        coEvery { client.auth.refreshSession() } returns FluxbaseResponse.Error(FluxbaseError(status = 401, message = "Invalid or expired refresh token"))
        val verdicts = listOf(async { arbiter.adjudicate("a") }, async { arbiter.adjudicate("b") }, async { arbiter.adjudicate("c") }).awaitAll()
        assertTrue(verdicts.all { it == SessionArbiter.Verdict.DEAD })
        assertTrue(SessionExpiryBus.expired.value)
    }
}
