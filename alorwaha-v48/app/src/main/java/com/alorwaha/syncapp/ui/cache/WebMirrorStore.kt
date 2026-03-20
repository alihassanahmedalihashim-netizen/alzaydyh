package com.alorwaha.syncapp.ui.cache

import android.content.Context
import android.net.Uri
import android.util.Base64
import android.webkit.MimeTypeMap
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.URLConnection
import java.security.MessageDigest

class WebMirrorStore(context: Context) {
    private val root = File(context.filesDir, "web_mirror").apply { mkdirs() }
    private val resourcesDir = File(root, "resources").apply { mkdirs() }
    private val archivesDir = File(root, "archives").apply { mkdirs() }
    private val manifestFile = File(root, "manifest.json")

    @Synchronized
    fun saveResource(url: String, mimeType: String?, data: ByteArray): File {
        val file = File(resourcesDir, resourceFileName(url, mimeType))
        file.parentFile?.mkdirs()
        file.writeBytes(data)
        val resolvedMime = mimeType ?: guessMimeType(url)
        val manifest = readManifest()
        val resources = manifest.optJSONObject("resources") ?: JSONObject().also { manifest.put("resources", it) }
        resources.put(url, JSONObject().apply {
            put("path", file.absolutePath)
            put("mimeType", resolvedMime)
            put("size", data.size)
            put("updatedAt", System.currentTimeMillis())
            put("family", mediaFamily(resolvedMime, url))
        })
        touchStats(manifest)
        writeManifest(manifest)
        return file
    }

    @Synchronized
    fun getCachedResource(url: String): CachedResource? {
        val manifest = readManifest()
        val obj = manifest.optJSONObject("resources")?.optJSONObject(url) ?: return null
        val path = obj.optString("path")
        if (path.isBlank()) return null
        val file = File(path)
        if (!file.exists()) return null
        return CachedResource(
            file = file,
            mimeType = obj.optString("mimeType").ifBlank { guessMimeType(url) },
            updatedAt = obj.optLong("updatedAt"),
        )
    }

    @Synchronized
    fun savePageArchive(
        url: String,
        archivePath: String,
        title: String? = null,
        kind: String? = null,
        bodyText: String? = null,
        resourceCount: Int? = null,
    ) {
        val file = File(archivePath)
        val normalized = normalizeUrlKey(url)
        val now = System.currentTimeMillis()
        val manifest = readManifest()
        val pages = manifest.optJSONObject("pages") ?: JSONObject().also { manifest.put("pages", it) }
        val value = JSONObject().apply {
            put("url", url)
            put("path", file.absolutePath)
            put("updatedAt", now)
            if (!title.isNullOrBlank()) put("title", title)
            if (!kind.isNullOrBlank()) put("kind", kind)
            if (!bodyText.isNullOrBlank()) {
                put("text", compactText(bodyText))
                put("excerpt", compactText(bodyText).take(240))
            }
            if (resourceCount != null) put("resourceCount", resourceCount)
            put("contentSize", file.length())
        }
        pages.put(normalized, value)
        if (normalized != url) pages.put(url, JSONObject(value.toString()))
        touchStats(manifest)
        writeManifest(manifest)
    }

    @Synchronized
    fun getPageArchivePath(url: String): String? {
        val manifest = readManifest()
        val pages = manifest.optJSONObject("pages") ?: return null
        val candidates = urlCandidates(url)
        for (candidate in candidates) {
            val path = pages.optJSONObject(candidate)?.optString("path").orEmpty()
            if (path.isNotBlank() && File(path).exists()) return path
        }
        return null
    }

    @Synchronized
    fun markOpened(url: String, title: String?, kind: String? = null, extra: JSONObject? = null) {
        val manifest = readManifest()
        val opened = manifest.optJSONArray("opened") ?: JSONArray().also { manifest.put("opened", it) }
        val item = JSONObject().apply {
            put("url", url)
            put("title", title ?: "")
            put("kind", kind ?: "page")
            put("openedAt", System.currentTimeMillis())
            if (extra != null) {
                put("extra", extra)
                val text = compactText(extra.optString("bodyText"))
                if (text.isNotBlank()) {
                    put("text", text)
                    put("excerpt", text.take(180))
                }
                val mediaCount = extra.optJSONArray("media")?.length() ?: 0
                if (mediaCount > 0) put("mediaCount", mediaCount)
            }
        }
        opened.put(item)
        if (opened.length() > 500) {
            val trimmed = JSONArray()
            for (i in maxOf(0, opened.length() - 500) until opened.length()) trimmed.put(opened.get(i))
            manifest.put("opened", trimmed)
        }
        touchStats(manifest)
        writeManifest(manifest)
    }

