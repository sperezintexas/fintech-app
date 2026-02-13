package com.myinvestments.backend.application.usecase

import arrow.core.Either
import com.myinvestments.backend.application.dto.ProfileDto
import com.myinvestments.backend.application.port.AppUtilPort
import com.myinvestments.backend.domain.error.DomainError
import org.springframework.stereotype.Component

@Component
class ProfileUseCase(private val appUtilPort: AppUtilPort) {

    fun getProfile(): Either<DomainError, ProfileDto> = appUtilPort.getProfile()
}
