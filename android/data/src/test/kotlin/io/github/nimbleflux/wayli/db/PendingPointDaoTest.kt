package io.github.nimbleflux.wayli.db

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** In-memory Room tests for the pending-point upload queue. */
@RunWith(RobolectricTestRunner::class)
class PendingPointDaoTest {

    private lateinit var db: WayliDatabase
    private lateinit var dao: PendingPointDao

    @Before
    fun setUp() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        db = Room.inMemoryDatabaseBuilder(context, WayliDatabase::class.java)
            .allowMainThreadQueries()
            .build()
        dao = db.pendingPointDao()
    }

    @After
    fun tearDown() {
        db.close()
    }

    private fun point(tst: Long, deviceId: String = "android") = PendingPointEntity(
        lat = 52.0 + tst * 0.0001,
        lon = 5.0,
        recordedAtSec = tst,
        deviceId = deviceId,
    )

    @Test
    fun insertAndCount() = runTest {
        assertEquals(0, dao.count())
        dao.insert(point(100))
        dao.insert(point(200))
        assertEquals(2, dao.count())
    }

    @Test
    fun `takeBatch returns oldest first`() = runTest {
        dao.insertAll(listOf(point(300), point(100), point(200)))
        val batch = dao.takeBatch(2)
        assertEquals(listOf(100L, 200L), batch.map { it.recordedAtSec })
    }

    @Test
    fun `takeBatch caps at limit`() = runTest {
        dao.insertAll((1..250).map { point(it.toLong()) })
        assertEquals(100, dao.takeBatch(100).size)
    }

    @Test
    fun deleteByIdsRemovesOnlyThose() = runTest {
        dao.insertAll(listOf(point(1), point(2), point(3)))
        val batch = dao.takeBatch(2)
        dao.deleteByIds(batch.map { it.id })
        val remaining = dao.takeBatch(10)
        assertEquals(1, remaining.size)
        assertEquals(3L, remaining[0].recordedAtSec)
    }

    @Test
    fun bumpAttemptsIncrements() = runTest {
        dao.insertAll(listOf(point(1), point(2)))
        val ids = dao.takeBatch(10).map { it.id }
        dao.bumpAttempts(ids)
        dao.bumpAttempts(ids)
        assertEquals(2, dao.takeBatch(10)[0].attempts)
    }

    @Test
    fun dropExhaustedRemovesPoisonPoints() = runTest {
        dao.insertAll(listOf(point(1), point(2), point(3)))
        val ids = dao.takeBatch(10).map { it.id }
        // Exhaust only the first two.
        repeat(3) { dao.bumpAttempts(ids.take(2)) }
        dao.dropExhausted(maxAttempts = 3)
        val remaining = dao.takeBatch(10)
        assertEquals(1, remaining.size)
        assertEquals(3L, remaining[0].recordedAtSec)
    }

    @Test
    fun clearEmptiesQueue() = runTest {
        dao.insertAll(listOf(point(1), point(2)))
        dao.clear()
        assertTrue(dao.takeBatch(10).isEmpty())
    }
}
