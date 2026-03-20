package com.alorwaha.syncapp.sync

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters

class SyncWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result {
        return try {
            AppRepository(applicationContext).syncAll()
            Result.success()
        } catch (e: Throwable) {
            Result.retry()
        }
    }
}
