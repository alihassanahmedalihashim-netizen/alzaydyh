package com.alorwaha.syncapp.ui

import android.os.Build
import android.os.Bundle
import android.text.Html
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.alorwaha.syncapp.databinding.ActivityDetailBinding
import com.alorwaha.syncapp.sync.AppRepository
import kotlinx.coroutines.launch

class DetailActivity : AppCompatActivity() {

    private lateinit var binding: ActivityDetailBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityDetailBinding.inflate(layoutInflater)
        setContentView(binding.root)

        val type = intent.getStringExtra("type").orEmpty()
        val id = intent.getLongExtra("id", 0L)

        lifecycleScope.launch {
            val item = AppRepository(this@DetailActivity).getItem(type, id)
            binding.tvTitle.text = item?.title.orEmpty()
            binding.tvMeta.text = listOf(item?.subtitle, item?.author, item?.publishedAt)
                .filter { !it.isNullOrBlank() }
                .joinToString(" • ")
            val html = item?.body.orEmpty().ifBlank { item?.summary.orEmpty() }
            binding.tvBody.text = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                Html.fromHtml(html, Html.FROM_HTML_MODE_LEGACY)
            } else {
                @Suppress("DEPRECATION")
                Html.fromHtml(html)
            }
        }
    }
}
