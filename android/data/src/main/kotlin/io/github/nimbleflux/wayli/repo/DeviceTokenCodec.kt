package io.github.nimbleflux.wayli.repo

import java.security.MessageDigest
import java.security.SecureRandom

/**
 * Device-token generation and hashing.
 *
 * Token format: `wayli_dt_` + 32 SecureRandom bytes as 64 hex chars. The
 * prefix makes tokens greppable in leak scans; the server stores only the
 * SHA-256 hex digest of the lowercase token.
 */
object DeviceTokenCodec {
    const val PREFIX = "wayli_dt_"

    private val FORMAT = Regex("^wayli_dt_[0-9a-f]{64}$")

    /** Generate a new plaintext token. */
    fun generate(random: SecureRandom = SecureRandom()): String {
        val bytes = ByteArray(32)
        random.nextBytes(bytes)
        return PREFIX + bytes.joinToString("") { "%02x".format(it) }
    }

    /** True when [token] matches the exact `wayli_dt_` + 64-hex format. */
    fun isValidFormat(token: String): Boolean = FORMAT.matches(token)

    /** SHA-256 hex digest of the lowercase token — what the server stores. */
    fun sha256Hex(token: String): String {
        val digest = MessageDigest.getInstance("SHA-256")
            .digest(token.lowercase().toByteArray(Charsets.UTF_8))
        return digest.joinToString("") { "%02x".format(it) }
    }
}
