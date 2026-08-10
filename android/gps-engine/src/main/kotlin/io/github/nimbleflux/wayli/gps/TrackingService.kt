package io.github.nimbleflux.wayli.gps

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch

/**
 * Foreground service that continuously captures GPS points and queues them
 * for upload. Runs with a persistent notification (required by Android for
 * background location). The service survives Doze and background restrictions.
 *
 * This is the core of the OwnTracks replacement: start this service, and the
 * phone becomes a tracking device that uploads points to Wayli.
 *
 * Usage:
 * ```
 * val intent = Intent(context, TrackingService::class.java)
 * ContextCompat.startForegroundService(context, intent) // start
 * context.stopService(intent) // stop
 * ```
 */
class TrackingService : Service() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var trackingJob: Job? = null
    private lateinit var configStore: TrackingConfigStore

    override fun onCreate() {
        super.onCreate()
        configStore = TrackingConfigStore(this)
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(NOTIFICATION_ID, buildNotification("Wayli tracking active"))
        configStore.isTracking = true

        // The location provider is injected via Hilt in the :app module.
        // For now, this service reads the config and the provider is started
        // by the app's DI graph. B3 completion will wire the provider here.
        // The actual location collection + queueing happens via WorkManager
        // (GpsUploadWorker) which drains the local tracker_data queue.

        return START_STICKY // Restart if killed (for startOnBoot)
    }

    override fun onDestroy() {
        configStore.isTracking = false
        trackingJob?.cancel()
        scope.cancel()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Wayli Tracking",
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                description = "Location tracking is active"
                setShowBadge(false)
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(text: String): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Wayli")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    companion object {
        private const val CHANNEL_ID = "wayli-tracking"
        private const val NOTIFICATION_ID = 1

        fun start(context: Context) {
            val intent = Intent(context, TrackingService::class.java)
            androidx.core.content.ContextCompat.startForegroundService(context, intent)
        }

        fun stop(context: Context) {
            val intent = Intent(context, TrackingService::class.java)
            context.stopService(intent)
        }
    }
}
