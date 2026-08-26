package io.github.nimbleflux.wayli.db

import androidx.room.Dao
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Upsert

/**
 * A locally-stored journal-entry draft. A trip can have several drafts at
 * once (e.g. one per day being written up).
 *
 * - [Status.DRAFT]: the user is still composing — never uploaded.
 * - [Status.PENDING_SYNC]: the user pressed Save but the publish failed
 *   (offline) — [io.github.nimbleflux.wayli.tracking.EntrySyncWorker]
 *   retries and deletes the draft once published.
 *
 * Content lives in [blocks] (serialized editor block list: text blocks and
 * photo blocks referencing server media ids or local photo file paths).
 * The legacy [body]/[photoPaths] columns only serve PENDING_SYNC drafts
 * written by pre-blocks builds.
 */
@Entity(
    tableName = "draft_entries",
    indices = [Index("tripId")],
)
data class DraftEntryEntity(
    @PrimaryKey val id: String,
    val tripId: String,
    /** Set when editing an existing entry; null for new entries. */
    val entryId: String? = null,
    val title: String = "",
    val body: String = "",
    /** JSON editor-block list; null for legacy drafts (body + photoPaths). */
    val blocks: String? = null,
    val entryDate: String = "",
    val status: String = Status.DRAFT,
    /** Comma-joined local photo file paths (legacy drafts only). */
    val photoPaths: String = "",
    val updatedAt: Long = System.currentTimeMillis(),
) {
    object Status {
        const val DRAFT = "draft"
        const val PENDING_SYNC = "pending_sync"
    }
}

@Dao
interface DraftEntryDao {
    @Query("SELECT * FROM draft_entries WHERE id = :id")
    suspend fun byId(id: String): DraftEntryEntity?

    @Query("SELECT * FROM draft_entries WHERE tripId = :tripId ORDER BY updatedAt DESC")
    suspend fun byTrip(tripId: String): List<DraftEntryEntity>

    @Query("SELECT * FROM draft_entries WHERE status = :status ORDER BY updatedAt ASC")
    suspend fun byStatus(status: String): List<DraftEntryEntity>

    @Upsert
    suspend fun upsert(draft: DraftEntryEntity)

    @Query("DELETE FROM draft_entries WHERE id = :id")
    suspend fun delete(id: String)
}
