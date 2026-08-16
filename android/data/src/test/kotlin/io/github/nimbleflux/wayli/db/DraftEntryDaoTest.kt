package io.github.nimbleflux.wayli.db

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import io.github.nimbleflux.wayli.repo.DraftRepository
import io.github.nimbleflux.wayli.repo.EntryDraft
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Multi-draft persistence roundtrips (Room in-memory + repository mapping). */
@RunWith(RobolectricTestRunner::class)
class DraftEntryDaoTest {

    private lateinit var db: WayliDatabase
    private lateinit var repo: DraftRepository

    @Before
    fun setUp() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        db = Room.inMemoryDatabaseBuilder(context, WayliDatabase::class.java)
            .allowMainThreadQueries()
            .build()
        repo = DraftRepository(db.draftEntryDao())
    }

    @After
    fun tearDown() {
        db.close()
    }

    @Test
    fun `save assigns ids and roundtrips fields`() = runTest {
        val id = repo.save(
            EntryDraft(
                tripId = "trip-1",
                entryId = "entry-9",
                title = "Great day",
                body = "We hiked…",
                entryDate = "2026-08-15",
                photos = listOf("/data/p/a.jpg", "/data/p/b.jpg"),
            ),
        )
        assertNotEquals("", id)
        val loaded = repo.get(id)!!
        assertEquals("Great day", loaded.title)
        assertEquals("We hiked…", loaded.body)
        assertEquals("entry-9", loaded.entryId)
        assertEquals(listOf("/data/p/a.jpg", "/data/p/b.jpg"), loaded.photos)
        assertTrue(!loaded.pendingSync)
    }

    @Test
    fun `multiple drafts per trip, most recent first`() = runTest {
        val first = repo.save(EntryDraft(tripId = "t", title = "first"))
        Thread.sleep(2) // distinct updatedAt
        val second = repo.save(EntryDraft(tripId = "t", title = "second"))
        val otherTrip = repo.save(EntryDraft(tripId = "other", title = "elsewhere"))

        val drafts = repo.listForTrip("t")
        assertEquals(listOf("second", "first"), drafts.map { it.title })
        assertEquals(1, repo.listForTrip("other").size)
        assertNotEquals(first, second)
        assertNotEquals(otherTrip, first)
    }

    @Test
    fun `update keeps the same id`() = runTest {
        val id = repo.save(EntryDraft(tripId = "t", title = "v1"))
        repo.save(EntryDraft(id = id, tripId = "t", title = "v2"))
        assertEquals("v2", repo.get(id)!!.title)
        assertEquals(1, repo.listForTrip("t").size)
    }

    @Test
    fun `markPendingSync flips status and pendingSync lists only those`() = runTest {
        val a = repo.save(EntryDraft(tripId = "a", title = "A"))
        val b = repo.save(EntryDraft(tripId = "b", title = "B"))
        repo.markPendingSync(a)
        assertTrue(repo.get(a)!!.pendingSync)
        assertTrue(!repo.get(b)!!.pendingSync)
        assertEquals(listOf(a), repo.pendingSync().map { it.id })
    }

    @Test
    fun deleteRemovesOnlyThatDraft() = runTest {
        val a = repo.save(EntryDraft(tripId = "t", title = "x"))
        val b = repo.save(EntryDraft(tripId = "t", title = "y"))
        repo.delete(a)
        assertNull(repo.get(a))
        assertEquals("y", repo.get(b)!!.title)
    }
}
