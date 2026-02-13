package com.myinvestments.backend.application.usecase

import arrow.core.Either
import arrow.core.flatMap
import com.myinvestments.backend.application.dto.AccountCreateDto
import com.myinvestments.backend.application.dto.AccountUpdateDto
import com.myinvestments.backend.application.port.AccountRepository
import com.myinvestments.backend.domain.error.DomainError
import com.myinvestments.backend.domain.model.Account
import com.myinvestments.backend.domain.model.Position
import com.myinvestments.backend.domain.model.Recommendation
import org.springframework.stereotype.Component

@Component
class AccountUseCases(private val repository: AccountRepository) {

    fun getAll(): Either<DomainError, List<Account>> = repository.findAll()

    fun getById(id: String): Either<DomainError, Account?> = repository.findById(id)

    fun create(dto: AccountCreateDto): Either<DomainError, Account> {
        val account = Account(
            id = "", // repository will assign
            name = dto.name.trim(),
            accountRef = dto.accountRef?.takeIf { it.isNotBlank() }?.trim(),
            brokerType = validBrokerType(dto.brokerType),
            balance = dto.balance,
            riskLevel = validRiskLevel(dto.riskLevel),
            strategy = validStrategy(dto.strategy),
            positions = emptyList(),
            recommendations = emptyList(),
        )
        return repository.insert(account)
    }

    fun update(id: String, dto: AccountUpdateDto): Either<DomainError, Account?> =
        repository.findById(id).flatMap { existing ->
            if (existing == null) Either.Left(DomainError.NotFound)
            else {
                val updated = existing.copy(
                    name = dto.name?.trim() ?: existing.name,
                    accountRef = when {
                        dto.accountRef == null -> existing.accountRef
                        dto.accountRef.isBlank() -> null
                        else -> dto.accountRef.trim()
                    },
                    brokerType = dto.brokerType?.let { validBrokerType(it) } ?: existing.brokerType,
                    balance = dto.balance ?: existing.balance,
                    riskLevel = dto.riskLevel?.let { validRiskLevel(it) } ?: existing.riskLevel,
                    strategy = dto.strategy?.let { validStrategy(it) } ?: existing.strategy,
                )
                repository.update(id, updated)
            }
        }

    fun delete(id: String): Either<DomainError, Boolean> = repository.delete(id)

    private fun validBrokerType(v: String?): String? =
        if (v == "Merrill" || v == "Fidelity") v else null

    private fun validRiskLevel(v: String): String =
        if (v in listOf("low", "medium", "high")) v else "medium"

    private fun validStrategy(v: String): String =
        if (v in listOf("growth", "income", "balanced", "aggressive")) v else "balanced"
}
