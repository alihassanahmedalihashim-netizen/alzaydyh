package com.alorwaha.syncapp.ui

import android.annotation.SuppressLint
import android.os.Bundle
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import com.alorwaha.syncapp.databinding.ActivityBookViewerBinding

class MediaViewerActivity : AppCompatActivity() {

    private lateinit var binding: ActivityBookViewerBinding

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityBookViewerBinding.inflate(layoutInflater)
        setContentView(binding.root)

        supportActionBar?.title = intent.getStringExtra("title").orEmpty().ifBlank { "مشغل الوسائط" }
        supportActionBar?.subtitle = "تشغيل داخل التطبيق"
        supportActionBar?.setDisplayHomeAsUpEnabled(true)

        val url = intent.getStringExtra("url").orEmpty()
        val mediaType = intent.getStringExtra("media_type").orEmpty()

        binding.web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            builtInZoomControls = false
            displayZoomControls = false
            cacheMode = WebSettings.LOAD_DEFAULT
            loadWithOverviewMode = true
            useWideViewPort = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = true
        }
        binding.web.webViewClient = WebViewClient()
        binding.web.webChromeClient = WebChromeClient()

        if (url.isNotBlank()) {
            binding.web.loadDataWithBaseURL(url, mediaHtml(url, mediaType, intent.getStringExtra("title").orEmpty()), "text/html", "UTF-8", null)
        }
    }

    private fun mediaHtml(url: String, mediaType: String, title: String): String {
        val lower = url.lowercase()
        val kind = when {
            mediaType.contains("audio") -> "audio"
            mediaType.contains("video") -> "video"
            lower.endsWith(".mp3") || lower.contains(".mp3?") || lower.endsWith(".m4a") || lower.endsWith(".wav") || lower.endsWith(".ogg") -> "audio"
            else -> "video"
        }
        val player = if (kind == "audio") {
            "<audio controls preload=\"metadata\" style=\"width:100%\"><source src=\"$url\"></audio>"
        } else {
            "<video controls playsinline preload=\"metadata\" style=\"width:100%;max-height:70vh;background:#000\"><source src=\"$url\"></video>"
        }
        return """<!doctype html>
<html lang=\"ar\" dir=\"rtl\">
<head>
<meta charset=\"utf-8\" />
<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\" />
<title>${if (title.isBlank()) "مشغل الوسائط" else title}</title>
<style>
body{font-family:sans-serif;background:#0f172a;color:#fff;margin:0;padding:24px}
.wrap{max-width:900px;margin:0 auto}
.card{background:#111827;border-radius:18px;padding:20px;box-shadow:0 10px 30px rgba(0,0,0,.25)}
h1{font-size:22px;margin:0 0 16px}
p{color:#cbd5e1;line-height:1.7}
a{color:#93c5fd}
</style>
</head>
<body>
<div class=\"wrap\">
  <div class=\"card\">
    <h1>${if (title.isBlank()) "مشغل الوسائط" else title}</h1>
    <p>تشغيل ${if (kind == "audio") "صوتي" else "مرئي"} داخل التطبيق.</p>
    $player
    <p><a href=\"$url\">فتح الرابط الأصلي</a></p>
  </div>
</div>
</body>
</html>"""
    }

    override fun onSupportNavigateUp(): Boolean {
        if (binding.web.canGoBack()) {
            binding.web.goBack()
            return true
        }
        finish()
        return true
    }
}
