package com.alorwaha.syncapp.ui

import android.app.DownloadManager
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Environment
import android.webkit.JavascriptInterface
import android.webkit.URLUtil
import android.widget.Toast
import java.util.Locale

class AndroidBridge(
    private val context: Context,
    private val siteBaseUrl: String,
    private val onSyncRequested: () -> Unit,
    private val onOpenInAppSite: (String) -> Unit,
    private val onOpenLocalHome: () -> Unit,
    private val onOpenSavedArchive: (String) -> Unit,
) {
    @JavascriptInterface
    fun syncNow() {
        onSyncRequested()
    }

    @JavascriptInterface
    fun openExternal(url: String?) {
        val safe = url?.trim().orEmpty()
        if (safe.startsWith("http://") || safe.startsWith("https://") || safe.startsWith("mailto:") || safe.startsWith("tel:")) {
            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(safe)).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            })
        }
    }

    @JavascriptInterface
    fun openSitePath(path: String?) {
        val safe = path?.trim().orEmpty().trimStart('/')
        if (safe.isBlank()) {
            openExternal(siteBaseUrl)
            return
        }
        openExternal(siteBaseUrl.trimEnd('/') + "/" + safe)
    }

    @JavascriptInterface
    fun openInAppSite(url: String?) {
        val safe = url?.trim().orEmpty()
        val target = when {
            safe.startsWith("http://") || safe.startsWith("https://") -> safe
            safe.startsWith("/") -> siteBaseUrl.trimEnd('/') + safe
            safe.isNotBlank() -> siteBaseUrl.trimEnd('/') + "/" + safe.trimStart('/')
            else -> siteBaseUrl
        }
        onOpenInAppSite(target)
    }

    @JavascriptInterface
    fun openLocalAppHome() {
        onOpenLocalHome()
    }

    @JavascriptInterface
    fun openSavedArchive(url: String?) {
        val safe = url?.trim().orEmpty()
        if (safe.isNotBlank()) onOpenSavedArchive(safe)
    }

    @JavascriptInterface
    fun openBookViewer(url: String?, title: String?) {
        val safe = url?.trim().orEmpty()
        if (safe.isBlank()) return
        val intent = Intent(context, BookViewerActivity::class.java).apply {
            putExtra("url", safe)
            putExtra("title", title?.trim().orEmpty())
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
    }

    @JavascriptInterface
    fun openMediaViewer(url: String?, title: String?, mediaType: String?) {
        val safe = url?.trim().orEmpty()
        if (safe.isBlank()) return
        val intent = Intent(context, MediaViewerActivity::class.java).apply {
            putExtra("url", safe)
            putExtra("title", title?.trim().orEmpty())
            putExtra("media_type", mediaType?.trim()?.lowercase(Locale.ROOT).orEmpty())
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
    }

    @JavascriptInterface
    fun shareText(title: String?, url: String?) {
        val payload = buildString {
            if (!title.isNullOrBlank()) append(title.trim())
            if (!url.isNullOrBlank()) {
                if (isNotEmpty()) append("\n")
                append(url.trim())
            }
        }.ifBlank { return }

        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_TEXT, payload)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(Intent.createChooser(intent, "مشاركة").apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        })
    }

    @JavascriptInterface
    fun downloadFile(url: String?, fileName: String?) {
        val safe = url?.trim().orEmpty()
        if (!(safe.startsWith("http://") || safe.startsWith("https://"))) return
        val targetName = fileName?.trim().takeUnless { it.isNullOrBlank() }
            ?: URLUtil.guessFileName(safe, null, null)
        runCatching {
            val request = DownloadManager.Request(Uri.parse(safe)).apply {
                setTitle(targetName)
                setDescription("العروة الوثقى")
                setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, targetName)
            }
            val dm = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            dm.enqueue(request)
            Toast.makeText(context, "بدأ تنزيل الملف", Toast.LENGTH_SHORT).show()
        }.onFailure {
            Toast.makeText(context, it.message ?: "تعذر بدء التنزيل", Toast.LENGTH_LONG).show()
        }
    }

    @JavascriptInterface
    fun openDownloads() {
        val intent = Intent(DownloadManager.ACTION_VIEW_DOWNLOADS).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
    }

    @JavascriptInterface
    fun copyText(text: String?) {
        val safe = text?.trim().orEmpty()
        if (safe.isBlank()) return
        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        clipboard.setPrimaryClip(ClipData.newPlainText("alorwaha", safe))
        Toast.makeText(context, "تم النسخ", Toast.LENGTH_SHORT).show()
    }

    @JavascriptInterface
    fun toast(message: String?) {
        val safe = message?.trim().orEmpty()
        if (safe.isNotBlank()) Toast.makeText(context, safe, Toast.LENGTH_SHORT).show()
    }
}
