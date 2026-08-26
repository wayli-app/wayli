package io.github.nimbleflux.wayli.repo

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

class DeviceTokenCodecTest {

    @Test
    fun `generated tokens match the wayli_dt format`() {
        repeat(50) {
            val token = DeviceTokenCodec.generate()
            assertTrue(DeviceTokenCodec.isValidFormat(token), "bad token: $token")
            assertEquals(64 + DeviceTokenCodec.PREFIX.length, token.length)
        }
    }

    @Test
    fun `generated tokens are unique`() {
        val tokens = (1..200).map { DeviceTokenCodec.generate() }.toSet()
        assertEquals(200, tokens.size)
    }

    @Test
    fun `format rejects malformed tokens`() {
        listOf(
            "",
            "wayli_dt_",
            "wayli_dt_abc", // too short
            "wayli_dt_${"z".repeat(64)}", // non-hex
            "wayli_dt_${"A".repeat(64)}", // uppercase
            "other_${"a".repeat(64)}", // wrong prefix
        ).forEach { token ->
            assertTrue(!DeviceTokenCodec.isValidFormat(token), "should reject: $token")
        }
    }

    @Test
    fun `sha256 matches the known vector`() {
        // echo -n "wayli_dt_0000000000000000000000000000000000000000000000000000000000000000" | sha256sum
        val token = "wayli_dt_" + "0".repeat(64)
        assertEquals(
            "bef93bf7dc282b135a6dd0b68b3778262347d4116ccb497f1e8ec6010981477b",
            DeviceTokenCodec.sha256Hex(token),
        )
    }

    @Test
    fun `sha256 is deterministic and case-insensitive on input`() {
        val token = DeviceTokenCodec.generate()
        assertEquals(DeviceTokenCodec.sha256Hex(token), DeviceTokenCodec.sha256Hex(token))
        // The codec lowercases before hashing so mixed-case tokens hash the same.
        assertEquals(DeviceTokenCodec.sha256Hex(token.uppercase()), DeviceTokenCodec.sha256Hex(token))
        assertEquals(64, DeviceTokenCodec.sha256Hex(token).length)
    }

    @Test
    fun `different tokens produce different hashes`() {
        val a = DeviceTokenCodec.generate()
        val b = DeviceTokenCodec.generate()
        assertNotEquals(DeviceTokenCodec.sha256Hex(a), DeviceTokenCodec.sha256Hex(b))
    }
}
