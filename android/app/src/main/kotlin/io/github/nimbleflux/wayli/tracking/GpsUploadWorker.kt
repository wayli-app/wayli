package io.github.nimbleflux.wayli.tracking

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import io.github.nimbleflux.wayli.db.PendingPointDao
import io.github.nimbleflux.wayli.gps.TrackingConfigStore
import io.github.nimbleflux.wayli.session.DeviceTokenStore
import io.github.nimbleflux.wayli.session.InstanceManager
import io.github.nimbleflux.wayli.sync.OwnTracksPayloadMapper
import java.net.HttpURLConnection
import java.net.URL
import kotlinx.serialization.json.Json

/**
 * Drains the pending-point queue: batches up to [BATCH_SIZE] points, POSTs
 * them to the `owntracks-points` function authenticated with the device
 * token (`Authorization: Bearer wayli_dt_…` — never in the URL), and deletes
 * the batch on success.
 *
 * Retries with WorkManager's exponential backoff; points that exhausted
 * [MAX_ATTEMPTS] uploads are dropped so the queue can't clog.
 */
@HiltWorker
class GpsUploadWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted params: WorkerParameters,
    private val dao: PendingPointDao,
    private val deviceTokenStore: DeviceTokenStore,
    private val instanceManager: InstanceManager,
    private val configStore: TrackingConfigStore,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val token = deviceTokenStore.token
        val instanceUrl = instanceManager.getConfig()?.url
        if (token == null || instanceUrl == null) {
            // Manual endpoint/token override from Tracking Settings still works.
            val config = configStore.get()
            val manualUrl = config.endpointUrl.takeIf { it.isNotBlank() }
            val manualToken = config.authToken.takeIf { it.isNotBlank() }
            if (manualUrl == null || manualToken == null) {
                // No credentials configured — retry later (user may create a token).
                return if (runAttemptCount < MAX_RUN_ATTEMPTS) Result.retry() else Result.failure()
            }
            return drain(manualUrl, manualToken)
        }
        return drain("$instanceUrl/api/v1/functions/owntracks-points/invoke?namespace=wayli", token)
    }

    private suspend fun drain(endpoint: String, token: String): Result {
        dao.dropExhausted(MAX_ATTEMPTS)
        val batch = dao.takeBatch(BATCH_SIZE)
        if (batch.isEmpty()) return Result.success()

        val payload = Json.encodeToString(
            kotlinx.serialization.json.JsonObject.serializer(),
            OwnTracksPayloadMapper.toPayload(batch),
        )

        return when (postPoints(endpoint, token, payload)) {
            is PostResult.Success -> {
                dao.deleteByIds(batch.map { it.id })
                // More queued? Run again immediately drains the next batch.
                if (batch.size == BATCH_SIZE) Result.retry() else Result.success()
            }
            is PostResult.Retryable -> {
                dao.bumpAttempts(batch.map { it.id })
                if (runAttemptCount < MAX_RUN_ATTEMPTS) Result.retry() else Result.failure()
            }
            is PostResult.Fatal -> Result.failure()
        }
    }

    private fun postPoints(endpoint: String, token: String, payload: String): PostResult {
        var connection: HttpURLConnection? = null
        return try {
            connection = (URL(endpoint).openConnection() as HttpURLConnection).apply {
                if (instanceManager.getConfig()?.insecureTls == true) {
                    io.github.nimbleflux.wayli.session.InsecureTls.applyTo(this)
                }
                requestMethod = "POST"
                connectTimeout = 15_000
                readTimeout = 30_000
                doOutput = true
                setRequestProperty("Authorization", "Bearer $token")
                setRequestProperty("Content-Type", "application/json")
            }
            connection.outputStream.use { it.write(payload.toByteArray(Charsets.UTF_8)) }
            when (val code = connection.responseCode) {
                in 200..299 -> PostResult.Success
                401, 403, 400, 404 -> PostResult.Fatal // bad token/payload — retrying won't help
                else -> PostResult.Retryable
            }
        } catch (e: Exception) {
            PostResult.Retryable // network error — backoff and retry
        } finally {
            connection?.disconnect()
        }
    }

    private sealed class PostResult {
        object Success : PostResult()
        object Retryable : PostResult()
        object Fatal : PostResult()
    }

    companion object {
        const val UNIQUE_NAME = "wayli-gps-upload"
        const val BATCH_SIZE = 100
        const val MAX_ATTEMPTS = 10 // per-point upload attempts before dropping
        const val MAX_RUN_ATTEMPTS = 6 // WorkManager runAttemptCount cap
    }
}
