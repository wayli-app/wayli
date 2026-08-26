package io.github.nimbleflux.wayli.repo

import io.ktor.client.HttpClient
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.parameter
import io.ktor.client.statement.bodyAsText
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/** A geocoded place hit shown in the add-place search. */
@Serializable
data class PlaceSuggestion(
    val name: String,
    /** Secondary line — locality/region and country. */
    val secondary: String? = null,
    val lat: Double,
    val lng: Double,
    val country: String? = null,
)

@Serializable
private data class PeliasResponse(val features: List<PeliasFeature> = emptyList())

@Serializable
private data class PeliasFeature(
    val geometry: PeliasGeometry? = null,
    val properties: PeliasProperties? = null,
)

@Serializable
private data class PeliasGeometry(val coordinates: List<Double> = emptyList())

@Serializable
private data class PeliasProperties(
    val name: String? = null,
    val label: String? = null,
    val country: String? = null,
    val region: String? = null,
    val county: String? = null,
    val locality: String? = null,
    val neighbourhood: String? = null,
)

/**
 * Place search + reverse geocoding against the project's Pelias service —
 * the same provider the web app uses (`https://pelias.wayli.app` is its
 * public fallback; instance-specific endpoints are configured server-side).
 */
@Singleton
class GeocodingService @Inject constructor() {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    private val client = HttpClient {
        install(HttpTimeout) { requestTimeoutMillis = 8000 }
    }

    /** Autocomplete search (≥3 chars) returning up to [size] hits. */
    suspend fun autocomplete(query: String, size: Int = 5): Result<List<PlaceSuggestion>> = runCatching {
        val body = client.get("$ENDPOINT/v1/autocomplete") {
            parameter("text", query.trim())
            parameter("size", size)
            header("X-Client-App", "WayliApp/1.0")
        }.bodyAsText()
        parse(body)
    }

    /** Reverse-geocode a coordinate; null when nothing is nearby. */
    suspend fun reverse(lat: Double, lng: Double): Result<PlaceSuggestion?> = runCatching {
        val body = client.get("$ENDPOINT/v1/reverse") {
            parameter("point.lat", lat)
            parameter("point.lon", lng)
            parameter("size", 1)
            header("X-Client-App", "WayliApp/1.0")
        }.bodyAsText()
        parse(body).firstOrNull()
    }

    /** Parse a Pelias feature collection — internal for unit tests. */
    internal fun parse(body: String): List<PlaceSuggestion> {
        val response = json.decodeFromString(PeliasResponse.serializer(), body)
        return response.features.mapNotNull { feature ->
            val coords = feature.geometry?.coordinates ?: return@mapNotNull null
            if (coords.size < 2) return@mapNotNull null
            val props = feature.properties
            val label = props?.label
            val name = props?.name?.takeIf { it.isNotBlank() }
                ?: label?.substringBefore(",")?.trim().orEmpty()
            if (name.isEmpty()) return@mapNotNull null
            PlaceSuggestion(
                name = name,
                secondary = secondaryOf(props, label),
                lng = coords[0],
                lat = coords[1],
                country = props?.country,
            )
        }
    }

    private fun secondaryOf(props: PeliasProperties?, label: String?): String? =
        listOfNotNull(props?.locality, props?.region, props?.country)
            .distinct()
            .joinToString(", ")
            .takeIf { it.isNotBlank() }
            ?: label?.substringAfter(",")?.trim()?.takeIf { it.isNotBlank() }

    private companion object {
        const val ENDPOINT = "https://pelias.wayli.app"
    }
}
