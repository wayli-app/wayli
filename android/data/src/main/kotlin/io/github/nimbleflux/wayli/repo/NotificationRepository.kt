package io.github.nimbleflux.wayli.repo

import io.github.nimbleflux.fluxbase.FluxbaseClient
import io.github.nimbleflux.fluxbase.from
import io.github.nimbleflux.wayli.models.Notification
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The `notifications` table (owner-private via RLS) — job completions,
 * trip suggestions and friends activity, created server-side by the
 * jobs.queue terminal trigger (and by the web's job store). Reads are
 * cached serve-stale like the other repositories.
 */
@Singleton
class NotificationRepository @Inject constructor(
    private val client: FluxbaseClient,
    private val cache: CacheStore,
) {

    suspend fun list(userId: String, limit: Int = 50): Result<List<Notification>> =
        cache.withCacheList("notifications:$userId", Notification.serializer()) {
            runCatching {
                val result = client.from<Notification>("notifications")
                    .select()
                    .eq("user_id", userId)
                    .order("created_at", ascending = false)
                    .limit(limit)
                    .execute()
                result.dataOrThrow() ?: emptyList()
            }
        }

    suspend fun unreadCount(userId: String): Int =
        list(userId).getOrDefault(emptyList()).count { it.readAt == null }

    suspend fun markRead(id: String): Result<Unit> = runCatching {
        client.from<Notification>("notifications")
            .eq("id", id)
            .update(mapOf("read_at" to nowIso()))
    }

    /** Best-effort bulk read — loops the unread ids (no bulk-null filter needed). */
    suspend fun markAllRead(userId: String): Result<Unit> = runCatching {
        val unread = list(userId).getOrDefault(emptyList()).filter { it.readAt == null }
        unread.forEach { n ->
            runCatching {
                client.from<Notification>("notifications")
                    .eq("id", n.id)
                    .update(mapOf("read_at" to nowIso()))
            }
        }
    }

    suspend fun delete(id: String): Result<Unit> = runCatching {
        client.from<Notification>("notifications").eq("id", id).delete()
    }

    private fun nowIso(): String =
        LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME) + "Z"
}
