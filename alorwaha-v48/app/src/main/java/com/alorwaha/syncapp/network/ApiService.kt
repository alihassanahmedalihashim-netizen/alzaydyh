package com.alorwaha.syncapp.network

import retrofit2.http.GET
import retrofit2.http.Query

interface ApiService {
    @GET("manifest.php")
    suspend fun manifest(@Query("token") token: String): ManifestResponse

    @GET("assets.php")
    suspend fun assets(@Query("token") token: String): AssetsResponse

    @GET("home.php")
    suspend fun home(@Query("token") token: String): HomeResponse

    @GET("sections.php")
    suspend fun sections(@Query("token") token: String): SectionsResponse

    @GET("items.php")
    suspend fun items(
        @Query("section") section: String,
        @Query("page") page: Int,
        @Query("per_page") perPage: Int,
        @Query("token") token: String,
    ): ItemsResponse

    @GET("item.php")
    suspend fun item(
        @Query("section") section: String,
        @Query("id") id: Long,
        @Query("token") token: String,
    ): ItemResponse

    @GET("sync.php")
    suspend fun sync(
        @Query("section") section: String,
        @Query("since") since: String,
        @Query("limit") limit: Int,
        @Query("token") token: String,
    ): SyncResponse
}
