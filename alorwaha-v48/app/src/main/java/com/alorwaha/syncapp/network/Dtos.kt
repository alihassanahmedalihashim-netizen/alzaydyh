package com.alorwaha.syncapp.network

data class ManifestResponse(
    val success: Boolean = false,
    val site_name: String? = null,
    val base_url: String? = null,
    val api_version: Int = 1,
    val content_version: String? = null,
    val sections: List<String> = emptyList(),
)

data class AssetsResponse(
    val success: Boolean = false,
    val site_name: String? = null,
    val base_url: String? = null,
    val logo_url: String? = null,
    val hero_image_url: String? = null,
    val app_colors: AppColors? = null,
)

data class AppColors(
    val primary: String? = null,
    val primary_dark: String? = null,
    val accent: String? = null,
    val background: String? = null,
    val surface: String? = null,
    val text: String? = null,
    val muted: String? = null,
)

data class HomeResponse(
    val success: Boolean = false,
    val site_name: String? = null,
    val sections: List<SectionDto> = emptyList(),
    val latest: Map<String, List<ContentDto>> = emptyMap(),
    val server_time: String? = null,
)

data class SectionsResponse(
    val success: Boolean = false,
    val data: List<SectionDto> = emptyList(),
)

data class SectionDto(
    val key: String = "",
    val title: String = "",
    val route: String = "",
    val count: Int = 0,
)

data class ItemsResponse(
    val success: Boolean = false,
    val section: String = "",
    val page: Int = 1,
    val per_page: Int = 20,
    val total: Int = 0,
    val has_more: Boolean = false,
    val data: List<ContentDto> = emptyList(),
)

data class ItemResponse(
    val success: Boolean = false,
    val section: String? = null,
    val data: ContentDto? = null,
)

data class SyncResponse(
    val success: Boolean = false,
    val section: String = "",
    val since: String? = null,
    val count: Int = 0,
    val deleted_ids: List<Long> = emptyList(),
    val data: List<ContentDto> = emptyList(),
    val server_time: String? = null,
)

data class ContentDto(
    val id: Long = 0,
    val section: String? = null,
    val title: String? = null,
    val slug: String? = null,
    val excerpt: String? = null,
    val content: String? = null,
    val question: String? = null,
    val answer: String? = null,
    val description: String? = null,
    val thumbnail: String? = null,
    val category_name: String? = null,
    val category_slug: String? = null,
    val author_name: String? = null,
    val source_name: String? = null,
    val mufti_name: String? = null,
    val speaker: String? = null,
    val pdf_url: String? = null,
    val external_url: String? = null,
    val file_url: String? = null,
    val download_url: String? = null,
    val preview_url: String? = null,
    val link: String? = null,
    val url: String? = null,
    val youtube_id: String? = null,
    val thumbnail_url: String? = null,
    val published_at: String? = null,
    val created_at: String? = null,
    val updated_at: String? = null,
)
