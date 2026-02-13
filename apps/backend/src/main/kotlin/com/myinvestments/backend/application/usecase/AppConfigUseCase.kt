package com.myinvestments.backend.application.usecase

import arrow.core.Either
import arrow.core.flatMap
import com.myinvestments.backend.application.dto.AppConfigResponseDto
import com.myinvestments.backend.application.port.AppUtilPort
import com.myinvestments.backend.domain.error.DomainError
import org.springframework.stereotype.Component

@Component
class AppConfigUseCase(private val appUtilPort: AppUtilPort) {

    fun getAppConfig(): Either<DomainError, AppConfigResponseDto> =
        appUtilPort.getCleanupConfig().flatMap { cleanup ->
            appUtilPort.getStorageStats().map { storage ->
                AppConfigResponseDto(cleanup = cleanup, storage = storage)
            }
        }
}
