package io.github.nimbleflux.wayli.di

import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent

/**
 * foss flavor DI module — provides framework-only implementations
 * (LocationManager, system ActivityRecognition, Sensor TYPE_STEP_COUNTER).
 * No Google dependencies. Wired in B3 (GPS) and B4 (sensors).
 */
@Module
@InstallIn(SingletonComponent::class)
object FlavorModule
