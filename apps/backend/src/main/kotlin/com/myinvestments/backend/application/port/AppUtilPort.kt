package com.myinvestments.backend.application.port

import arrow.core.Either
import com.myinvestments.backend.application.dto.CleanupConfigDto
import com.myinvestments.backend.application.dto.ProfileDto
import com.myinvestments.backend.application.dto.StorageStatsDto
import com.myinvestments.backend.domain.error.DomainError

interface AppUtilPort {
    fun getProfile(): Either<DomainError, ProfileDto>
    fun getCleanupConfig(): Either<DomainError, CleanupConfigDto>
    fun getStorageStats(): Either<DomainError, StorageStatsDto>
}
