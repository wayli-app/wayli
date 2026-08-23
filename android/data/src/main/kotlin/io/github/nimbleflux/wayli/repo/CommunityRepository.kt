package io.github.nimbleflux.wayli.repo

import io.github.nimbleflux.fluxbase.FluxbaseClient
import io.github.nimbleflux.fluxbase.from
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** A published journal entry on a visible trip (the `public_trip_entries` view). */
@Serializable
data class CommunityStory(
    val id: String,
    @SerialName("trip_id") val tripId: String,
    val title: String? = null,
    val body: String? = null,
    @SerialName("entry_date") val entryDate: String? = null,
    @SerialName("trip_title") val tripTitle: String? = null,
    @SerialName("trip_description") val tripDescription: String? = null,
    @SerialName("trip_image_url") val tripImageUrl: String? = null,
    @SerialName("trip_owner_id") val tripOwnerId: String? = null,
)

/** Author profile (the `public_profiles` view — users who opted out are absent). */
@Serializable
data class CommunityAuthor(
    val id: String,
    val username: String? = null,
    @SerialName("full_name") val fullName: String? = null,
    @SerialName("avatar_url") val avatarUrl: String? = null,
)

/**
 * Community-hub reads — other users' published stories, mirroring the web's
 * /stories feed. Everything rides on RLS views, so the server already scopes
 * what a signed-in user may see (public + shared trips, published entries
 * only, profiles of users who haven't opted out of discovery).
 */
@Singleton
class CommunityRepository @Inject constructor(
    private val client: FluxbaseClient,
    private val cache: CacheStore,
) {

    /**
     * Whether the server's community hub is enabled (`wayli.community_enabled`
     * setting, readable anonymously). False on any fetch/parse failure — a
     * disabled or unreachable hub simply hides the Community section.
     */
    suspend fun communityEnabled(): Boolean = runCatching {
        val res = client.settings.getMany(listOf(COMMUNITY_SETTING))
        if (res.error != null) return@runCatching false
        val element = res.data ?: return@runCatching false
        val rows = when (element) {
            is JsonArray -> element
            is JsonObject -> element["result"] as? JsonArray ?: element["rows"] as? JsonArray ?: return@runCatching false
            else -> return@runCatching false
        }
        rows.any { row ->
            val obj = row as? JsonObject ?: return@any false
            val key = (obj["key"] as? JsonPrimitive)?.content
                ?: (obj["name"] as? JsonPrimitive)?.content
            if (key != COMMUNITY_SETTING) return@any false
            // Values may arrive as a boolean or a string primitive.
            (obj["value"] as? JsonPrimitive)?.content == "true"
        }
    }.getOrDefault(false)

    /**
     * One page of the stories feed, newest first. Authors are resolved in a
     * second small query against `public_profiles`.
     */
    suspend fun stories(offset: Int = 0, limit: Int = 24): Result<Pair<List<CommunityStory>, List<CommunityAuthor>>> =
        runCatching {
            val result = client.from<CommunityStory>("public_trip_entries")
                .select()
                .order("entry_date", ascending = false)
                .limit(limit)
                .offset(offset)
                .execute()
            val stories = result.data ?: emptyList()
            val authors = authorsFor(stories.mapNotNull { it.tripOwnerId }.distinct())
            stories to authors
        }

    private suspend fun authorsFor(ownerIds: List<String>): List<CommunityAuthor> {
        if (ownerIds.isEmpty()) return emptyList()
        return runCatching {
            val result = client.from<CommunityAuthor>("public_profiles")
                .select()
                .`in`("id", ownerIds)
                .limit(ownerIds.size)
                .execute()
            result.data ?: emptyList()
        }.getOrDefault(emptyList())
    }

    companion object {
        private const val COMMUNITY_SETTING = "wayli.community_enabled"
    }
}
