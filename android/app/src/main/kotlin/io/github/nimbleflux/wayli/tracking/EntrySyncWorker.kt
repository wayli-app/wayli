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
import io.github.nimbleflux.wayli.repo.DraftRepository
import io.github.nimbleflux.wayli.repo.TripRepository
import java.io.File
import java.util.concurrent.TimeUnit

/**
 * Publishes journal-entry drafts that were saved while offline
 * (`PENDING_SYNC`): create/update the entry, upload attached photos,
 * attach media rows, then delete the draft. Runs with a network constraint
 * and exponential backoff, mirroring [GpsUploadWorker].
 */
@HiltWorker
class EntrySyncWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted params: WorkerParameters,
    private val draftRepo: DraftRepository,
    private val tripRepo: TripRepository,
    private val mediaUploader: MediaUploader,
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

            // Upload photos first so the body's inline wayli-draft: tokens can
            // be rewritten to final storage paths before the entry is written.
            val uploadedPaths = mutableListOf<String>()
            var mediaFailed = false
            draft.photos.forEach { path ->
                val uploaded = mediaUploader.uploadPhoto(applicationContext, Uri.fromFile(File(path)))
                val storagePath = uploaded.getOrNull()
                if (storagePath == null) {
                    mediaFailed = true
                } else {
                    uploadedPaths += storagePath
                }
            }
            if (mediaFailed) {
                anyFailed = true
                continue
            }
            val body = io.github.nimbleflux.wayli.feature.travel.InlineMedia
                .rewriteDraftTokens(draft.body.trim()) { index -> uploadedPaths.getOrNull(index) }
                .takeIf { it.isNotBlank() }

            val existingId = draft.entryId
            val entryId: String? = if (existingId != null) {
                val updated = tripRepo.updateEntry(existingId, title, date, body)
                if (updated.isFailure) null else existingId
            } else {
                tripRepo.createEntry(draft.tripId, title, date, body).getOrNull()?.id
            }
            if (entryId == null) {
                anyFailed = true
                continue
            }

            uploadedPaths.forEachIndexed { index, storagePath ->
                if (tripRepo.createMedia(draft.tripId, entryId, storagePath, index).isFailure) {
                    mediaFailed = true
                }
            }
            if (mediaFailed) {
                anyFailed = true
                continue
            }
            draftRepo.delete(draft.id)
        }

        return if (anyFailed) {
            if (runAttemptCount < MAX_RUN_ATTEMPTS) Result.retry() else Result.failure()
        } else {
            Result.success()
        }
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
