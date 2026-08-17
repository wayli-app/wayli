package io.github.nimbleflux.wayli.db

import androidx.room.Dao
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query

/**
 * Generic response cache: whole payloads as JSON strings keyed by request
 * identity ("trips:{userId}", "entries:{tripId}", …). Written through on
 * every successful fetch, served when the network fails.
 */
@Entity(tableName = "cache")
data class CacheEntity(
    @PrimaryKey val key: String,
    val payload: String,
    val updatedAt: Long = System.currentTimeMillis(),
)

@Dao
interface CacheDao {

    @Query("SELECT payload FROM cache WHERE `key` = :key")
    suspend fun payload(key: String): String?

    @Query("SELECT updatedAt FROM cache WHERE `key` = :key")
    suspend fun updatedAt(key: String): Long?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: CacheEntity)

    @Query("DELETE FROM cache WHERE `key` = :key")
    suspend fun delete(key: String)

    @Query("DELETE FROM cache")
    suspend fun clear()
}
