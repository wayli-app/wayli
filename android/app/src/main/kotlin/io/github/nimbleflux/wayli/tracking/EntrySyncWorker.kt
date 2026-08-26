package io.github.nimbleflux.wayli.tracking

import android.content.Context
import android.net.Uri
import androidx.hilt.work.HiltWorker
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import io.github.nimbleflux.wayli.feature.media.MediaUploader
import io.github.nimbleflux.wayli.feature.travel.EditorBlockModel
import io.github.nimbleflux.wayli.feature.travel.EntryPublisher
import io.github.nimbleflux.wayli.feature.travel.ExistingMedia
import io.github.nimbleflux.wayli.repo.DraftRepository
import io.github.nimbleflux.wayli.repo.TripRepository
import java.io.File
import java.util.concurrent.TimeUnit

/**
 * Publishes journal-entry drafts that were saved while offline
 * (`PENDING_SYNC`): create/update the entry, upload attached photos,
 * attach media rows, then delete the draft. Runs with a network constraint
 * and exponential backoff, mirroring [GpsUploadWorker].
 *
 * Block-based drafts (the current editor's format) go through
 * [EntryPublisher]; legacy drafts from pre-blocks builds keep the old
 * body-token pipeline.
 */
@HiltWorker
class EntrySyncWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted params: WorkerParameters,
    private val draftRepo: DraftRepository,
    private val tripRepo: TripRepository,
    private val mediaUploader: MediaUploader,
    private val entryPublisher: EntryPublisher,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val pending = draftRepo.pendingSync()
        if (pending.isEmpty()) return Result.success()

        var anyFailed = false
        for (draft in pending) {
            val title = draft.title.trim()
            if (title.isBlank()) {
                // Never publishable — drop instead of retry-forever.
                draftRepo.delete(draft.id)
                continue
            }
            val date = draft.entryDate.ifBlank { java.time.LocalDate.now().toString() }

            val blocks = EditorBlockModel.decode(draft.blocks)
            val published = if (blocks != null) {
                publishBlocks(draft.tripId, draft.entryId, title, date, blocks)
            } else {
                publishLegacy(draft.tripId, draft.entryId, title, date, draft.body, draft.photos)
            }
            if (published) draftRepo.delete(draft.id) else anyFailed = true
        }

        return if (anyFailed) {
            if (runAttemptCount < MAX_RUN_ATTEMPTS) Result.retry() else Result.failure()
        } else {
            Result.success()
        }
    }

    /** The current path — full block publish via the shared publisher. */
    private suspend fun publishBlocks(
        tripId: String,
        entryId: String?,
        title: String,
        date: String,
        blocks: List<io.github.nimbleflux.wayli.feature.travel.EditorBlockDto>,
    ): Boolean {
        val existingMedia = entryId?.let { id ->
            tripRepo.listMedia(tripId, id).getOrNull().orEmpty().mapNotNull { media ->
                mediaUploader.resolveDisplayUrl(storagePath = media.storagePath)
                    ?.let { ExistingMedia(media.id, it, media.storagePath) }
            }
        }.orEmpty()
        return runCatching {
            entryPublisher.publish(
                tripId = tripId,
                entryId = entryId,
                title = title,
                entryDate = date,
                editorBlocks = blocks,
                existingMedia = existingMedia,
            )
        }.isSuccess
    }

    /** Legacy drafts (body + local photos, pre-blocks format). */
    private suspend fun publishLegacy(
        tripId: String,
        entryId: String?,
        title: String,
        date: String,
        body: String,
        photoPaths: List<String>,
    ): Boolean {
        // Upload photos first so the body's inline wayli-draft: tokens can
        // be rewritten to final storage paths before the entry is written.
        val uploadedPaths = mutableListOf<String>()
        photoPaths.forEach { path ->
            val uploaded = mediaUploader.uploadPhoto(applicationContext, Uri.fromFile(File(path)))
            val storagePath = uploaded.getOrNull() ?: return false
            uploadedPaths += storagePath
        }
        val legacyBody = io.github.nimbleflux.wayli.feature.travel.InlineMedia
            .rewriteDraftTokens(body.trim()) { index -> uploadedPaths.getOrNull(index) }
            .takeIf { it.isNotBlank() }

        val targetId: String = if (entryId != null) {
            if (tripRepo.updateEntry(entryId, title, date, legacyBody).isFailure) return false
            entryId
        } else {
            tripRepo.createEntry(tripId, title, date, legacyBody).getOrNull()?.id ?: return false
        }

        uploadedPaths.forEachIndexed { index, storagePath ->
            if (tripRepo.createMedia(tripId, targetId, storagePath, index).isFailure) return false
        }
        return true
    }

    companion object {
        const val UNIQUE_NAME = "wayli-entry-sync"
        private const val MAX_RUN_ATTEMPTS = 6

        /** Enqueue a network-constrained retry pass (idempotent). */
        fun schedule(context: Context) {
            val request = OneTimeWorkRequestBuilder<EntrySyncWorker>()
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build(),
                )
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork(
                UNIQUE_NAME,
                ExistingWorkPolicy.REPLACE,
                request,
            )
        }
    }
}
