package com.myinvestments.backend.application.usecase

import arrow.core.Either
import com.myinvestments.backend.application.dto.ActivityImportItemDto
import com.myinvestments.backend.application.port.AccountRepository
import com.myinvestments.backend.application.port.ActivityRepository
import com.myinvestments.backend.domain.error.DomainError
import com.myinvestments.backend.domain.model.Activity
import org.springframework.stereotype.Component
import java.time.Instant

@Component
class ImportActivitiesUseCase(
    private val activityRepository: ActivityRepository,
    private val accountRepository: AccountRepository,
) {

    fun importActivities(
        accountId: String,
        items: List<ActivityImportItemDto>,
        recomputePositions: Boolean,
    ): Either<DomainError, ImportResult> {
        if (items.isEmpty()) return Either.Right(ImportResult(imported = 0, positionsUpdated = false, positionsCount = 0))
        val account = accountRepository.findById(accountId).fold(
            { err -> return Either.Left(err) },
            { acc -> acc }
        ) ?: return Either.Left(DomainError.NotFound)
        val validTypes = setOf("BUY", "SELL", "DIVIDEND", "FEE", "INTEREST", "LIABILITY")
        val now = Instant.now().toString()
        val activities = items.map { item ->
            Activity(
                id = "",
                accountId = accountId,
                symbol = item.symbol.uppercase().trim(),
                type = if (item.type in validTypes) item.type else "BUY",
                date = item.date,
                quantity = item.quantity,
                unitPrice = item.unitPrice,
                fee = item.fee,
                dataSource = item.dataSource ?: "IMPORT",
                comment = item.comment,
                optionType = item.optionType,
                strike = item.strike,
                expiration = item.expiration,
                createdAt = now,
                updatedAt = now,
            )
        }
        return activityRepository.insertMany(activities).map { imported ->
            ImportResult(
                imported = imported,
                positionsUpdated = recomputePositions && imported > 0,
                positionsCount = account.positions.size,
            )
        }
    }
}

data class ImportResult(
    val imported: Int,
    val positionsUpdated: Boolean,
    val positionsCount: Int,
)
