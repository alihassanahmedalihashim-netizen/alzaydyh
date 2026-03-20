package com.alorwaha.syncapp.sync

import android.content.Context
import android.text.Html
import com.alorwaha.syncapp.data.ContentEntity
import com.alorwaha.syncapp.network.AppColors
import com.google.gson.GsonBuilder
import java.io.File

class OfflineBundleWriter(private val context: Context) {
    private val gson = GsonBuilder().setPrettyPrinting().create()

    private val rootDir: File get() = File(context.filesDir, "offline_bundle")
    private val contentDir: File get() = File(rootDir, "content")
    private val pagesDir: File get() = File(rootDir, "pages")

    fun writeSection(section: String, items: List<ContentEntity>) {
        if (!contentDir.exists()) contentDir.mkdirs()
        if (!pagesDir.exists()) pagesDir.mkdirs()

        val payload = linkedMapOf(
            "ok" to true,
            "section" to section,
            "count" to items.size,
            "items" to items.map { itemMap(it) },
        )
        File(contentDir, "$section.json").writeText(gson.toJson(payload), Charsets.UTF_8)

        items.forEach { item ->
            File(pagesDir, "${item.type}-${item.remoteId}.html").writeText(buildDetailPage(item), Charsets.UTF_8)
        }
    }

    fun writeAppState(
        lastSync: String,
        sectionCounts: Map<String, Int>,
        allItems: List<ContentEntity>,
        siteTitle: String,
        siteSubtitle: String,
        logoUrl: String?,
        heroImageUrl: String?,
        colors: AppColors?,
        sectionTitles: Map<String, String>,
        latestBySection: Map<String, List<ContentEntity>>,
    ) {
        if (!rootDir.exists()) rootDir.mkdirs()

        val sorted = allItems.sortedByDescending {
            it.updatedAt.ifBlank { it.publishedAt.ifBlank { it.remoteId.toString() } }
        }
        val defaultLabels = linkedMapOf(
            "fatwas" to "الفتاوى",
            "books" to "الكتب",
            "posts" to "المقالات",
            "news" to "الأخبار",
            "audios" to "الصوتيات",
            "videos" to "الفيديوهات",
        )

        val sectionsMeta = mutableListOf<Map<String, Any>>()
        sectionsMeta += mapOf("key" to "home", "label" to "الرئيسية", "count" to sorted.size)
        defaultLabels.forEach { (key, fallback) ->
            sectionsMeta += mapOf(
                "key" to key,
                "label" to (sectionTitles[key]?.takeIf { it.isNotBlank() } ?: fallback),
                "count" to (sectionCounts[key] ?: 0),
            )
        }
        sectionsMeta += mapOf("key" to "favorites", "label" to "المحفوظات", "count" to 0)
        sectionsMeta += mapOf("key" to "history", "label" to "سجل القراءة", "count" to 0)
        sectionsMeta += mapOf("key" to "settings", "label" to "الإعدادات", "count" to 0)

        val categories = sorted
            .mapNotNull { it.category.takeIf { value -> value.isNotBlank() } }
            .groupingBy { it }
            .eachCount()
            .entries
            .sortedByDescending { it.value }
            .take(12)
            .map { mapOf("name" to it.key, "count" to it.value) }

        val latestMap = latestBySection.mapValues { (_, list) -> list.take(6).map { itemMap(it) } }
        val payload = linkedMapOf<String, Any>(
            "ok" to true,
            "appVersion" to "50.0",
            "siteTitle" to siteTitle,
            "siteSubtitle" to siteSubtitle,
            "siteUrl" to "https://alorwahalwuthqa.net",
            "logoUrl" to (logoUrl ?: ""),
            "heroImageUrl" to (heroImageUrl ?: ""),
            "theme" to mapOf(
                "primary" to (colors?.primary ?: "#0f766e"),
                "primaryDark" to (colors?.primary_dark ?: "#0a5c5c"),
                "accent" to (colors?.accent ?: "#c9a227"),
                "background" to (colors?.background ?: "#ffffff"),
                "surface" to (colors?.surface ?: "#f8fafc"),
                "text" to (colors?.text ?: "#111827"),
                "muted" to (colors?.muted ?: "#6b7280"),
            ),
            "lastSync" to lastSync,
            "sectionCounts" to sectionCounts,
            "sections" to sectionsMeta,
            "topCategories" to categories,
            "hero" to mapOf(
                "title" to "بوابة محلية كاملة لمحتوى العروة الوثقى",
                "subtitle" to "واجهة محلية محسنة للقراءة والبحث والتحميل، مع أرشيف منظم للمحتوى والملفات بعد كل مزامنة.",
                "primaryAction" to mapOf("label" to "ابدأ التصفح", "route" to "#/home"),
                "secondaryAction" to mapOf("label" to "التنزيلات", "route" to "#/downloads"),
            ),
            "featured" to sorted.take(8).map { itemMap(it) },
            "latest" to latestMap,
            "highlights" to sorted.take(4).map { itemMap(it) },
            "sectionSpotlights" to defaultLabels.keys.mapNotNull { key ->
                latestBySection[key]?.firstOrNull()?.let { first ->
                    mapOf(
                        "key" to key,
                        "label" to (sectionTitles[key]?.takeIf { it.isNotBlank() } ?: defaultLabels[key].orEmpty()),
                        "count" to (sectionCounts[key] ?: 0),
                        "item" to itemMap(first),
                    )
                }
            },
            "featuredBooks" to (latestBySection["books"] ?: emptyList()).take(8).map { itemMap(it) },
            "featuredFatwas" to (latestBySection["fatwas"] ?: emptyList()).take(8).map { itemMap(it) },
            "featuredPosts" to (latestBySection["posts"] ?: emptyList()).take(8).map { itemMap(it) },
            "mirror" to mapOf(
                "siteUrl" to "https://alorwahalwuthqa.net",
                "modeHint" to "التطبيق يعمل محليًا بعد المزامنة مع أرشفة منظمة للصفحات والوسائط.",
                "downloadsHint" to "التنزيلات المباشرة متاحة من داخل التطبيق عند توفر الملفات وروابط الكتب والوسائط."
            ),
            "stats" to mapOf(
                "withFiles" to sorted.count { it.fileUrl.isNotBlank() },
                "withExternalSource" to sorted.count { it.url.isNotBlank() },
                "authors" to sorted.mapNotNull { it.author.takeIf { a -> a.isNotBlank() } }.distinct().count(),
            ),
        )

        File(rootDir, "app-state.json").writeText(gson.toJson(payload), Charsets.UTF_8)
    }

