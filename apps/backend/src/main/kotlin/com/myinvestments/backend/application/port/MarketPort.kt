package com.myinvestments.backend.application.port

import arrow.core.Either
import com.myinvestments.backend.application.dto.MarketConditionsDto
import com.myinvestments.backend.domain.error.DomainError

interface MarketPort {
    fun getMarketConditions(): Either<DomainError, MarketConditionsDto>
}
