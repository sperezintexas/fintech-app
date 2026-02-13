package com.myinvestments.backend.application.usecase

import arrow.core.Either
import com.myinvestments.backend.application.port.ActivityRepository
import com.myinvestments.backend.domain.error.DomainError
import com.myinvestments.backend.domain.model.Activity
import org.springframework.stereotype.Component

@Component
class ActivityUseCase(private val activityRepository: ActivityRepository) {

    fun getByAccountId(accountId: String): Either<DomainError, List<Activity>> =
        activityRepository.findByAccountId(accountId)

    fun deleteByAccountId(accountId: String): Either<DomainError, Int> =
        activityRepository.deleteByAccountId(accountId)
}
