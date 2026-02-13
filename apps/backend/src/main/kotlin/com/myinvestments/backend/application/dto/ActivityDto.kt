package com.myinvestments.backend.application.dto

import com.fasterxml.jackson.annotation.JsonProperty
import com.myinvestments.backend.domain.model.Activity

data class ActivityDto(
    @JsonProperty("_id") val id: String,
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

data class ActivityImportItemDto(
    val symbol: String,
    val date: String,
    val type: String,
    val quantity: Double,
    val unitPrice: Double,
    val fee: Double? = null,
    val dataSource: String? = null,
    val comment: String? = null,
    val optionType: String? = null,
    val strike: Double? = null,
    val expiration: String? = null,
)

data class ImportActivitiesRequestDto(
    val accountId: String,
    val activities: List<ActivityImportItemDto>,
    val recomputePositions: Boolean = true,
)

data class ImportActivitiesResponseDto(
    val imported: Int,
    val positionsUpdated: Boolean = false,
    val positionsCount: Int = 0,
)

fun Activity.toDto(): ActivityDto = ActivityDto(
    id = id,
    accountId = accountId,
    symbol = symbol,
    type = type,
    date = date,
    quantity = quantity,
    unitPrice = unitPrice,
    fee = fee,
    dataSource = dataSource,
    comment = comment,
    optionType = optionType,
    strike = strike,
    expiration = expiration,
    createdAt = createdAt,
    updatedAt = updatedAt,
)
