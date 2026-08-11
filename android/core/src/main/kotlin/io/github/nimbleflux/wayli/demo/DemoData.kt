package io.github.nimbleflux.wayli.demo

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

    val isDemo = false // Set to true by DemoManager when demo mode is active

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
            location = "POINT(-72.8 -50.3)",
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
            location = "POINT(-8.0 31.6)",
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
            location = "POINT(-19.0 64.9)",
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
            location = "POINT(135.8 35.0)",
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
            location = "POINT(25.5 36.4)",
            address = "Santorini, Greece",
            countryCode = "GR",
            markerType = "home",
            markerColor = "#06B6D4",
            rating = 4,
            imageUrl = "https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?w=600&h=400&fit=crop",
        ),
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
}
