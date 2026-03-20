package com.alorwaha.syncapp

import android.app.Application
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.alorwaha.syncapp.sync.SyncWorker
import java.util.concurrent.TimeUnit

class SyncApp : Application() {
    override fun onCreate() {
        super.onCreate()
        val request = PeriodicWorkRequestBuilder<SyncWorker>(6, TimeUnit.HOURS).build()
        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
            "content-sync",
            ExistingPeriodicWorkPolicy.UPDATE,
            request
        )
    }
}
