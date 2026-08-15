package io.github.nimbleflux.wayli.repo

import android.content.Context
import androidx.room.Room
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import io.github.nimbleflux.fluxbase.FluxbaseClient
import io.github.nimbleflux.wayli.db.PendingPointDao
import io.github.nimbleflux.wayli.db.WayliDatabase
import io.github.nimbleflux.wayli.session.DeviceTokenStore
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object RepositoryModule {

    @Provides
    @Singleton
    fun provideDatabase(@ApplicationContext context: Context): WayliDatabase =
        Room.databaseBuilder(context, WayliDatabase::class.java, "wayli.db").build()

    @Provides
    @Singleton
    fun providePendingPointDao(db: WayliDatabase): PendingPointDao =
        db.pendingPointDao()

    @Provides
    @Singleton
    fun provideTripRepository(client: FluxbaseClient): TripRepository =
        TripRepository(client)

    @Provides
    @Singleton
    fun provideWishlistRepository(client: FluxbaseClient): WishlistRepository =
        WishlistRepository(client)

    @Provides
    @Singleton
    fun provideStatsRepository(client: FluxbaseClient): StatsRepository =
        StatsRepository(client)

    @Provides
    @Singleton
    fun provideDeviceTokenRepository(
        client: FluxbaseClient,
        store: DeviceTokenStore,
    ): DeviceTokenRepository = DeviceTokenRepository(client, store)
}
