package io.github.nimbleflux.wayli.tracking

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import io.github.nimbleflux.wayli.gps.TrackingConfigStore
import io.github.nimbleflux.wayli.gps.TrackingActionReceiver
import io.github.nimbleflux.wayli.gps.TrackingService

/**
 * Restarts tracking after a reboot when the user enabled "Start on boot"
 * and tracking was active when the device shut down. When tracking isn't
 * being restarted, the persistent status notification (tracking toggle) is
 * re-posted instead.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        val store = TrackingConfigStore(context)
        if (store.get().startOnBoot && store.isTracking) {
            TrackingService.start(context)
        } else {
            TrackingActionReceiver.syncNotifications(context)
        }
    }
}
