package com.myinvestments.backend.application.port

import arrow.core.Either
import com.myinvestments.backend.domain.error.DomainError
import com.myinvestments.backend.domain.model.Activity

interface ActivityRepository {
    fun findByAccountId(accountId: String): Either<DomainError, List<Activity>>
    fun deleteByAccountId(accountId: String): Either<DomainError, Int>
    fun insertMany(activities: List<Activity>): Either<DomainError, Int>
}
