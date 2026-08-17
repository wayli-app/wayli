package io.github.nimbleflux.wayli.demo

import kotlinx.serialization.json.JsonPrimitive
import io.github.nimbleflux.wayli.designsystem.map.MapPoint
import io.github.nimbleflux.wayli.models.Notification
import io.github.nimbleflux.wayli.models.Trip
import io.github.nimbleflux.wayli.models.TripEntry
import io.github.nimbleflux.wayli.models.UserProfile
import io.github.nimbleflux.wayli.models.WantToVisit

/**
 * Demo mode for app store reviewers. When enabled, the app shows realistic
 * fake data without needing a live Wayli instance. The reviewer can browse
 * trips, journal entries, stats, wishlist, and settings — everything works
 * offline with pre-populated data.
 *
 * Enable demo mode from the instance setup screen by tapping "Try Demo" or
 * entering "demo" as the instance URL.
 */
object DemoData {

    val profile = UserProfile(
        id = "demo-user",
        firstName = "Alex",
        lastName = "Traveler",
        fullName = "Alex Traveler",
        username = "alex",
        role = "user",
        avatarUrl = null,
        discoverable = "everyone",
    )

    val trips = listOf(
        Trip(
            id = "demo-trip-1",
            userId = "demo-user",
            title = "Japanese Alps Adventure",
            description = "Two weeks exploring Tokyo, Hakuba, and the Japanese Alps. Incredible food, stunning mountain scenery, and some of the best powder snow I've ever skied.",
            startDate = "2024-02-10",
            endDate = "2024-02-24",
            status = "completed",
            visibility = "public",
            labels = listOf("skiing", "japan", "mountains"),
            imageUrl = "https://images.unsplash.com/photo-1542640244-7e672d6cef4e?w=800&h=500&fit=crop",
            createdAt = "2024-02-10T08:00:00Z",
            updatedAt = "2024-02-24T20:00:00Z",
        ),
        Trip(
            id = "demo-trip-2",
            userId = "demo-user",
            title = "Portuguese Coast Road Trip",
            description = "Drove from Lisbon to the Algarve along the Atlantic coast. Beautiful beaches, amazing seafood, and perfect weather.",
            startDate = "2024-05-15",
            endDate = "2024-05-22",
            status = "completed",
            visibility = "public",
            labels = listOf("road-trip", "beaches", "portugal"),
            imageUrl = "https://images.unsplash.com/photo-1555881400-74d7acaacd8b?w=800&h=500&fit=crop",
            createdAt = "2024-05-14T18:00:00Z",
            updatedAt = "2024-05-22T16:00:00Z",
        ),
        Trip(
            id = "demo-trip-3",
            userId = "demo-user",
            title = "Weekend in Amsterdam",
            description = "Quick weekend trip to visit museums, cycle along the canals, and try some local food.",
            startDate = "2024-09-20",
            endDate = "2024-09-22",
            status = "completed",
            visibility = "private",
            labels = listOf("city", "cycling", "museums"),
            imageUrl = "https://images.unsplash.com/photo-1534351590666-13e3e96c5017?w=800&h=500&fit=crop",
            createdAt = "2024-09-19T12:00:00Z",
            updatedAt = "2024-09-22T22:00:00Z",
        ),
        Trip(
            id = "demo-trip-4",
            userId = "demo-user",
            title = "Southeast Asia Backpacking",
            description = "Currently planning a 6-week backpacking trip through Thailand, Vietnam, and Cambodia for next spring.",
            startDate = "2025-03-01",
            endDate = null,
            status = "planned",
            visibility = "public",
            labels = listOf("backpacking", "asia", "planning"),
            imageUrl = "https://images.unsplash.com/photo-1528127269322-539801943592?w=800&h=500&fit=crop",
            createdAt = "2024-11-01T10:00:00Z",
            updatedAt = "2024-12-15T14:00:00Z",
        ),
    )

