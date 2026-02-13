package com.myinvestments.backend.domain.model

data class Activity(
    val id: String,
    val accountId: String,
    val symbol: String,
    val type: String,
    val date: String,
    val quantity: Double,
    val unitPrice: Double,
    val fee: Double? = null,
    val dataSource: String? = null,
    val comment: String? = null,
    val optionType: String? = null,
    val strike: Double? = null,
    val expiration: String? = null,
    val createdAt: String,
    val updatedAt: String,
)
