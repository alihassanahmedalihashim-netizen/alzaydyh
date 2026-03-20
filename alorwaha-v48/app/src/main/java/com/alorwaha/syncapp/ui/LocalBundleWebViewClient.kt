package com.alorwaha.syncapp.ui

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewAssetLoader
import com.alorwaha.syncapp.sync.OfflineBundleWriter
import com.alorwaha.syncapp.ui.cache.WebMirrorStore
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.FileInputStream
import java.net.HttpURLConnection
import java.net.URL

class LocalBundleWebViewClient(
    context: Context,
    private val onPageChanged: ((String) -> Unit)? = null,
    private val onOfflineFallback: ((String) -> Unit)? = null,
) : WebViewClient() {
    private val bundleWriter = OfflineBundleWriter(context)
    private val siteHost = "alorwahalwuthqa.net"
    private val store = WebMirrorStore(context)

    private val assetLoader = WebViewAssetLoader.Builder()
        .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(context))
        .build()

    override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
        val url = request.url
        val assetResponse = assetLoader.shouldInterceptRequest(url)
        if (assetResponse != null) return assetResponse


        if (url.host == "appassets.androidplatform.net" && (url.path == "/mirror/manifest.json" || url.path == "/mirror/summary.json")) {
            val json = store.summary().toString()
            return WebResourceResponse("application/json", "utf-8", ByteArrayInputStream(json.toByteArray()))
        }

        if (url.host == "appassets.androidplatform.net" && url.path == "/mirror/opened.json") {
            val json = JSONObject().apply {
                put("items", store.recentOpened())
            }.toString()
            return WebResourceResponse("application/json", "utf-8", ByteArrayInputStream(json.toByteArray()))
        }

        if (url.host == "appassets.androidplatform.net" && url.path == "/mirror/pages.json") {
            val json = JSONObject().apply {
                put("items", store.archivedPages())
            }.toString()
            return WebResourceResponse("application/json", "utf-8", ByteArrayInputStream(json.toByteArray()))
        }

        if (url.host == "appassets.androidplatform.net" && url.path == "/mirror/media.json") {
            val json = JSONObject().apply {
                put("items", store.mediaLibrary())
            }.toString()
            return WebResourceResponse("application/json", "utf-8", ByteArrayInputStream(json.toByteArray()))
        }

        if (url.host == "appassets.androidplatform.net" && url.path == "/mirror/search.json") {
            val query = url.getQueryParameter("q").orEmpty()
            val json = JSONObject().apply {
                put("items", store.archiveSearch(query))
            }.toString()
            return WebResourceResponse("application/json", "utf-8", ByteArrayInputStream(json.toByteArray()))
        }

        if (url.host == "appassets.androidplatform.net" && url.path?.startsWith("/local/") == true) {
            val path = url.path!!.removePrefix("/local/")
            val file = bundleWriter.readLocalFile(path) ?: return WebResourceResponse(
                "application/json",
                "utf-8",
                404,
                "Not Found",
                mapOf("Cache-Control" to "no-store"),
                "{\"ok\":false,\"error\":\"missing\"}".byteInputStream()
            )
            val mime = when {
                file.name.endsWith(".json") -> "application/json"
                file.name.endsWith(".css") -> "text/css"
                file.name.endsWith(".js") -> "application/javascript"
                file.name.endsWith(".html") -> "text/html"
                file.name.endsWith(".jpg") || file.name.endsWith(".jpeg") -> "image/jpeg"
                file.name.endsWith(".png") -> "image/png"
                file.name.endsWith(".webp") -> "image/webp"
                else -> "text/plain"
            }
            return WebResourceResponse(mime, "utf-8", FileInputStream(file))
        }

        if ((url.scheme == "http" || url.scheme == "https") && url.host.orEmpty().removePrefix("www.") == siteHost) {
            return fetchAndMirror(url.toString())
        }
        return super.shouldInterceptRequest(view, request)
    }


    override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
        super.onReceivedError(view, request, error)
        val url = request.url.toString()
        val host = request.url.host.orEmpty().removePrefix("www.")
        if (request.isForMainFrame && host == siteHost && store.getArchiveFile(url) != null) {
            view.post { onOfflineFallback?.invoke(url) }
        }
    }

    override fun onReceivedHttpError(view: WebView, request: WebResourceRequest, errorResponse: WebResourceResponse) {
        super.onReceivedHttpError(view, request, errorResponse)
        val url = request.url.toString()
        val host = request.url.host.orEmpty().removePrefix("www.")
        if (request.isForMainFrame && host == siteHost && errorResponse.statusCode >= 400 && store.getArchiveFile(url) != null) {
            view.post { onOfflineFallback?.invoke(url) }
        }
    }

    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
        val uri = request.url
        val url = uri.toString()
        if (url.startsWith("mailto:") || url.startsWith("tel:") || url.startsWith("https://wa.me/")) {
            view.context.startActivity(Intent(Intent.ACTION_VIEW, uri))
            return true
        }
        if (url.startsWith("http://") || url.startsWith("https://")) {
            val host = uri.host.orEmpty().removePrefix("www.")
            if (url.contains("appassets.androidplatform.net") || host == siteHost) return false
            view.context.startActivity(Intent(Intent.ACTION_VIEW, uri))
            return true
        }
        return false
    }

    override fun onPageFinished(view: WebView, url: String) {
        super.onPageFinished(view, url)
        val host = runCatching { Uri.parse(url).host.orEmpty().removePrefix("www.") }.getOrDefault("")
        if (host == siteHost) {
            store.markOpened(url, view.title, kindFromUrl(url))
            view.evaluateJavascript(
                "(function(){var media=[].slice.call(document.querySelectorAll('audio source,audio,video source,video,source')).map(function(el){return el.currentSrc||el.src||'';}).filter(Boolean);return JSON.stringify({title:document.title||'', images:Array.from(document.images||[]).slice(0,36).map(function(i){return i.currentSrc||i.src||'';}).filter(Boolean), media:media.slice(0,24), canonical:(document.querySelector('link[rel=canonical]')||{}).href||'', bodyText:(document.body&&document.body.innerText||'').slice(0,12000)});})();"
            ) { raw ->
                runCatching {
                    val cleaned = raw.orEmpty().removePrefix("\"").removeSuffix("\"").replace("\\\"", "\"").replace("\\n", "")
                    if (cleaned.isNotBlank() && cleaned != "null") {
                        val obj = JSONObject(cleaned)
                        store.markOpened(url, obj.optString("title"), kindFromUrl(url), obj)
                        val media = obj.optJSONArray("media")
                        if (media != null) {
                            for (i in 0 until media.length()) {
                                val mediaUrl = media.optString(i)
                                if (mediaUrl.startsWith("http://") || mediaUrl.startsWith("https://")) {
                                    fetchAndMirror(mediaUrl)
                                }
                            }
                        }
                    }
                }
            }
            val archiveFile = java.io.File(store.archivesDir(), "page_${System.currentTimeMillis()}.mht")
            view.saveWebArchive(archiveFile.absolutePath, false) { path ->
                if (!path.isNullOrBlank()) {
                    val cleanedUrl = url
                    runCatching {
                        view.evaluateJavascript("(function(){return JSON.stringify({title:document.title||'', bodyText:(document.body&&document.body.innerText||'').slice(0,12000), mediaCount:[].slice.call(document.querySelectorAll('img,audio,video,source')).length});})();") { metaRaw ->
                            val metaClean = metaRaw.orEmpty().removePrefix("\"").removeSuffix("\"").replace("\\\"", "\"").replace("\\n", "")
                            if (metaClean.isNotBlank() && metaClean != "null") {
                                val meta = JSONObject(metaClean)
                                store.savePageArchive(cleanedUrl, path, meta.optString("title"), kindFromUrl(cleanedUrl), meta.optString("bodyText"), meta.optInt("mediaCount"))
                            } else {
                                store.savePageArchive(cleanedUrl, path)
                            }
                        }
                    }.onFailure {
                        store.savePageArchive(cleanedUrl, path)
                    }
                }
            }
        }
        onPageChanged?.invoke(url)
    }

    private fun fetchAndMirror(targetUrl: String): WebResourceResponse? {
        return runCatching {
            val conn = (URL(targetUrl).openConnection() as HttpURLConnection).apply {
                instanceFollowRedirects = true
                connectTimeout = 15000
                readTimeout = 20000
                setRequestProperty("User-Agent", "Mozilla/5.0 AlorwahaAppMirror/41")
                setRequestProperty("Accept-Language", "ar,en;q=0.9")
            }
            conn.connect()
            val status = conn.responseCode
            val stream = if (status in 200..299) conn.inputStream else conn.errorStream
            val bytes = stream?.use { it.readBytes() } ?: ByteArray(0)
            val mime = conn.contentType?.substringBefore(';')?.trim().orEmpty().ifBlank {
                guessMimeType(targetUrl)
            }
            if (status in 200..299 && bytes.isNotEmpty()) {
                store.saveResource(targetUrl, mime, bytes)
            }
            val headers = linkedMapOf<String, String>()
            conn.headerFields?.forEach { (k, v) ->
                if (k != null && !v.isNullOrEmpty()) headers[k] = v.joinToString(", ")
            }
            WebResourceResponse(
                mime,
                charsetFromContentType(conn.contentType),
                status,
                conn.responseMessage ?: "OK",
                headers,
                ByteArrayInputStream(bytes)
            )
        }.getOrElse {
            val cached = store.getCachedResource(targetUrl) ?: return null
            WebResourceResponse(
                cached.mimeType,
                if (cached.mimeType.startsWith("text/") || cached.mimeType.contains("json") || cached.mimeType.contains("javascript")) "utf-8" else null,
                200,
                "OK",
                mapOf(
                    "Cache-Control" to "no-store",
                    "X-Alorwaha-Offline" to "1"
                ),
                FileInputStream(cached.file)
            )
        }
    }

    private fun charsetFromContentType(contentType: String?): String {
        return contentType?.split(';')
            ?.map { it.trim() }
            ?.firstOrNull { it.startsWith("charset=", true) }
            ?.substringAfter('=')
            ?.trim()
            ?: "utf-8"
    }

    private fun guessMimeType(url: String): String = when {
        url.endsWith(".css") -> "text/css"
        url.endsWith(".js") -> "application/javascript"
        url.endsWith(".png") -> "image/png"
        url.endsWith(".jpg") || url.endsWith(".jpeg") -> "image/jpeg"
        url.endsWith(".webp") -> "image/webp"
        url.endsWith(".svg") -> "image/svg+xml"
        url.endsWith(".pdf") -> "application/pdf"
        url.endsWith(".mp4") -> "video/mp4"
        else -> "text/html"
    }

    private fun kindFromUrl(url: String): String = when {
        url.contains("fatwa", true) -> "fatwa"
        url.contains("book", true) || url.contains("library", true) -> "book"
        url.contains("video", true) -> "video"
        url.contains("audio", true) -> "audio"
        else -> "page"
    }
}
