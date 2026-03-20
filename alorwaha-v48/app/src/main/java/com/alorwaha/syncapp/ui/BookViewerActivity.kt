package com.alorwaha.syncapp.ui

import android.annotation.SuppressLint
import android.os.Bundle
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import com.alorwaha.syncapp.databinding.ActivityBookViewerBinding
import java.net.URLEncoder

class BookViewerActivity : AppCompatActivity() {

    private lateinit var binding: ActivityBookViewerBinding

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityBookViewerBinding.inflate(layoutInflater)
        setContentView(binding.root)

        supportActionBar?.title = intent.getStringExtra("title").orEmpty().ifBlank { "عارض الملف" }
        supportActionBar?.subtitle = "قراءة داخل التطبيق"
        supportActionBar?.setDisplayHomeAsUpEnabled(true)

        binding.web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            builtInZoomControls = true
            displayZoomControls = false
            cacheMode = WebSettings.LOAD_DEFAULT
            loadWithOverviewMode = true
            useWideViewPort = true
            allowFileAccess = true
            mediaPlaybackRequiresUserGesture = false
        }
        binding.web.webViewClient = WebViewClient()
        binding.web.webChromeClient = WebChromeClient()

        val url = intent.getStringExtra("url").orEmpty()
        if (url.isNotBlank()) {
            val lower = url.lowercase()
            val target = if (lower.endsWith(".pdf") || lower.contains(".pdf?")) {
                "https://docs.google.com/gview?embedded=1&url=" + URLEncoder.encode(url, "UTF-8")
            } else {
                url
            }
            binding.web.loadUrl(target)
        }
    }

    override fun onSupportNavigateUp(): Boolean {
        if (binding.web.canGoBack()) {
            binding.web.goBack()
            return true
        }
        finish()
        return true
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (binding.web.canGoBack()) {
            binding.web.goBack()
        } else {
            super.onBackPressed()
        }
    }
}
