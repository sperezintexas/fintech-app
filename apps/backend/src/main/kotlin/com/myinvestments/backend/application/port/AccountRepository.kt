package com.myinvestments.backend.application.port

import com.myinvestments.backend.domain.model.Account
import arrow.core.Either
import com.myinvestments.backend.domain.error.DomainError

interface AccountRepository {
    fun findAll(): Either<DomainError, List<Account>>
    fun findById(id: String): Either<DomainError, Account?>
    fun insert(account: Account): Either<DomainError, Account>
    fun update(id: String, account: Account): Either<DomainError, Account?>
    fun delete(id: String): Either<DomainError, Boolean>
}
