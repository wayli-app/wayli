package io.github.nimbleflux.wayli.di

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import io.github.nimbleflux.wayli.gps.LocationProvider
import io.github.nimbleflux.wayli.location.SystemLocationProvider
import javax.inject.Singleton

/**
 * foss flavor DI — framework-only implementations (LocationManager;
 * system sensors in B4). No Google dependencies; F-Droid eligible.
 */
@Module
@InstallIn(SingletonComponent::class)
abstract class FlavorModule {

    @Binds
    @Singleton
    abstract fun bindLocationProvider(impl: SystemLocationProvider): LocationProvider
}
