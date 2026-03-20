package com.alorwaha.syncapp.data

import androidx.room.Entity
import androidx.room.Index

@Entity(
    tableName = "content_items",
    primaryKeys = ["type", "remoteId"],
    indices = [Index("type"), Index("title"), Index("updatedAt")]
)
data class ContentEntity(
    val type: String,
    val remoteId: Long,
    val title: String,
    val subtitle: String,
    val summary: String,
    val body: String,
    val slug: String,
    val category: String,
    val author: String,
    val sourceName: String,
    val url: String,
    val fileUrl: String,
    val coverUrl: String,
    val publishedAt: String,
    val updatedAt: String,
    val savedAt: Long,
)
