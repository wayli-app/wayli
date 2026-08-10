package io.github.nimbleflux.wayli.di

import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent

/**
 * gplay flavor DI module — provides Google Play Services-backed implementations
 * (FusedLocationProvider, ActivityRecognitionClient, GMS StepCounter).
 * Wired in B3 (GPS) and B4 (sensors).
 */
@Module
@InstallIn(SingletonComponent::class)
object FlavorModule
