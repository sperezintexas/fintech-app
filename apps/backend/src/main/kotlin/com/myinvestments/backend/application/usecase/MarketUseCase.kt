package com.myinvestments.backend.application.usecase

import arrow.core.Either
import com.myinvestments.backend.application.dto.MarketConditionsDto
import com.myinvestments.backend.application.port.MarketPort
import com.myinvestments.backend.domain.error.DomainError
import org.springframework.stereotype.Component

@Component
class MarketUseCase(private val marketPort: MarketPort) {

    fun getMarketConditions(): Either<DomainError, MarketConditionsDto> =
        marketPort.getMarketConditions()
}