    val entries = mapOf(
        "demo-trip-1" to listOf(
            TripEntry(
                id = "entry-1",
                tripId = "demo-trip-1",
                entryDate = "2024-02-10",
                title = "Arrival in Tokyo",
                body = "Landed at Narita after a 12-hour flight. The city is enormous and incredibly clean. First stop: ramen in Shibuya. The neon lights at night are absolutely breathtaking — photos don't do it justice.",
                status = "published",
                createdAt = "2024-02-10T20:00:00Z",
            ),
            TripEntry(
                id = "entry-2",
                tripId = "demo-trip-1",
                entryDate = "2024-02-13",
                title = "First Day Skiing in Hakuba",
                body = "Took the bullet train to Hakuba this morning. The snow quality is unbelievable — light, dry powder that makes you feel weightless. Skied the Happo-One resort all day. The views of the Japanese Alps from the top of the lift are something I'll never forget.",
                status = "published",
                createdAt = "2024-02-13T18:00:00Z",
            ),
            TripEntry(
                id = "entry-3",
                tripId = "demo-trip-1",
                entryDate = "2024-02-20",
                title = "Onsen and Recovery",
                body = "After a week of hard skiing, today was a rest day. Spent the afternoon at a traditional onsen in the mountains. Soaking in the hot mineral water surrounded by snow was the perfect recovery. Followed it with an incredible kaiseki dinner.",
                status = "published",
                createdAt = "2024-02-20T21:00:00Z",
            ),
        ),
        "demo-trip-2" to listOf(
            TripEntry(
                id = "entry-4",
                tripId = "demo-trip-2",
                entryDate = "2024-05-15",
                title = "Lisbon to Cascais",
                body = "Picked up the rental car and drove along the coast to Cascais. Stopped at Cabo da Roca, the westernmost point of mainland Europe. The cliffs are dramatic and the Atlantic is deep blue. Had grilled fish for dinner at a tiny local restaurant.",
                status = "published",
                createdAt = "2024-05-15T19:00:00Z",
            ),
            TripEntry(
                id = "entry-5",
                tripId = "demo-trip-2",
                entryDate = "2024-05-18",
                title = "Algarve Sea Caves",
                body = "Took a boat tour to the famous Benagil Sea Cave. The natural skylight inside the cave is stunning. Spent the afternoon at Praia da Marinha — one of the most beautiful beaches I've ever seen. The water was freezing but refreshing.",
                status = "published",
                createdAt = "2024-05-18T17:00:00Z",
            ),
        ),
    )

    val wishlist = listOf(
        WantToVisit(
            id = "wish-1",
            userId = "demo-user",
            title = "Patagonia, Argentina",
            location = JsonPrimitive("POINT(-72.8 -50.3)"),
            address = "Patagonia, Argentina",
            countryCode = "AR",
            markerType = "mountain",
            markerColor = "#3B82F6",
            rating = 5,
            favorite = true,
            imageUrl = "https://images.unsplash.com/photo-1531176175280-33e81d6a5d56?w=600&h=400&fit=crop",
        ),
        WantToVisit(
            id = "wish-2",
            userId = "demo-user",
            title = "Marrakech, Morocco",
            location = JsonPrimitive("POINT(-8.0 31.6)"),
            address = "Marrakech, Morocco",
            countryCode = "MA",
            markerType = "building",
            markerColor = "#EA580C",
            rating = 4,
            imageUrl = "https://images.unsplash.com/photo-1597211833712-5e41faa202ea?w=600&h=400&fit=crop",
        ),
        WantToVisit(
            id = "wish-3",
            userId = "demo-user",
            title = "Northern Lights, Iceland",
            location = JsonPrimitive("POINT(-19.0 64.9)"),
            address = "Iceland",
            countryCode = "IS",
            markerType = "tree",
            markerColor = "#10B981",
            rating = 5,
            favorite = true,
            imageUrl = "https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=600&h=400&fit=crop",
        ),
        WantToVisit(
            id = "wish-4",
            userId = "demo-user",
            title = "Kyoto Temples, Japan",
            location = JsonPrimitive("POINT(135.8 35.0)"),
            address = "Kyoto, Japan",
            countryCode = "JP",
            markerType = "building",
            markerColor = "#8B5CF6",
            rating = 5,
            imageUrl = "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=600&h=400&fit=crop",
        ),
        WantToVisit(
            id = "wish-5",
            userId = "demo-user",
            title = "Santorini, Greece",
            location = JsonPrimitive("POINT(25.5 36.4)"),
            address = "Santorini, Greece",
            countryCode = "GR",
            markerType = "home",
            markerColor = "#06B6D4",
            rating = 4,
            imageUrl = "https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?w=600&h=400&fit=crop",
        ),
    )

    /** Hero photos per demo entry (entryId → URL) — used by the trip journal overview. */
    val entryHeroes = mapOf(
        "entry-1" to "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=800&h=450&fit=crop", // Tokyo night
        "entry-2" to "https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=800&h=450&fit=crop",   // ski slopes
        "entry-3" to "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?w=800&h=450&fit=crop", // onsen
        "entry-4" to "https://images.unsplash.com/photo-1555881400-74d7acaacd8b?w=800&h=450&fit=crop",    // coast road
        "entry-5" to "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&h=450&fit=crop", // sea cave beach
    )

