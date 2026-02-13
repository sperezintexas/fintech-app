package com.myinvestments.backend.application.dto

data class HealthCheckDto(
    val status: String,
    val message: String? = null,
    val latencyMs: Long? = null,
    val connectionDisplay: String? = null,
    val database: String? = null,
)

data class HealthResponseDto(
    val status: String,
    val version: String? = null,
    val timestamp: String,
    val checks: Map<String, HealthCheckDto> = emptyMap(),
)

data class LiveResponseDto(
    val status: String = "ok",
    val timestamp: String,
)
