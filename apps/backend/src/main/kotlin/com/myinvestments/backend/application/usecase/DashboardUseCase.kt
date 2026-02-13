package com.myinvestments.backend.application.usecase

import arrow.core.Either
import com.myinvestments.backend.application.dto.AccountDto
import com.myinvestments.backend.application.dto.DashboardResponseDto
import com.myinvestments.backend.application.dto.DashboardStatsDto
import com.myinvestments.backend.application.dto.PortfolioSummaryDto
import com.myinvestments.backend.application.port.AccountRepository
import com.myinvestments.backend.domain.error.DomainError
import com.myinvestments.backend.domain.model.Account
import com.myinvestments.backend.application.dto.toDto
import org.springframework.stereotype.Component

@Component
class DashboardUseCase(private val accountRepository: AccountRepository) {

    fun getDashboard(): Either<DomainError, DashboardResponseDto> =
        accountRepository.findAll().map { accounts ->
            val accountsWithIds = accounts.map { it.toDto() }
            val totalValue = accounts.sumOf { it.balance }
            val totalPositions = accounts.sumOf { it.positions.size }
            val totalRecommendations = accounts.sumOf { it.recommendations.size }
            val stats = DashboardStatsDto(
                totalValue = totalValue,
                dailyChange = 0.0,
                dailyChangePercent = 0.0,
                totalCostBasis = totalValue,
                unrealizedPnL = 0.0,
                roiPercent = 0.0,
                accountCount = accounts.size,
                positionCount = totalPositions,
                recommendationCount = totalRecommendations,
            )
            val portfolio = PortfolioSummaryDto(
                _id = "main",
                name = "Main Portfolio",
                accounts = accountsWithIds,
                totalValue = totalValue,
                dailyChange = 0.0,
                dailyChangePercent = 0.0,
            )
            DashboardResponseDto(portfolio = portfolio, stats = stats)
        }
}
