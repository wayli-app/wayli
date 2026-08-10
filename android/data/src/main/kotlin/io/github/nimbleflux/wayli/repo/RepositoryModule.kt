package io.github.nimbleflux.wayli.repo

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import io.github.nimbleflux.fluxbase.FluxbaseClient
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object RepositoryModule {

    @Provides
    @Singleton
    fun provideTripRepository(client: dagger.Lazy<FluxbaseClient?>): TripRepository =
        TripRepository(client)

    @Provides
    @Singleton
    fun provideWishlistRepository(client: dagger.Lazy<FluxbaseClient?>): WishlistRepository =
        WishlistRepository(client)

    @Provides
    @Singleton
    fun provideStatsRepository(client: dagger.Lazy<FluxbaseClient?>): StatsRepository =
        StatsRepository(client)
}