    @Synchronized
    fun summary(): JSONObject {
        val manifest = readManifest()
        val resources = manifest.optJSONObject("resources")
        val pages = manifest.optJSONObject("pages")
        val opened = manifest.optJSONArray("opened")
        val media = mediaSummary(resources)
        return JSONObject().apply {
            put("resourcesCount", resources?.length() ?: 0)
            put("pagesCount", pages?.length() ?: 0)
            put("openedCount", opened?.length() ?: 0)
            put("lastUpdated", manifest.optLong("lastUpdated"))
            put("recent", recentOpened())
            put("kinds", openedKinds())
            put("media", media)
        }
    }

    @Synchronized
    fun recentOpened(limit: Int = 24): JSONArray {
        val manifest = readManifest()
        val opened = manifest.optJSONArray("opened") ?: JSONArray()
        val result = JSONArray()
        val seen = linkedSetOf<String>()
        for (i in opened.length() - 1 downTo 0) {
            val item = opened.optJSONObject(i) ?: continue
            val url = item.optString("url")
            if (url.isBlank() || !seen.add(url)) continue
            result.put(item)
            if (result.length() >= limit) break
        }
        return result
    }

    fun archivesDir(): File = archivesDir
    fun rootDir(): File = root

    @Synchronized
    fun openedKinds(): JSONObject {
        val manifest = readManifest()
        val opened = manifest.optJSONArray("opened") ?: JSONArray()
        val counts = linkedMapOf<String, Int>()
        for (i in 0 until opened.length()) {
            val item = opened.optJSONObject(i) ?: continue
            val kind = item.optString("kind").ifBlank { "page" }
            counts[kind] = (counts[kind] ?: 0) + 1
        }
        return JSONObject().apply { counts.forEach { (kind, count) -> put(kind, count) } }
    }

    @Synchronized
    fun archiveSearch(query: String, limit: Int = 60): JSONArray {
        val q = compactText(query).lowercase()
        if (q.isBlank()) return archivedPages(limit)
        val pages = archivedPages(250)
        val out = JSONArray()
        for (i in 0 until pages.length()) {
            val item = pages.optJSONObject(i) ?: continue
            val hay = listOf(
                item.optString("title"),
                item.optString("url"),
                item.optString("kind"),
                item.optString("excerpt"),
                item.optString("text")
            ).joinToString(" ").lowercase()
            if (hay.contains(q)) out.put(item)
            if (out.length() >= limit) break
        }
        return out
    }

    @Synchronized
    fun archivedPages(limit: Int = 50): JSONArray {
        val manifest = readManifest()
        val pages = manifest.optJSONObject("pages") ?: JSONObject()
        val openedIndex = linkedMapOf<String, JSONObject>()
        val opened = manifest.optJSONArray("opened") ?: JSONArray()
        for (i in opened.length() - 1 downTo 0) {
            val item = opened.optJSONObject(i) ?: continue
            val url = item.optString("url")
            if (url.isBlank() || openedIndex.containsKey(url)) continue
            openedIndex[url] = item
        }
        val items = mutableListOf<JSONObject>()
        val keys = pages.keys()
        val seenNormalized = linkedSetOf<String>()
        while (keys.hasNext()) {
            val key = keys.next()
            val page = pages.optJSONObject(key) ?: continue
            val url = page.optString("url").ifBlank { key }
            val normalized = normalizeUrlKey(url)
            if (!seenNormalized.add(normalized)) continue
            val path = page.optString("path")
            if (path.isBlank() || !File(path).exists()) continue
            val openedMeta = openedIndex[url] ?: openedIndex[normalized]
            items += JSONObject().apply {
                put("url", url)
                put("path", path)
                put("title", page.optString("title").ifBlank { openedMeta?.optString("title").orEmpty() })
                put("kind", page.optString("kind").ifBlank { openedMeta?.optString("kind").ifNullOrBlank { "page" } })
                put("updatedAt", page.optLong("updatedAt"))
                put("excerpt", page.optString("excerpt").ifBlank { openedMeta?.optString("excerpt").orEmpty() })
                put("text", page.optString("text"))
                put("resourceCount", page.optInt("resourceCount"))
                put("contentSize", page.optLong("contentSize"))
            }
        }
        items.sortByDescending { it.optLong("updatedAt") }
        val out = JSONArray()
        items.take(limit).forEach { out.put(it) }
        return out
    }

    @Synchronized
    fun mediaLibrary(limit: Int = 200): JSONArray {
        val manifest = readManifest()
        val resources = manifest.optJSONObject("resources") ?: JSONObject()
        val out = mutableListOf<JSONObject>()
        val keys = resources.keys()
        while (keys.hasNext()) {
            val url = keys.next()
            val item = resources.optJSONObject(url) ?: continue
            val path = item.optString("path")
            if (path.isBlank() || !File(path).exists()) continue
            val family = item.optString("family").ifBlank { mediaFamily(item.optString("mimeType"), url) }
            if (family == "other") continue
            out += JSONObject().apply {
                put("url", url)
                put("path", path)
                put("mimeType", item.optString("mimeType"))
                put("family", family)
                put("size", item.optLong("size"))
                put("updatedAt", item.optLong("updatedAt"))
                put("name", File(path).name)
            }
        }
        out.sortByDescending { it.optLong("updatedAt") }
        val arr = JSONArray()
        out.take(limit).forEach { arr.put(it) }
        return arr
    }

