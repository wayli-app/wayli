package io.github.nimbleflux.wayli.gps

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat

/**
 * Handles the tracking notification's quick-toggle actions (Pause / Resume /
 * Stop) so tracking can be controlled straight from the notification drawer.
 *
 * While a session is active the foreground notification carries Pause/Stop;
 * pausing stops the service but keeps a low-priority "Tracking paused"
 * notification with Resume/Stop — OwnTracks-style — so the toggle stays one
 * tap away. Fully stopping clears every notification.
 */
class TrackingActionReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val store = TrackingConfigStore(context)
        when (intent.action) {
            ACTION_PAUSE -> {
                store.isTracking = false
                TrackingService.stop(context)
                postPausedNotification(context)
            }
            ACTION_RESUME -> {
                store.isTracking = true
                cancelPausedNotification(context)
                TrackingService.start(context)
            }
            ACTION_STOP -> {
                store.isTracking = false
                TrackingService.stop(context)
                cancelPausedNotification(context)
            }
        }
    }

    companion object {
        const val ACTION_PAUSE = "io.github.nimbleflux.wayli.gps.action.PAUSE"
        const val ACTION_RESUME = "io.github.nimbleflux.wayli.gps.action.RESUME"
        const val ACTION_STOP = "io.github.nimbleflux.wayli.gps.action.STOP"
        const val PAUSED_NOTIFICATION_ID = 2
        private const val CHANNEL_ID = "wayli-tracking"

        /** Broadcast PendingIntent for one of the toggle actions. */
        fun pendingIntent(context: Context, action: String): PendingIntent =
            PendingIntent.getBroadcast(
                context,
                action.hashCode(),
                Intent(context, TrackingActionReceiver::class.java).setAction(action),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )

        /**
         * "Tracking paused" notification with Resume/Stop. Posted when the
         * service is stopped but the session is only paused, not ended.
         */
        fun postPausedNotification(context: Context) {
            if (Build.VERSION.SDK_INT >= 33 &&
                ContextCompat.checkSelfPermission(context, android.Manifest.permission.POST_NOTIFICATIONS) !=
                PackageManager.PERMISSION_GRANTED
            ) {
                return // No drawer surface without the permission — nothing to do.
            }
            val manager = context.getSystemService(NotificationManager::class.java) ?: return
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                // Channels persist once created, but create defensively in case
                // the service never ran in this process.
                manager.createNotificationChannel(
                    NotificationChannel(CHANNEL_ID, "Wayli Tracking", NotificationManager.IMPORTANCE_LOW).apply {
                        description = "Location tracking is active"
                        setShowBadge(false)
                    },
                )
            }
            val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
            val contentIntent = launchIntent?.let {
                PendingIntent.getActivity(
                    context,
                    0,
                    it,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                )
            }
            val notification = NotificationCompat.Builder(context, CHANNEL_ID)
                .setContentTitle("Wayli")
                .setContentText("Tracking paused")
                .setSmallIcon(android.R.drawable.ic_menu_mylocation)
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setContentIntent(contentIntent)
                .addAction(0, "Resume", pendingIntent(context, ACTION_RESUME))
                .addAction(0, "Stop", pendingIntent(context, ACTION_STOP))
                .build()
            manager.notify(PAUSED_NOTIFICATION_ID, notification)
        }

        fun cancelPausedNotification(context: Context) {
            context.getSystemService(NotificationManager::class.java)?.cancel(PAUSED_NOTIFICATION_ID)
        }
    }
}
