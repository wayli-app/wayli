package io.github.nimbleflux.wayli.location

import android.annotation.SuppressLint
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import androidx.core.content.ContextCompat
import com.google.android.gms.location.ActivityRecognition
import com.google.android.gms.location.ActivityRecognitionResult
import com.google.android.gms.location.DetectedActivity
import dagger.hilt.android.qualifiers.ApplicationContext
import io.github.nimbleflux.wayli.gps.ActivityKind
import io.github.nimbleflux.wayli.gps.ActivityStateHolder
import io.github.nimbleflux.wayli.gps.ActivityRecognitionDriver
import javax.inject.Inject
import javax.inject.Singleton

/**
 * gplay activity-recognition driver: feeds [ActivityStateHolder] from Play
 * Services `requestActivityUpdates`. The receiver is registered at runtime
 * (while tracking runs) so no manifest entry is needed.
 */
@Singleton
class GmsActivityRecognitionDriver @Inject constructor(
    @ApplicationContext private val context: Context,
    private val holder: ActivityStateHolder,
) : ActivityRecognitionDriver {

    private var receiver: BroadcastReceiver? = null
    private var pendingIntent: PendingIntent? = null

    @SuppressLint("MissingPermission") // caller checks ACTIVITY_RECOGNITION before starting
    override fun start() {
        if (receiver != null) return // already running

        // Package-scoped: U+ rejects PendingIntents with implicit intents.
        val intent = Intent(ACTION).setPackage(context.packageName)
        val pi = PendingIntent.getBroadcast(
            context,
            REQUEST_CODE,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
        )

        val br = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context, received: Intent) {
                if (ActivityRecognitionResult.hasResult(received)) {
                    ActivityRecognitionResult.extractResult(received)
                        ?.mostProbableActivity
                        ?.let { holder.update(it.toKind()) }
                }
            }
        }
        ContextCompat.registerReceiver(context, br, IntentFilter(ACTION), ContextCompat.RECEIVER_NOT_EXPORTED)
        receiver = br
        pendingIntent = pi

        ActivityRecognition.getClient(context).requestActivityUpdates(DETECTION_INTERVAL_MS, pi)
    }

    override fun stop() {
        pendingIntent?.let {
            ActivityRecognition.getClient(context).removeActivityUpdates(it)
        }
        receiver?.let { runCatching { context.unregisterReceiver(it) } }
        receiver = null
        pendingIntent = null
        holder.update(ActivityKind.UNKNOWN)
    }

    private fun DetectedActivity.toKind(): ActivityKind = when (type) {
        DetectedActivity.STILL -> ActivityKind.STILL
        DetectedActivity.WALKING, DetectedActivity.RUNNING, DetectedActivity.ON_FOOT -> ActivityKind.ON_FOOT
        DetectedActivity.IN_VEHICLE -> ActivityKind.IN_VEHICLE
        DetectedActivity.ON_BICYCLE -> ActivityKind.ON_BIKE
        else -> ActivityKind.UNKNOWN
    }

    companion object {
        private const val ACTION = "io.github.nimbleflux.wayli.ACTIVITY_UPDATE"
        private const val REQUEST_CODE = 4201
        private const val DETECTION_INTERVAL_MS = 15_000L
    }
}
