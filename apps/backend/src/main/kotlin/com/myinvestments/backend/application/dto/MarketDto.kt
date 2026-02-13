package com.myinvestments.backend.application.dto

data class MarketIndexDto(
    val symbol: String,
    val name: String,
    val price: Double,
    val change: Double,
    val changePercent: Double,
)

data class MarketConditionsDto(
    val status: String,
    val indices: List<MarketIndexDto>,
    val lastUpdated: String,
)
