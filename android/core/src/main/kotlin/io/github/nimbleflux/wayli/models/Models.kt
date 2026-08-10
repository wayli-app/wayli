package io.github.nimbleflux.wayli.models

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

// ---- Sync state ----

/**
 * Sync state for offline-first entities. Entities start as PENDING when created
 * locally, transition to SYNCING when a WorkManager worker picks them up, then
 * SYNCED on success or FAILED on error.
 */
enum class SyncState { PENDING, SYNCING, SYNCED, FAILED }

// ---- Core entities (mirror Wayli DB schema) ----

@Serializable
data class Trip(
    val id: String,
    @SerialName("user_id") val userId: String,
    val title: String,
    val description: String? = null,
    @SerialName("start_date") val startDate: String,
    @SerialName("end_date") val endDate: String? = null,
    val status: String = "completed",
    val visibility: String = "private",
    val labels: List<String>? = null,
    @SerialName("image_url") val imageUrl: String? = null,
    val metadata: JsonElement? = null,
    @SerialName("created_at") val createdAt: String = "",
    @SerialName("updated_at") val updatedAt: String = "",
)

@Serializable
data class TripEntry(
    val id: String,
    @SerialName("trip_id") val tripId: String,
    @SerialName("entry_date") val entryDate: String,
    val body: String? = null,
    val title: String? = null,
    @SerialName("cover_media_id") val coverMediaId: String? = null,
    val status: String = "published",
    @SerialName("created_at") val createdAt: String = "",
    @SerialName("updated_at") val updatedAt: String = "",
)

@Serializable
data class TripMedia(
    val id: String,
    @SerialName("trip_id") val tripId: String,
    @SerialName("entry_id") val entryId: String? = null,
    @SerialName("storage_path") val storagePath: String = "",
    @SerialName("thumbnail_path") val thumbnailPath: String? = null,
    @SerialName("media_type") val mediaType: String = "image",
    val width: Int? = null,
    val height: Int? = null,
    @SerialName("taken_at") val takenAt: String? = null,
)

@Serializable
data class TrackerPoint(
    @SerialName("user_id") val userId: String,
    @SerialName("recorded_at") val recordedAt: String,
    val location: String, // PostGIS POINT(lon lat) — serialized as "SRID=4326;POINT(lon lat)" or GeoJSON
    @SerialName("country_code") val countryCode: String? = null,
    val altitude: Double? = null,
    val accuracy: Double? = null,
    val speed: Double? = null,
    val distance: Double? = null,
    @SerialName("time_spent") val timeSpent: Double? = null,
    val heading: Double? = null,
    @SerialName("battery_level") val batteryLevel: Int? = null,
    @SerialName("is_charging") val isCharging: Boolean? = null,
    @SerialName("activity_type") val activityType: String? = null,
    @SerialName("transport_mode") val transportMode: String? = null,
    @SerialName("transport_mode_confidence") val transportModeConfidence: Double? = null,
    @SerialName("device_id") val deviceId: String? = null,
)

@Serializable
data class UserProfile(
    val id: String,
    @SerialName("first_name") val firstName: String? = null,
    @SerialName("last_name") val lastName: String? = null,
    @SerialName("full_name") val fullName: String? = null,
    val username: String? = null,
    val role: String = "user",
    @SerialName("avatar_url") val avatarUrl: String? = null,
    @SerialName("home_address") val homeAddress: JsonElement? = null,
    val discoverable: String = "nobody",
)

@Serializable
data class WantToVisit(
    val id: String,
    @SerialName("user_id") val userId: String,
    val title: String,
    val location: String, // PostGIS POINT
    val address: String? = null,
    @SerialName("country_code") val countryCode: String? = null,
    @SerialName("marker_type") val markerType: String = "default",
    @SerialName("marker_color") val markerColor: String = "#3B82F6",
    val labels: List<String>? = null,
    val rating: Int? = null,
    val favorite: Boolean = false,
    @SerialName("image_url") val imageUrl: String? = null,
)

@Serializable
data class Notification(
    val id: String,
    @SerialName("user_id") val userId: String,
    val type: String,
    val title: String,
    val body: String? = null,
    val icon: String? = null,
    val link: String? = null,
    @SerialName("read_at") val readAt: String? = null,
    @SerialName("created_at") val createdAt: String = "",
)
