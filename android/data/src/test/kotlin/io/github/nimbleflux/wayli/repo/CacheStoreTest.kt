package io.github.nimbleflux.wayli.repo

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import io.github.nimbleflux.wayli.db.WayliDatabase
import io.github.nimbleflux.wayli.models.Trip
import io.github.nimbleflux.wayli.models.WantToVisit
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.builtins.ListSerializer
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class CacheStoreTest {

    private lateinit var db: WayliDatabase
    private lateinit var cache: CacheStore
    private val arbiter = io.mockk.mockk<io.github.nimbleflux.wayli.session.SessionArbiter>(relaxed = true)

    @BeforeTest
    fun setUp() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        db = Room.inMemoryDatabaseBuilder(context, WayliDatabase::class.java)
            .allowMainThreadQueries()
            .build()
        cache = CacheStore(db.cacheDao(), arbiter)
    }

    @AfterTest
    fun tearDown() {
        db.close()
    }

    @Test
    fun `round-trips a trip list with JsonElement metadata`() = runTest {
        val trips = listOf(
            Trip(
                id = "t1",
                userId = "u1",
                title = "Portuguese Coast",
                startDate = "2026-05-01",
                endDate = "2026-05-08",
                metadata = kotlinx.serialization.json.Json.parseToJsonElement(
                    """{"distanceTraveled": 843000.0}""",
                ),
            ),
        )
        cache.put("trips:u1", trips, ListSerializer(Trip.serializer()))

        val loaded = cache.get("trips:u1", ListSerializer(Trip.serializer()))
        assertEquals(trips, loaded)
    }

    @Test
    fun `round-trips wishlist places with GeoJSON locations`() = runTest {
        val places = listOf(
            WantToVisit(
                id = "p1",
                userId = "u1",
                title = "Kyoto",
                location = kotlinx.serialization.json.Json.parseToJsonElement(
                    """{"type":"Point","coordinates":[135.8,35.0]}""",
                ),
            ),
        )
        cache.put("places:u1", places, ListSerializer(WantToVisit.serializer()))
        assertEquals(places, cache.get("places:u1", ListSerializer(WantToVisit.serializer())))
    }

    @Test
    fun `withCache writes through on success and serves stale on failure`() = runTest {
        var networkWorks = true
        val fetch: suspend () -> Result<List<Trip>> = {
            if (networkWorks) {
                Result.success(listOf(Trip(id = "t1", userId = "u1", title = "Live", startDate = "2026-01-01")))
            } else {
                Result.failure(Exception("offline"))
            }
        }

        val live = cache.withCacheList("trips:u1", Trip.serializer(), fetch)
        assertTrue(live.isSuccess)
        assertEquals("Live", live.getOrThrow().single().title)

        networkWorks = false
        val stale = cache.withCacheList("trips:u1", Trip.serializer(), fetch)
        assertTrue(stale.isSuccess)
        assertEquals("Live", stale.getOrThrow().single().title)
    }

    @Test
    fun `withCache surfaces failure when nothing is cached`() = runTest {
        val result = cache.withCacheList("trips:nobody", Trip.serializer()) {
            Result.failure(Exception("offline"))
        }
        assertFalse(result.isSuccess)
        assertNull(cache.get("never-written", ListSerializer(Trip.serializer())))
    }
}
