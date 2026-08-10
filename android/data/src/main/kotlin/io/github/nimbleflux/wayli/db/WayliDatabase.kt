package io.github.nimbleflux.wayli.db

import androidx.room.Database
import androidx.room.Entity
import androidx.room.PrimaryKey
import androidx.room.RoomDatabase
import androidx.room.TypeConverter
import androidx.room.TypeConverters

/**
 * Placeholder entity so Room has at least one table. Real entities (Trip, TripEntry,
 * TrackerPoint, etc.) will be added in B3-B6 as features are implemented.
 */
@Entity(tableName = "metadata")
data class MetadataEntity(
    @PrimaryKey val key: String,
    val value: String,
)

/**
 * Room database for offline-first access. Mirrors the subset of Wayli tables
 * the app reads/writes, plus sync metadata (sync_state column on each entity).
 */
@Database(
    entities = [MetadataEntity::class],
    version = 1,
    exportSchema = false,
)
@TypeConverters(WayliConverters::class)
abstract class WayliDatabase : RoomDatabase()

class WayliConverters {
    @TypeConverter
    fun fromStringList(value: String?): List<String>? =
        value?.split(",")?.filter { it.isNotEmpty() }

    @TypeConverter
    fun toStringList(list: List<String>?): String? =
        list?.joinToString(",")
}
