package io.github.nimbleflux.wayli.di

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import io.github.nimbleflux.wayli.gps.ActivityRecognitionDriver
import io.github.nimbleflux.wayli.gps.LocationProvider
import io.github.nimbleflux.wayli.gps.StationaryResumeTrigger
import io.github.nimbleflux.wayli.location.FusedLocationProvider
import io.github.nimbleflux.wayli.location.GmsActivityRecognitionDriver
import io.github.nimbleflux.wayli.location.GmsGeofenceResumeTrigger
import javax.inject.Singleton

/**
 * gplay flavor DI — Google Play Services implementations:
 * FusedLocationProvider (+ Activity Recognition, geofencing-based stationary
 * resume; GMS StepCounter remains reserved for the sensors milestone).
 */
@Module
@InstallIn(SingletonComponent::class)
abstract class FlavorModule {

    @Binds
    @Singleton
    abstract fun bindLocationProvider(impl: FusedLocationProvider): LocationProvider

    @Binds
    @Singleton
    abstract fun bindActivityRecognitionDriver(impl: GmsActivityRecognitionDriver): ActivityRecognitionDriver

    @Binds
    @Singleton
    abstract fun bindStationaryResumeTrigger(impl: GmsGeofenceResumeTrigger): StationaryResumeTrigger
}
