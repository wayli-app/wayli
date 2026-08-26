package io.github.nimbleflux.wayli.repo

import io.github.nimbleflux.wayli.db.DraftEntryDao
import io.github.nimbleflux.wayli.db.DraftEntryEntity
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/** Domain view of a stored draft. */
data class EntryDraft(
    val id: String = "",
    val tripId: String,
    val entryId: String? = null,
    val title: String = "",
    val body: String = "",
    /** Serialized editor block list; null for legacy drafts. */
    val blocks: String? = null,
    val entryDate: String = "",
    val pendingSync: Boolean = false,
    val photos: List<String> = emptyList(),
    val updatedAt: Long = 0,
)

/**
 * Local journal-entry drafts — a trip can have several at once.
 * `DRAFT` entries never leave the device; `PENDING_SYNC` entries are
 * published by EntrySyncWorker as soon as the network allows.
 */
@Singleton
class DraftRepository @Inject constructor(
    private val dao: DraftEntryDao,
) {

    suspend fun get(id: String): EntryDraft? = dao.byId(id)?.toDomain()

    /** All drafts for a trip, most recently touched first. */
    suspend fun listForTrip(tripId: String): List<EntryDraft> =
        dao.byTrip(tripId).map { it.toDomain() }

    /** Insert or update; assigns an id to new drafts. Returns the id. */
    suspend fun save(draft: EntryDraft): String {
        val id = draft.id.ifBlank { UUID.randomUUID().toString() }
        dao.upsert(
            DraftEntryEntity(
                id = id,
                tripId = draft.tripId,
                entryId = draft.entryId,
                title = draft.title,
                body = draft.body,
                blocks = draft.blocks,
                entryDate = draft.entryDate,
                status = if (draft.pendingSync) DraftEntryEntity.Status.PENDING_SYNC else DraftEntryEntity.Status.DRAFT,
                photoPaths = draft.photos.joinToString(","),
                updatedAt = System.currentTimeMillis(),
            ),
        )
        return id
    }

    suspend fun markPendingSync(id: String) {
        val current = dao.byId(id) ?: return
        dao.upsert(current.copy(status = DraftEntryEntity.Status.PENDING_SYNC, updatedAt = System.currentTimeMillis()))
    }

    suspend fun delete(id: String) = dao.delete(id)

    suspend fun pendingSync(): List<EntryDraft> =
        dao.byStatus(DraftEntryEntity.Status.PENDING_SYNC).map { it.toDomain() }

    private fun DraftEntryEntity.toDomain() = EntryDraft(
        id = id,
        tripId = tripId,
        entryId = entryId,
        title = title,
        body = body,
        blocks = blocks,
        entryDate = entryDate,
        pendingSync = status == DraftEntryEntity.Status.PENDING_SYNC,
        photos = photoPaths.split(",").filter { it.isNotBlank() },
        updatedAt = updatedAt,
    )
}
