package com.myinvestments.backend.domain.model

data class Position(
    val id: String? = null,
    val type: String = "stock",
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

data class Recommendation(
    val id: String,
    val type: String,
    val ticker: String,
    val reason: String,
    val confidence: Double,
    val createdAt: String,
)

data class Account(
    val id: String,
    val name: String,
    val accountRef: String? = null,
    val brokerType: String? = null,
    val balance: Double,
    val riskLevel: String,
    val strategy: String,
    val positions: List<Position> = emptyList(),
    val recommendations: List<Recommendation> = emptyList(),
)
