package com.alorwaha.syncapp.sync

import android.content.Context
import com.alorwaha.syncapp.data.AppDatabase
import com.alorwaha.syncapp.data.ContentEntity
import com.alorwaha.syncapp.data.MetaEntity
import com.alorwaha.syncapp.network.AppColors
import com.alorwaha.syncapp.network.ContentDto
import com.alorwaha.syncapp.network.NetworkModule
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.Flow

class AppRepository(context: Context) {
    private val dao = AppDatabase.get(context).dao()
    private val bundleWriter = OfflineBundleWriter(context)

    fun observeType(type: String): Flow<List<ContentEntity>> = dao.observeByType(type)
    fun observeMeta(key: String): Flow<String?> = dao.observeMeta(key)
    suspend fun getItem(type: String, id: Long): ContentEntity? = dao.getById(type, id)

    suspend fun syncAll() {
        val manifest = NetworkModule.api.manifest(NetworkModule.syncToken)
        val assets = runCatching { NetworkModule.api.assets(NetworkModule.syncToken) }.getOrNull()
        val home = runCatching { NetworkModule.api.home(NetworkModule.syncToken) }.getOrNull()
        val sectionInfo = runCatching { NetworkModule.api.sections(NetworkModule.syncToken) }.getOrNull()

        val sections = when {
            sectionInfo?.success == true && sectionInfo.data.isNotEmpty() -> sectionInfo.data.map { it.key }.filter { it.isNotBlank() }
            home?.success == true && home.sections.isNotEmpty() -> home.sections.map { it.key }.filter { it.isNotBlank() }
            manifest.sections.isNotEmpty() -> manifest.sections.filter { it.isNotBlank() }
            else -> listOf("posts", "fatwas", "books", "news", "audios", "videos")
        }

        val counts = linkedMapOf<String, Int>()
        val allItems = mutableListOf<ContentEntity>()

        sections.forEach { section ->
            val result = syncSection(section)
            counts[section] = result.size
            allItems += result
        }

        val stamp = manifest.content_version ?: home?.server_time ?: currentStamp()
        val siteTitle = assets?.site_name ?: manifest.site_name ?: "العروة الوثقى"
        val siteSubtitle = "نسخة تطبيقية تحاكي الموقع وتعمل بعد المزامنة"
        dao.upsertMeta(MetaEntity("last_sync", stamp))
        dao.upsertMeta(MetaEntity("site_title", siteTitle))
        dao.upsertMeta(MetaEntity("site_subtitle", siteSubtitle))
        assets?.logo_url?.orEmpty()?.takeIf { it.isNotBlank() }?.let { dao.upsertMeta(MetaEntity("logo_url", it)) }
        assets?.hero_image_url?.orEmpty()?.takeIf { it.isNotBlank() }?.let { dao.upsertMeta(MetaEntity("hero_image_url", it)) }
        writeThemeMeta(assets?.app_colors)

        bundleWriter.writeAppState(
            lastSync = stamp,
            sectionCounts = counts,
            allItems = allItems,
            siteTitle = siteTitle,
            siteSubtitle = siteSubtitle,
            logoUrl = assets?.logo_url,
            heroImageUrl = assets?.hero_image_url,
            colors = assets?.app_colors,
            sectionTitles = sectionInfo?.data?.associate { it.key to it.title } ?: home?.sections?.associate { it.key to it.title } ?: emptyMap(),
            latestBySection = buildLatestBySection(home?.latest, allItems),
        )
    }

    private suspend fun syncSection(section: String): List<ContentEntity> {
        val lastSectionSync = dao.getMeta("last_sync_$section") ?: "1970-01-01 00:00:00"
        val syncResult = NetworkModule.api.sync(section = section, since = lastSectionSync, limit = 1000, token = NetworkModule.syncToken)
        if (syncResult.success) {
            val updatedMapped = syncResult.data.map { dto -> dto.toEntity(section) }
            if (updatedMapped.isNotEmpty()) dao.insertAll(updatedMapped)
            val deletedIds = syncResult.deleted_ids.filter { it > 0 }
            if (deletedIds.isNotEmpty()) dao.deleteByTypeAndIds(section, deletedIds)
            val serverTime = syncResult.server_time ?: currentStamp()
            dao.upsertMeta(MetaEntity("last_sync_$section", serverTime))
            val finalList = dao.listByType(section)
            dao.upsertMeta(MetaEntity("count_$section", finalList.size.toString()))
            bundleWriter.writeSection(section, finalList)
            return finalList
        }
        return fallbackFullSectionFetch(section)
    }

