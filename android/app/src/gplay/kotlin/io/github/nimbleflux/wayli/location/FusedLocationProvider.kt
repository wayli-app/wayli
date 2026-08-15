package io.github.nimbleflux.wayli.location

import android.annotation.SuppressLint
import android.content.Context
import android.os.Looper
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import dagger.hilt.android.qualifiers.ApplicationContext
import io.github.nimbleflux.wayli.gps.AccuracyProfile
import io.github.nimbleflux.wayli.gps.CapturedPoint
import io.github.nimbleflux.wayli.gps.LocationProvider
import io.github.nimbleflux.wayli.gps.TrackingConfig
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow

/**
 * Google Play Services location provider (gplay flavor). Uses
 * FusedLocationProviderClient with interval/distance/accuracy mapped from
 * [TrackingConfig].
 */
@Singleton
class FusedLocationProvider @Inject constructor(
    @ApplicationContext private val context: Context,
) : LocationProvider {

    private val client = LocationServices.getFusedLocationProviderClient(context)
    private var callback: LocationCallback? = null

    override val requiresGooglePlayServices: Boolean = true

    @SuppressLint("MissingPermission") // caller checks permission before starting
    override fun startUpdates(config: TrackingConfig): Flow<CapturedPoint> = callbackFlow {
        val request = LocationRequest.Builder(
            when (config.accuracy) {
                AccuracyProfile.HIGH -> Priority.PRIORITY_HIGH_ACCURACY
                AccuracyProfile.BALANCED -> Priority.PRIORITY_BALANCED_POWER_ACCURACY
                AccuracyProfile.LOW -> Priority.PRIORITY_LOW_POWER
                AccuracyProfile.POWER -> Priority.PRIORITY_PASSIVE
            },
            config.minIntervalSec * 1000L,
        )
            .setMinUpdateDistanceMeters(config.minDistanceM)
            .setMaxUpdateDelayMillis(config.minIntervalSec * 1000L * 2)
            .build()

        val cb = object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                result.locations.forEach { location ->
                    trySend(
                        CapturedPoint(
                            lat = location.latitude,
                            lon = location.longitude,
                            timestamp = location.time / 1000L,
                            altitude = if (location.hasAltitude()) location.altitude else null,
                            accuracy = if (location.hasAccuracy()) location.accuracy else null,
                            speed = if (location.hasSpeed() && location.speed > 0f) location.speed else null,
                            heading = if (location.hasBearing()) location.bearing else null,
                            deviceId = config.deviceId,
                        ),
                    )
                }
            }
        }
        callback = cb
        client.requestLocationUpdates(request, cb, Looper.getMainLooper())

        awaitClose {
            client.removeLocationUpdates(cb)
            callback = null
        }
    }

    override fun stopUpdates() {
        callback?.let { client.removeLocationUpdates(it) }
        callback = null
    }
}