    @Synchronized
    fun getArchiveFile(url: String): File? {
        val path = getPageArchivePath(url) ?: return null
        val file = File(path)
        return file.takeIf { it.exists() }
    }

    private fun readManifest(): JSONObject = runCatching {
        if (manifestFile.exists()) JSONObject(manifestFile.readText()) else JSONObject()
    }.getOrDefault(JSONObject())

    private fun writeManifest(obj: JSONObject) {
        manifestFile.writeText(obj.toString(2))
    }

    private fun touchStats(manifest: JSONObject) {
        manifest.put("lastUpdated", System.currentTimeMillis())
    }

    private fun resourceFileName(url: String, mimeType: String?): String {
        val ext = extensionFor(url, mimeType)
        return sha256(url) + if (ext.isNotBlank()) ".${ext}" else ""
    }

    private fun extensionFor(url: String, mimeType: String?): String {
        val fromMime = mimeType?.substringBefore(';')?.trim()?.let { MimeTypeMap.getSingleton().getExtensionFromMimeType(it) }
        if (!fromMime.isNullOrBlank()) return fromMime
        val path = url.substringBefore('?').substringAfterLast('/', "")
        val fromUrl = path.substringAfterLast('.', "")
        if (fromUrl.isNotBlank() && fromUrl.length <= 6) return fromUrl
        return guessMimeType(url).let { MimeTypeMap.getSingleton().getExtensionFromMimeType(it) ?: "bin" }
    }

    private fun guessMimeType(url: String): String = URLConnection.guessContentTypeFromName(url) ?: "application/octet-stream"

    private fun mediaSummary(resources: JSONObject?): JSONObject {
        val counts = linkedMapOf("image" to 0, "pdf" to 0, "audio" to 0, "video" to 0)
        val sizes = linkedMapOf("image" to 0L, "pdf" to 0L, "audio" to 0L, "video" to 0L)
        val obj = resources ?: return JSONObject().apply {
            counts.forEach { (k, v) -> put(k, v) }
            put("sizes", JSONObject(sizes as Map<*, *>))
        }
        val keys = obj.keys()
        while (keys.hasNext()) {
            val key = keys.next()
            val item = obj.optJSONObject(key) ?: continue
            val family = item.optString("family").ifBlank { mediaFamily(item.optString("mimeType"), key) }
            if (family in counts.keys) {
                counts[family] = (counts[family] ?: 0) + 1
                sizes[family] = (sizes[family] ?: 0L) + item.optLong("size")
            }
        }
        return JSONObject().apply {
            counts.forEach { (k, v) -> put(k, v) }
            put("sizes", JSONObject().apply { sizes.forEach { (k, v) -> put(k, v) } })
        }
    }

    private fun mediaFamily(mimeType: String?, url: String): String {
        val mime = mimeType.orEmpty().lowercase()
        if (mime.startsWith("image/")) return "image"
        if (mime.startsWith("audio/")) return "audio"
        if (mime.startsWith("video/")) return "video"
        if (mime.contains("pdf") || url.lowercase().endsWith(".pdf")) return "pdf"
        return when {
            url.lowercase().matches(Regex(".*\\.(jpg|jpeg|png|webp|gif|svg)(\\?.*)?$")) -> "image"
            url.lowercase().matches(Regex(".*\\.(mp3|m4a|ogg|wav)(\\?.*)?$")) -> "audio"
            url.lowercase().matches(Regex(".*\\.(mp4|webm|m3u8)(\\?.*)?$")) -> "video"
            else -> "other"
        }
    }

    private fun compactText(value: String?): String {
        val source = value.orEmpty()
        if (source.isBlank()) return ""
        return source.replace(Regex("\\s+"), " ").trim()
    }

    private fun String?.ifNullOrBlank(fallback: () -> String): String = if (this.isNullOrBlank()) fallback() else this

    private fun urlCandidates(url: String): List<String> {
        val normalized = normalizeUrlKey(url)
        val trimmed = url.trim()
        return linkedSetOf(trimmed, normalized, normalized.removeSuffix("/"), "$normalized/")
            .filter { it.isNotBlank() }
            .toList()
    }

    private fun normalizeUrlKey(url: String): String {
        return runCatching {
            val uri = Uri.parse(url.trim())
            val scheme = uri.scheme?.lowercase() ?: "https"
            val host = uri.host?.lowercase()?.removePrefix("www.").orEmpty()
            val path = uri.encodedPath.orEmpty().ifBlank { "/" }
            val query = uri.encodedQuery?.takeIf { it.isNotBlank() }?.let { "?$it" }.orEmpty()
            "$scheme://$host$path$query"
        }.getOrDefault(url.trim())
    }

    private fun sha256(text: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(text.toByteArray())
        return Base64.encodeToString(digest, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
    }

    data class CachedResource(
        val file: File,
        val mimeType: String,
        val updatedAt: Long,
    )
}
