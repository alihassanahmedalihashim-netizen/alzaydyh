package com.alorwaha.syncapp.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface AppDao {
    @Query("SELECT * FROM content_items WHERE type = :type ORDER BY remoteId DESC")
    fun observeByType(type: String): Flow<List<ContentEntity>>

    @Query("SELECT * FROM content_items WHERE type = :type AND remoteId = :remoteId LIMIT 1")
    suspend fun getById(type: String, remoteId: Long): ContentEntity?

    @Query("SELECT * FROM content_items WHERE type = :type ORDER BY remoteId DESC")
    suspend fun listByType(type: String): List<ContentEntity>

    @Query("SELECT * FROM content_items ORDER BY savedAt DESC, remoteId DESC")
    suspend fun listAll(): List<ContentEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(items: List<ContentEntity>)

    @Query("DELETE FROM content_items WHERE type = :type")
    suspend fun deleteByType(type: String)

    @Query("DELETE FROM content_items WHERE type = :type AND remoteId IN (:ids)")
    suspend fun deleteByTypeAndIds(type: String, ids: List<Long>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertMeta(meta: MetaEntity)

    @Query("SELECT value FROM meta WHERE key = :key LIMIT 1")
    fun observeMeta(key: String): Flow<String?>

    @Query("SELECT value FROM meta WHERE key = :key LIMIT 1")
    suspend fun getMeta(key: String): String?
}
