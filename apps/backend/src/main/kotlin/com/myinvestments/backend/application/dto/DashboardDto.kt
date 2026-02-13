package com.myinvestments.backend.application.dto

data class PortfolioSummaryDto(
    val _id: String,
    val name: String,
    val accounts: List<AccountDto>,
    val totalValue: Double,
    val dailyChange: Double,
    val dailyChangePercent: Double,
)

data class DashboardResponseDto(
    val portfolio: PortfolioSummaryDto,
    val stats: DashboardStatsDto,
)

data class DashboardStatsDto(
    val totalValue: Double,
    val dailyChange: Double,
    val dailyChangePercent: Double,
    val totalCostBasis: Double,
    val unrealizedPnL: Double,
    val roiPercent: Double,
    val accountCount: Int,
    val positionCount: Int,
    val recommendationCount: Int,
)

data class TimelinePointDto(
    val date: String,
    val value: Double,
)

data class TimelineResponseDto(
    val points: List<TimelinePointDto>,
)
