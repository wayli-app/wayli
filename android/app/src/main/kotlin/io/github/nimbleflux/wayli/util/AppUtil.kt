package io.github.nimbleflux.wayli.util

import android.content.Context
import android.content.Intent
import android.os.Process

/**
 * Restarts the app process. Used after the Wayli instance configuration
 * changes (set or cleared) so the process-wide [FluxbaseClient] singleton is
 * rebuilt with the new URL/key — without this, the existing client would keep
 * pointing at the previous (or no) instance.
 */
fun restartApp(context: Context) {
    val intent = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: run {
        Process.killProcess(Process.myPid())
        return
    }
    intent.addFlags(
        Intent.FLAG_ACTIVITY_CLEAR_TOP or
            Intent.FLAG_ACTIVITY_CLEAR_TASK or
            Intent.FLAG_ACTIVITY_NEW_TASK,
    )
    context.startActivity(intent)
    Process.killProcess(Process.myPid())
}
