package io.github.nimbleflux.wayli.di

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import io.github.nimbleflux.wayli.gps.LocationProvider
import io.github.nimbleflux.wayli.location.FusedLocationProvider
import javax.inject.Singleton

/**
 * gplay flavor DI — Google Play Services implementations
 * (FusedLocationProvider; ActivityRecognition + GMS StepCounter in B4).
 */
@Module
@InstallIn(SingletonComponent::class)
abstract class FlavorModule {

    @Binds
    @Singleton
    abstract fun bindLocationProvider(impl: FusedLocationProvider): LocationProvider
}
