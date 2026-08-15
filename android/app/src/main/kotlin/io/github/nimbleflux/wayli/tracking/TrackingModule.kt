package io.github.nimbleflux.wayli.tracking

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import io.github.nimbleflux.wayli.gps.TrackingController
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class TrackingModule {

    @Binds
    @Singleton
    abstract fun bindTrackingController(impl: TrackingControllerImpl): TrackingController
}
