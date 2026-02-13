package com.myinvestments.backend.domain.error

sealed interface DomainError {
    data object NotFound : DomainError
    data class InvalidInput(val message: String) : DomainError
    data class Persistence(val message: String) : DomainError
}