    fun readLocalFile(path: String): File? {
        val safePath = path.removePrefix("/")
        val file = File(rootDir, safePath)
        return if (file.exists() && file.isFile) file else null
    }

    private fun itemMap(item: ContentEntity): Map<String, Any> = linkedMapOf(
        "id" to item.remoteId,
        "type" to item.type,
        "title" to item.title,
        "subtitle" to item.subtitle,
        "summary" to item.summary,
        "body" to item.body,
        "slug" to item.slug,
        "category" to item.category,
        "author" to item.author,
        "sourceName" to item.sourceName,
        "url" to item.url,
        "fileUrl" to item.fileUrl,
        "coverUrl" to item.coverUrl,
        "publishedAt" to item.publishedAt,
        "updatedAt" to item.updatedAt,
        "localPage" to "pages/${item.type}-${item.remoteId}.html",
        "excerpt" to stripHtml(item.summary.ifBlank { item.body }).take(220),
        "meta" to listOf(item.category, item.author, item.publishedAt).filter { it.isNotBlank() }.joinToString(" • "),
    )

    private fun buildDetailPage(item: ContentEntity): String {
        val summaryText = item.summary.ifBlank { stripHtml(item.body) }
        val bodyHtml = item.body.ifBlank { item.summary.ifBlank { "<p>لا يوجد محتوى نصي.</p>" } }
        val meta = listOf(item.category, item.author, item.publishedAt).filter { it.isNotBlank() }.joinToString(" • ")
        val facts = listOfNotNull(
            item.category.takeIf { it.isNotBlank() }?.let { "<div class=\"fact-card\"><span>التصنيف</span><strong>${escapeHtml(it)}</strong></div>" },
            item.author.takeIf { it.isNotBlank() }?.let { "<div class=\"fact-card\"><span>الكاتب</span><strong>${escapeHtml(it)}</strong></div>" },
            item.sourceName.takeIf { it.isNotBlank() }?.let { "<div class=\"fact-card\"><span>المصدر</span><strong>${escapeHtml(it)}</strong></div>" },
            item.publishedAt.takeIf { it.isNotBlank() }?.let { "<div class=\"fact-card\"><span>التاريخ</span><strong>${escapeHtml(it)}</strong></div>" },
        ).joinToString("")
        val external = when {
            item.fileUrl.isNotBlank() -> "<a class=\"btn\" href=\"${escapeAttribute(item.fileUrl)}\" target=\"_blank\">فتح الملف</a>"
            item.url.isNotBlank() -> "<a class=\"btn\" href=\"${escapeAttribute(item.url)}\" target=\"_blank\">فتح المصدر</a>"
            else -> ""
        }
        val shareText = escapeAttribute(item.title.ifBlank { "محتوى من العروة الوثقى" })
        val routeBack = "https://appassets.androidplatform.net/assets/offline/index.html#/detail?type=${escapeAttribute(item.type)}&id=${item.remoteId}"
        return """
<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(item.title.ifBlank { "العروة الوثقى" })}</title>
  <link rel="stylesheet" href="https://appassets.androidplatform.net/assets/offline/styles.css" />
</head>
<body class="detail-page standalone-detail">
  <div class="page-shell">
    <div class="detail-actions sticky">
      <a class="btn" href="https://appassets.androidplatform.net/assets/offline/index.html">الرئيسية</a>
      <a class="btn secondary" href="$routeBack">عرض داخل التطبيق</a>
      $external
    </div>
    <article class="detail-card glass-card">
      <div class="eyebrow">${escapeHtml(item.category.ifBlank { item.type })}</div>
      <h1>${escapeHtml(item.title.ifBlank { "بدون عنوان" })}</h1>
      <div class="meta">${escapeHtml(meta)}</div>
      ${if (summaryText.isNotBlank()) "<p class=\"lead\">${escapeHtml(summaryText.take(280))}</p>" else ""}
      ${if (facts.isNotBlank()) "<div class=\"facts-grid\">$facts</div>" else ""}
      <div class="body-content">$bodyHtml</div>
      <div class="detail-actions footer-actions">
        <button class="ghost-btn" onclick="navigator.clipboard && navigator.clipboard.writeText('$shareText')">نسخ العنوان</button>
        $external
      </div>
    </article>
  </div>
</body>
</html>
        """.trimIndent()
    }

    private fun stripHtml(html: String): String = Html.fromHtml(html, Html.FROM_HTML_MODE_LEGACY).toString().trim()

    private fun escapeHtml(value: String): String = value
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\"", "&quot;")
        .replace("'", "&#39;")

    private fun escapeAttribute(value: String): String = escapeHtml(value)
}
