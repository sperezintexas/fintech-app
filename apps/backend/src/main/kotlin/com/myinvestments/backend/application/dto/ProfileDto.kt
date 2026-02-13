package com.myinvestments.backend.application.dto

data class ProfileDto(
    val displayTimezone: String,
    val updatedAt: String? = null,
)

data class CleanupConfigDto(
    val storageLimitMB: Int,
    val purgeThreshold: Double,
    val purgeIntervalDays: Int,
    val lastDataCleanup: String? = null,
    val updatedAt: String? = null,
)

data class AppConfigResponseDto(
    val cleanup: CleanupConfigDto,
    val storage: StorageStatsDto,
)

data class StorageStatsDto(
    val dataSizeMB: Double,
    val percentOfLimit: Double,
)
