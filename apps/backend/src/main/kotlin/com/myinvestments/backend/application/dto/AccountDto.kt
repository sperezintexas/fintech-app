package com.myinvestments.backend.application.dto

import com.fasterxml.jackson.annotation.JsonProperty
import com.myinvestments.backend.domain.model.Account
import com.myinvestments.backend.domain.model.Position
import com.myinvestments.backend.domain.model.Recommendation
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.NotNull

data class PositionCreateDto(
    val accountId: String,
    val type: String? = "stock",
    val ticker: String? = null,
    val shares: Double? = null,
    val purchasePrice: Double? = null,
    val currentPrice: Double? = null,
    val strike: Double? = null,
    val expiration: String? = null,
    val optionType: String? = null,
    val contracts: Int? = null,
    val premium: Double? = null,
    val amount: Double? = null,
    val currency: String? = null,
)

data class PositionCloseDto(
    val accountId: String,
    val quantity: Int,
    val pricePerContract: Double,
)

data class PositionDto(
    @JsonProperty("_id") val id: String? = null,
    val type: String? = "stock",
    val ticker: String? = null,
    val shares: Double? = null,
    val purchasePrice: Double? = null,
    val currentPrice: Double? = null,
    val strike: Double? = null,
    val expiration: String? = null,
    val optionType: String? = null,
    val contracts: Int? = null,
    val premium: Double? = null,
    val amount: Double? = null,
    val currency: String? = null,
)

data class RecommendationDto(
    val id: String,
    val type: String,
    val ticker: String,
    val reason: String,
    val confidence: Double,
    val createdAt: String,
)

data class AccountDto(
    @JsonProperty("_id") val id: String,
    val name: String,
    val accountRef: String? = null,
    val brokerType: String? = null,
    val balance: Double,
    val riskLevel: String,
    val strategy: String,
    val positions: List<PositionDto> = emptyList(),
    val recommendations: List<RecommendationDto> = emptyList(),
)

data class AccountCreateDto(
    @field:NotBlank(message = "name is required") val name: String,
    val accountRef: String? = null,
    val brokerType: String? = null,
    val balance: Double = 0.0,
    val riskLevel: String = "medium",
    val strategy: String = "balanced",
)

data class AccountUpdateDto(
    val name: String? = null,
    val accountRef: String? = null,
    val brokerType: String? = null,
    val balance: Double? = null,
    val riskLevel: String? = null,
    val strategy: String? = null,
)

fun Account.toDto(): AccountDto = AccountDto(
    id = id,
    name = name,
    accountRef = accountRef,
    brokerType = brokerType,
    balance = balance,
    riskLevel = riskLevel,
    strategy = strategy,
    positions = positions.map { it.toDto() },
    recommendations = recommendations.map { it.toDto() },
)

fun Position.toDto(): PositionDto = PositionDto(
    id = id,
    type = type,
    ticker = ticker,
    shares = shares,
    purchasePrice = purchasePrice,
    currentPrice = currentPrice,
    strike = strike,
    expiration = expiration,
    optionType = optionType,
    contracts = contracts,
    premium = premium,
    amount = amount,
    currency = currency,
)

fun Recommendation.toDto(): RecommendationDto = RecommendationDto(
    id = id,
    type = type,
    ticker = ticker,
    reason = reason,
    confidence = confidence,
    createdAt = createdAt,
)
