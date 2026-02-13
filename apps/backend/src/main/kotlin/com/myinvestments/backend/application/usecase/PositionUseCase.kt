package com.myinvestments.backend.application.usecase

import arrow.core.Either
import arrow.core.flatMap
import com.myinvestments.backend.application.port.AccountRepository
import com.myinvestments.backend.domain.error.DomainError
import com.myinvestments.backend.domain.model.Account
import com.myinvestments.backend.domain.model.Position
import org.bson.types.ObjectId
import org.springframework.stereotype.Component

@Component
class PositionUseCase(private val accountRepository: AccountRepository) {

    fun getPositions(accountId: String): Either<DomainError, Pair<List<Position>, Boolean>> =
        accountRepository.findById(accountId).map { account ->
            val positions = account?.positions ?: emptyList()
            val hasActivities = false
            positions to hasActivities
        }

    fun createPosition(accountId: String, position: Position): Either<DomainError, Position> =
        accountRepository.findById(accountId).flatMap { account: Account? ->
            if (account == null) Either.Left(DomainError.NotFound)
            else {
                val newId = ObjectId().toString()
                val newPos = position.copy(id = newId)
                val updated = account.copy(positions = account.positions + newPos)
                accountRepository.update(accountId, updated).map { newPos }
            }
        }

    fun getPosition(accountId: String, positionId: String): Either<DomainError, Position?> =
        accountRepository.findById(accountId).map { account ->
            account?.positions?.find { it.id == positionId }
        }

    fun updatePosition(accountId: String, positionId: String, position: Position): Either<DomainError, Position?> =
        accountRepository.findById(accountId).flatMap { account: Account? ->
            if (account == null) Either.Left(DomainError.NotFound)
            else {
                val idx = account.positions.indexOfFirst { p -> p.id == positionId }
                if (idx < 0) Either.Left(DomainError.NotFound)
                else {
                    val updatedPos = position.copy(id = positionId)
                    val newPositions = account.positions.toMutableList()
                    newPositions[idx] = updatedPos
                    accountRepository.update(accountId, account.copy(positions = newPositions)).map { updatedPos }
                }
            }
        }

    fun deletePosition(accountId: String, positionId: String): Either<DomainError, Boolean> =
        accountRepository.findById(accountId).flatMap { account: Account? ->
            if (account == null) Either.Left(DomainError.NotFound)
            else {
                val newPositions = account.positions.filter { it.id != positionId }
                if (newPositions.size == account.positions.size) Either.Left(DomainError.NotFound)
                else accountRepository.update(accountId, account.copy(positions = newPositions)).map { true }
            }
        }

    fun closePosition(
        accountId: String,
        positionId: String,
        quantity: Int,
        pricePerContract: Double,
    ): Either<DomainError, ClosePositionResult> =
        accountRepository.findById(accountId).flatMap { account: Account? ->
            if (account == null) Either.Left(DomainError.NotFound)
            else {
                val pos = account.positions.find { it.id == positionId }
                    ?: return@flatMap Either.Left(DomainError.NotFound)
                if (pos.type != "option") return@flatMap Either.Left(DomainError.InvalidInput("Buy to close is only valid for option positions"))
                val contracts = pos.contracts ?: 0
                if (quantity > contracts) return@flatMap Either.Left(DomainError.InvalidInput("Quantity cannot exceed position size ($contracts contracts)"))
                val costToClose = quantity * pricePerContract * 100
                val premiumReceived = quantity * (pos.premium ?: 0.0) * 100
                val newBalance = account.balance + premiumReceived - costToClose
                val newPositions = if (quantity == contracts) {
                    account.positions.filter { p -> p.id != positionId }
                } else {
                    account.positions.map { p -> if (p.id == positionId) p.copy(contracts = contracts - quantity) else p }
                }
                val updated = account.copy(positions = newPositions, balance = newBalance)
                accountRepository.update(accountId, updated).map {
                    ClosePositionResult(
                        success = true,
                        action = if (quantity == contracts) "removed" else "reduced",
                        positionId = positionId,
                        quantity = quantity,
                        remainingContracts = if (quantity == contracts) null else contracts - quantity,
                        costToClose = costToClose,
                        newBalance = newBalance,
                    )
                }
            }
        }
}

data class ClosePositionResult(
    val success: Boolean,
    val action: String,
    val positionId: String,
    val quantity: Int,
    val remainingContracts: Int?,
    val costToClose: Double,
    val newBalance: Double,
)
