package io.github.nimbleflux.wayli.di

import android.content.Context
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import io.github.nimbleflux.fluxbase.FluxbaseClient
import io.github.nimbleflux.fluxbase.FluxbaseClientOptions
import io.github.nimbleflux.wayli.session.EncryptedStorageAdapter
import io.github.nimbleflux.wayli.session.InstanceManager
import javax.inject.Singleton

/**
 * Hilt DI module providing the [FluxbaseClient] and related singletons.
 *
 * The client is configured with the instance URL + anon key stored by
 * [InstanceManager] (set during onboarding). If no instance is configured yet,
 * the client is not created and the user is directed to the instance setup flow.
 */
@Module
@InstallIn(SingletonComponent::class)
object FluxbaseModule {

    @Provides
    @Singleton
    fun provideInstanceManager(@ApplicationContext context: Context): InstanceManager =
        InstanceManager(context)

    @Provides
    @Singleton
    fun provideDemoManager(@ApplicationContext context: Context): io.github.nimbleflux.wayli.demo.DemoManager =
        io.github.nimbleflux.wayli.demo.DemoManager(context)

    @Provides
    @Singleton
    fun provideThemeManager(@ApplicationContext context: Context): io.github.nimbleflux.wayli.designsystem.ThemeManager =
        io.github.nimbleflux.wayli.designsystem.ThemeManager(context)

    @Provides
    @Singleton
    fun provideTrackingConfigStore(@ApplicationContext context: Context): io.github.nimbleflux.wayli.gps.TrackingConfigStore =
        io.github.nimbleflux.wayli.gps.TrackingConfigStore(context)

    @Provides
    @Singleton
    fun provideDeviceTokenStore(@ApplicationContext context: Context): io.github.nimbleflux.wayli.session.DeviceTokenStore =
        io.github.nimbleflux.wayli.session.DeviceTokenStore(context)

    @Provides
    @Singleton
    fun provideEncryptedStorageAdapter(@ApplicationContext context: Context): EncryptedStorageAdapter =
        EncryptedStorageAdapter(context)

    @Provides
    @Singleton
    fun provideFluxbaseClient(
        storage: EncryptedStorageAdapter,
        instanceManager: InstanceManager,
    ): FluxbaseClient {
        val config = instanceManager.getConfig()
            ?: return FluxbaseClient.create(
                url = "http://localhost:0",
                key = "unconfigured",
                options = FluxbaseClientOptions(
                    storage = storage,
                    autoRefresh = false,
                ),
            )
        // Self-signed instance: relax TLS before any engine (SDK OkHttp,
        // Coil) builds its connection factory. Hostname verification stays
        // strict for every other host.
        if (config.insecureTls) {
            io.github.nimbleflux.wayli.session.InsecureTls.hostOf(config.url)?.let {
                io.github.nimbleflux.wayli.session.InsecureTls.installGlobalFor(it)
            }
        }
        return FluxbaseClient.create(
            url = config.url,
            key = config.anonKey,
            options = FluxbaseClientOptions(
                storage = storage,
                autoRefresh = true,
            ),
        )
    }
}
