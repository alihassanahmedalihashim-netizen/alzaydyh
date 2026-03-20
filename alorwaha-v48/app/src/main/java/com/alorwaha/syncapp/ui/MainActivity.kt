package com.alorwaha.syncapp.ui

import android.annotation.SuppressLint
import android.app.DownloadManager
import android.content.Context
import android.os.Bundle
import android.os.Environment
import android.view.View
import android.webkit.CookieManager
import android.webkit.DownloadListener
import android.webkit.URLUtil
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.alorwaha.syncapp.BuildConfig
import com.alorwaha.syncapp.R
import com.alorwaha.syncapp.databinding.ActivityMainBinding
import com.alorwaha.syncapp.sync.AppRepository
import com.alorwaha.syncapp.ui.cache.WebMirrorStore
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var repository: AppRepository
    private val prefs by lazy { getSharedPreferences("alorwaha_prefs", Context.MODE_PRIVATE) }
    private val mirrorStore by lazy { WebMirrorStore(this) }

    private val localHomeUrl = "https://appassets.androidplatform.net/assets/offline/index.html"
    private val liveSiteUrl: String by lazy { BuildConfig.BASE_URL.removeSuffix("/mobile-api/") }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        setSupportActionBar(binding.toolbar)
        supportActionBar?.subtitle = getString(R.string.offline_ready)

        repository = AppRepository(this)

        binding.swipeRefresh.setOnRefreshListener {
            binding.swipeRefresh.isRefreshing = false
            doSync(false)
        }
        binding.btnSync.setOnClickListener {
            doSync(false)
        }
        binding.btnOpenSite.setOnClickListener {
            openLocalHome()
        }

        binding.webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = true
            builtInZoomControls = false
            displayZoomControls = false
            cacheMode = WebSettings.LOAD_DEFAULT
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            userAgentString = "$userAgentString AlorwahaApp/48 MobileShell"
            loadWithOverviewMode = true
            useWideViewPort = true
            loadsImagesAutomatically = true
            mediaPlaybackRequiresUserGesture = false
            textZoom = 100
            setSupportMultipleWindows(false)
        }
        binding.webView.webViewClient = LocalBundleWebViewClient(
            this,
            onPageChanged = { url ->
                runOnUiThread {
                    rememberMode(url)
                    updateModeUi(url)
                }
            },
            onOfflineFallback = { url ->
                runOnUiThread {
                    openSavedArchive(url, true)
                }
            }
        )
        binding.webView.addJavascriptInterface(
            AndroidBridge(
                context = this,
                siteBaseUrl = liveSiteUrl,
                onSyncRequested = { runOnUiThread { doSync(false) } },
                onOpenInAppSite = { target -> runOnUiThread { openLiveSite(target) } },
                onOpenLocalHome = { runOnUiThread { openLocalHome() } },
                onOpenSavedArchive = { target -> runOnUiThread { openSavedArchive(target) } },
            ),
            "AndroidBridge"
        )
        binding.webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                binding.progress.visibility = if (newProgress in 1..99) View.VISIBLE else View.GONE
                if (newProgress == 100) {
                    binding.swipeRefresh.isRefreshing = false
                }
            }
        }
        binding.webView.setDownloadListener(DownloadListener { url, userAgent, contentDisposition, mimeType, _ ->
            enqueueDownload(url, userAgent, contentDisposition, mimeType)
        })

        lifecycleScope.launch {
            repository.observeMeta("last_sync").collectLatest {
                binding.tvLastSync.text = getString(R.string.last_sync, it ?: "-")
            }
        }

        lifecycleScope.launch {
            repository.observeMeta("site_title").collectLatest {
                supportActionBar?.title = it ?: getString(R.string.app_name)
            }
        }

        lifecycleScope.launch {
            repository.observeMeta("site_subtitle").collectLatest {
                repositoryLastSubtitle = it
                if (!(binding.webView.url.orEmpty().startsWith(liveSiteUrl))) {
                    supportActionBar?.subtitle = it ?: getString(R.string.offline_ready)
                }
            }
        }

        openLocalHome()
        doSync(true)
    }

    private fun enqueueDownload(url: String?, userAgent: String?, contentDisposition: String?, mimeType: String?) {
        val safeUrl = url?.trim().orEmpty()
        if (safeUrl.isBlank()) return
        runCatching {
            val request = DownloadManager.Request(android.net.Uri.parse(safeUrl)).apply {
                setTitle(URLUtil.guessFileName(safeUrl, contentDisposition, mimeType))
                setDescription(getString(R.string.app_name))
                setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, URLUtil.guessFileName(safeUrl, contentDisposition, mimeType))
                userAgent?.takeIf { it.isNotBlank() }?.let { addRequestHeader("User-Agent", it) }
                val cookies = CookieManager.getInstance().getCookie(safeUrl)
                cookies?.takeIf { it.isNotBlank() }?.let { addRequestHeader("Cookie", it) }
                mimeType?.takeIf { it.isNotBlank() }?.let { setMimeType(it) }
            }
            val dm = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            dm.enqueue(request)
            Toast.makeText(this, R.string.download_started, Toast.LENGTH_SHORT).show()
        }.onFailure {
            Toast.makeText(this, it.message ?: "تعذر بدء التنزيل", Toast.LENGTH_LONG).show()
        }
    }

    private fun openLocalHome() {
        binding.webView.loadUrl(localHomeUrl)
        rememberMode(localHomeUrl)
        updateModeUi(localHomeUrl)
    }



    private fun openSavedArchive(targetUrl: String, fromFallback: Boolean = false) {
        if (targetUrl.isBlank()) {
            binding.webView.loadUrl(localHomeUrl)
            return
        }
        val archive = mirrorStore.getArchiveFile(targetUrl)
        if (archive == null || !archive.exists()) {
            if (!fromFallback) {
                binding.webView.loadUrl(localHomeUrl)
            }
            return
        }
        binding.webView.loadUrl("file://${archive.absolutePath}")
        prefs.edit().putString("preferred_mode", "archive").apply()
        supportActionBar?.subtitle = getString(R.string.archive_mode)
        if (fromFallback) {
            Toast.makeText(this, R.string.offline_fallback, Toast.LENGTH_SHORT).show()
        }
    }

    private fun openLiveSite(targetUrl: String?) {
        val safe = targetUrl?.trim().orEmpty()
        val finalUrl = if (safe.startsWith("http://") || safe.startsWith("https://")) safe else liveSiteUrl
        binding.webView.loadUrl(finalUrl)
        rememberMode(finalUrl)
        updateModeUi(finalUrl)
    }

    private fun rememberMode(url: String?) {
        val target = url.orEmpty()
        prefs.edit().apply {
            when {
                target.startsWith(liveSiteUrl) -> {
                    putString("preferred_mode", "live")
                    putString("last_live_url", target)
                }
                target.startsWith("file://") -> putString("preferred_mode", "archive")
                target.isNotBlank() -> putString("preferred_mode", "local")
            }
        }.apply()
    }

    private fun updateModeUi(url: String?) {
        val target = url.orEmpty()
        val isArchive = target.startsWith("file://")
        binding.btnOpenSite.text = getString(R.string.open_site)
        binding.btnSync.text = getString(R.string.sync_now)
        binding.swipeRefresh.isEnabled = true
        supportActionBar?.subtitle = when {
            isArchive -> getString(R.string.archive_mode)
            else -> repositoryLastSubtitle ?: getString(R.string.local_mode)
        }
    }

    private var repositoryLastSubtitle: String? = null

    private fun doSync(silent: Boolean) {
        lifecycleScope.launch {
            try {
                binding.progress.visibility = View.VISIBLE
                binding.swipeRefresh.isRefreshing = true
                binding.btnSync.isEnabled = false
                binding.btnOpenSite.isEnabled = false
                repository.syncAll()
                binding.webView.evaluateJavascript(
                    "window.AlorwahaApp && window.AlorwahaApp.reloadFromAndroid && window.AlorwahaApp.reloadFromAndroid();",
                    null
                )
                if (!silent) {
                    Toast.makeText(this@MainActivity, R.string.sync_done, Toast.LENGTH_SHORT).show()
                }
            } catch (e: Throwable) {
                Toast.makeText(this@MainActivity, getString(R.string.sync_failed, e.message ?: ""), Toast.LENGTH_LONG).show()
            } finally {
                binding.progress.visibility = View.GONE
                binding.swipeRefresh.isRefreshing = false
                binding.btnSync.isEnabled = true
                binding.btnOpenSite.isEnabled = true
            }
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (binding.webView.canGoBack()) binding.webView.goBack() else super.onBackPressed()
    }
}
