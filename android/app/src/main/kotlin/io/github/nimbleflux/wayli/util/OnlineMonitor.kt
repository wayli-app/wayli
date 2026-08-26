package io.github.nimbleflux.wayli.util

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Live connectivity state (ConnectivityManager default-network callback) —
 * drives the offline banner while repositories serve cached data.
 */
@Singleton
class OnlineMonitor @Inject constructor(
    @ApplicationContext context: Context,
) {

    private val _online = MutableStateFlow(true)
    val online: StateFlow<Boolean> = _online.asStateFlow()

    init {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
        if (cm == null) {
            _online.value = false
        } else {
            fun refresh() {
                val caps = cm.getNetworkCapabilities(cm.activeNetwork)
                _online.value = caps?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true
            }

            refresh()
            runCatching {
                cm.registerDefaultNetworkCallback(object : ConnectivityManager.NetworkCallback() {
                    override fun onAvailable(network: Network) {
                        _online.value = true
                    }

                    override fun onLost(network: Network) {
                        refresh()
                    }

                    override fun onCapabilitiesChanged(network: Network, networkCapabilities: NetworkCapabilities) {
                        _online.value =
                            networkCapabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                    }
                })
            }.onFailure { refresh() }
        }
    }
}