    val notifications = listOf(
        Notification(
            id = "notif-1",
            userId = "demo-user",
            type = "trip_detected",
            title = "New trip detected",
            body = "We noticed a trip to Amsterdam. Review and add details?",
            icon = "travel_explore",
            createdAt = "2024-09-23T10:00:00Z",
        ),
        Notification(
            id = "notif-2",
            userId = "demo-user",
            type = "friend_request",
            title = "New friend request",
            body = "Sarah wants to connect with you.",
            icon = "person",
            createdAt = "2024-11-15T14:00:00Z",
        ),
        Notification(
            id = "notif-3",
            userId = "demo-user",
            type = "comment",
            title = "New comment on your trip",
            body = "Mike commented on 'Portuguese Coast Road Trip'",
            icon = "comment",
            createdAt = "2024-05-25T09:00:00Z",
            readAt = "2024-05-25T12:00:00Z",
        ),
    )

    // Stats summary
    val totalDistanceKm = 15_847
    val countriesVisited = 23
    val timeMovingHours = 482
    val dataPoints = 89_341
    val totalSteps = 1_204_553

    /**
     * Synthesized daily distance (km) for the last ~12 weeks, keyed by ISO date.
     * Drives the activity heatmap on Statistics in demo mode. Deterministic for a
     * given day so the heatmap looks stable.
     */
    val dailyActivity: Map<String, Double> by lazy {
        val today = java.time.LocalDate.now()
        val out = LinkedHashMap<String, Double>()
        for (i in 83 downTo 0) {
            val day = today.minusDays(i.toLong())
            val seed = day.toEpochDay()
            val r = ((seed * 1103515245L + 12345L) and 0x7fffffffL).toDouble() / 2147483647.0
            val km = when {
                r < 0.25 -> 0.0
                day.dayOfWeek.value >= 6 -> 12.0 + r * 20.0
                else -> 3.0 + r * 14.0
            }
            out[day.toString()] = (km * 10).toLong().toDouble() / 10.0
        }
        out
    }

    val transportModeBreakdown = mapOf(
        "car" to 0.42,
        "walking" to 0.24,
        "train" to 0.16,
        "cycling" to 0.10,
        "airplane" to 0.08,
    )

    val countriesList = listOf(
        "Japan", "Portugal", "Netherlands", "France", "Germany", "Spain",
        "Italy", "United Kingdom", "United States", "Canada", "Mexico",
        "Brazil", "Argentina", "Thailand", "Vietnam", "Cambodia", "Australia",
        "New Zealand", "Iceland", "Morocco", "Greece", "Turkey", "Norway",
    )

    // ---- Map data for the Home dashboard and Trip detail ----

    /** Recent points shown on the Home map (around the demo home base in NL). */
    val homePoints: List<MapPoint> = listOf(
        MapPoint(lat = 52.3676, lng = 4.9041, title = "Amsterdam", color = "#233869"),
        MapPoint(lat = 52.0907, lng = 5.1214, title = "Utrecht", color = "#3b82f6"),
        MapPoint(lat = 51.9244, lng = 4.4777, title = "Rotterdam", color = "#10B981"),
        MapPoint(lat = 52.5122, lng = 6.0959, title = "Hengelo", color = "#8B5CF6"),
        MapPoint(lat = 50.8514, lng = 5.6905, title = "Maastricht", color = "#EA580C"),
    )

    /**
     * Recent activity track on the Home map, as (lat, lng) pairs — kept free of
     * MapLibre types so [DemoData] doesn't depend on the map SDK.
     */
    val homeTrack: List<Pair<Double, Double>> = listOf(
        52.3676 to 4.9041, // Amsterdam
        52.0907 to 5.1214, // Utrecht
        51.9244 to 4.4777, // Rotterdam
        51.5719 to 4.7683, // Breda
        52.5122 to 6.0959, // Hengelo
        53.2012 to 5.7999, // Leeuwarden
        52.3676 to 4.9041, // back to Amsterdam
    )

    /** Representative (lat, lng) tracks for trips, so Trip detail's map is meaningful. */
    val tripTracks: Map<String, List<Pair<Double, Double>>> = mapOf(
        "demo-trip-1" to listOf( // Japanese Alps Adventure
            35.6762 to 139.6503, // Tokyo
            36.06 to 137.85, // Hakuba
            36.56 to 136.65, // Kanazawa
            35.6762 to 139.6503, // Tokyo
        ),
        "demo-trip-2" to listOf( // Portuguese Coast Road Trip
            38.7167 to -9.1393, // Lisbon
            38.6979 to -9.4215, // Cascais
            38.78 to -9.50, // Cabo da Roca
            37.02 to -8.0, // Algarve
        ),
        "demo-trip-3" to listOf( // Weekend in Amsterdam
            52.3676 to 4.9041,
            52.37 to 4.89,
        ),
    )

    /** Map center (lat, lng) per trip id. */
    val tripCenters: Map<String, Pair<Double, Double>> = mapOf(
        "demo-trip-1" to (36.2 to 138.0),
        "demo-trip-2" to (38.2 to -8.8),
        "demo-trip-3" to (52.37 to 4.90),
        "demo-trip-4" to (13.0 to 105.0),
    )
}
