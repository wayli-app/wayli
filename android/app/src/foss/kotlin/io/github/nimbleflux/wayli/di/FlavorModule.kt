package io.github.nimbleflux.wayli.di

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import io.github.nimbleflux.wayli.gps.ActivityRecognitionDriver
import io.github.nimbleflux.wayli.gps.LocationProvider
import io.github.nimbleflux.wayli.gps.StationaryResumeTrigger
import io.github.nimbleflux.wayli.location.SystemLocationProvider
import io.github.nimbleflux.wayli.tracking.NoopActivityRecognitionDriver
import io.github.nimbleflux.wayli.tracking.NoopStationaryResumeTrigger
import javax.inject.Singleton

/**
 * foss flavor DI — framework-only implementations (LocationManager, no
 * activity recognition, no geofencing). No Google dependencies; F-Droid
 * eligible.
 */
@Module
@InstallIn(SingletonComponent::class)
abstract class FlavorModule {

    @Binds
    @Singleton
    abstract fun bindLocationProvider(impl: SystemLocationProvider): LocationProvider

    @Binds
    @Singleton
    abstract fun bindActivityRecognitionDriver(impl: NoopActivityRecognitionDriver): ActivityRecognitionDriver

    @Binds
    @Singleton
    abstract fun bindStationaryResumeTrigger(impl: NoopStationaryResumeTrigger): StationaryResumeTrigger
}
