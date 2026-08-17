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
        Room.databaseBuilder(context, WayliDatabase::class.java, "wayli.db")
            // Pre-release: the local schema is still churning (upload queue),
            // so rebuild instead of maintaining dev-only migrations. The
            // pending-point queue is transient — losing it on upgrade is fine.
            .fallbackToDestructiveMigration()
            .build()

    @Provides
    @Singleton
    fun providePendingPointDao(db: WayliDatabase): PendingPointDao =
        db.pendingPointDao()

    @Provides
    @Singleton
    fun provideDraftEntryDao(db: WayliDatabase): io.github.nimbleflux.wayli.db.DraftEntryDao =
        db.draftEntryDao()

    @Provides
    @Singleton
    fun provideCacheDao(db: WayliDatabase): io.github.nimbleflux.wayli.db.CacheDao =
        db.cacheDao()

    @Provides
    @Singleton
    fun provideDraftRepository(dao: io.github.nimbleflux.wayli.db.DraftEntryDao): DraftRepository =
        DraftRepository(dao)

    @Provides
    @Singleton
    fun provideTripRepository(client: FluxbaseClient, cache: CacheStore): TripRepository =
        TripRepository(client, cache)

    @Provides
    @Singleton
    fun provideWishlistRepository(client: FluxbaseClient, cache: CacheStore): WishlistRepository =
        WishlistRepository(client, cache)

    @Provides
    @Singleton
    fun provideStatsRepository(client: FluxbaseClient, cache: CacheStore): StatsRepository =
        StatsRepository(client, cache)

    @Provides
    @Singleton
    fun provideDeviceTokenRepository(
        client: FluxbaseClient,
        store: DeviceTokenStore,
    ): DeviceTokenRepository = DeviceTokenRepository(client, store)
}