    private suspend fun fallbackFullSectionFetch(section: String): List<ContentEntity> {
        val collected = mutableListOf<ContentDto>()
        var page = 1
        var hasMore = true
        while (hasMore) {
            val response = NetworkModule.api.items(section = section, page = page, perPage = 50, token = NetworkModule.syncToken)
            collected += response.data
            hasMore = response.has_more
            page += 1
            if (page > 1000) break
        }
        val detailItems = collected.map { preview ->
            val detail = runCatching { NetworkModule.api.item(section = section, id = preview.id, token = NetworkModule.syncToken) }.getOrNull()
            (detail?.data ?: preview).toEntity(section)
        }
        dao.deleteByType(section)
        if (detailItems.isNotEmpty()) dao.insertAll(detailItems)
        dao.upsertMeta(MetaEntity("last_sync_$section", currentStamp()))
        dao.upsertMeta(MetaEntity("count_$section", detailItems.size.toString()))
        bundleWriter.writeSection(section, detailItems)
        return detailItems
    }

    private fun ContentDto.toEntity(defaultSection: String): ContentEntity {
        val now = System.currentTimeMillis()
        val sectionName = (section ?: defaultSection).trim().ifBlank { defaultSection }
        val titleText = title?.trim().orEmpty()
        val bodyText = when {
            !content.isNullOrBlank() -> content.trim()
            !description.isNullOrBlank() -> description.trim()
            !answer.isNullOrBlank() -> buildString {
                if (!question.isNullOrBlank()) append("<h3>السؤال</h3><p>${question!!.trim()}</p>")
                append("<h3>الجواب</h3><div>${answer!!.trim()}</div>")
            }
            else -> ""
        }
        val summaryText = when {
            !excerpt.isNullOrBlank() -> excerpt.trim()
            !description.isNullOrBlank() -> description.trim()
            !question.isNullOrBlank() || !answer.isNullOrBlank() -> listOf(question, answer).filterNotNull().joinToString(" ").trim()
            else -> ""
        }
        val authorText = listOfNotNull(author_name?.trim()?.takeIf { it.isNotBlank() }, mufti_name?.trim()?.takeIf { it.isNotBlank() }, speaker?.trim()?.takeIf { it.isNotBlank() }).firstOrNull().orEmpty()
        val fileUrlText = listOfNotNull(pdf_url, file_url, download_url, external_url, preview_url).map { it.trim() }.firstOrNull { it.isNotBlank() }.orEmpty()
        val sourceUrl = listOfNotNull(url, link, external_url).map { it.trim() }.firstOrNull { it.isNotBlank() }.orEmpty()
        val imageUrl = listOfNotNull(thumbnail, thumbnail_url).map { it.trim() }.firstOrNull { it.isNotBlank() }.orEmpty()
        return ContentEntity(
            type = sectionName,
            remoteId = id,
            title = titleText,
            subtitle = category_name?.trim().orEmpty(),
            summary = summaryText,
            body = bodyText,
            slug = slug?.trim().orEmpty(),
            category = category_name?.trim().orEmpty(),
            author = authorText,
            sourceName = source_name?.trim().takeUnless { it.isNullOrBlank() } ?: "alorwahalwuthqa.net",
            url = sourceUrl,
            fileUrl = fileUrlText,
            coverUrl = imageUrl,
            publishedAt = (published_at ?: created_at).orEmpty().trim(),
            updatedAt = (updated_at ?: published_at ?: created_at).orEmpty().trim(),
            savedAt = now,
        )
    }

    private fun writeThemeMeta(colors: AppColors?) {
        if (colors == null) return
        mapOf(
            "theme_primary" to colors.primary,
            "theme_primary_dark" to colors.primary_dark,
            "theme_accent" to colors.accent,
            "theme_background" to colors.background,
            "theme_surface" to colors.surface,
            "theme_text" to colors.text,
            "theme_muted" to colors.muted,
        ).forEach { (key, value) ->
            value?.takeIf { it.isNotBlank() }?.let { CoroutineScope(Dispatchers.IO).launch { dao.upsertMeta(MetaEntity(key, it)) } }
        }
    }

    private fun buildLatestBySection(fromApi: Map<String, List<ContentDto>>?, allItems: List<ContentEntity>): Map<String, List<ContentEntity>> {
        if (fromApi != null && fromApi.isNotEmpty()) {
            return fromApi.mapValues { (section, rows) -> rows.map { it.toEntity(section) } }
        }
        return allItems.groupBy { it.type }.mapValues { (_, items) -> items.sortedByDescending { it.updatedAt.ifBlank { it.publishedAt } }.take(6) }
    }

    private fun currentStamp(): String = java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss", java.util.Locale.getDefault()).format(java.util.Date())
}
