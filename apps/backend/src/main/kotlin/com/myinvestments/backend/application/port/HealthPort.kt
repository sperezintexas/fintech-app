package com.myinvestments.backend.application.port

import arrow.core.Either
import com.myinvestments.backend.domain.error.DomainError

data class MongoHealthResult(
    val ok: Boolean,
    val latencyMs: Long,
    val message: String? = null,
)

interface HealthPort {
    fun checkMongo(): Either<DomainError, MongoHealthResult>
}
