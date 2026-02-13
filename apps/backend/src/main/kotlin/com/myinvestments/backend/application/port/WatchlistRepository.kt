package com.myinvestments.backend.application.port

import arrow.core.Either
import com.myinvestments.backend.domain.error.DomainError
import com.myinvestments.backend.domain.model.Watchlist

interface WatchlistRepository {
    fun findAll(): Either<DomainError, List<Watchlist>>
    fun insert(name: String, purpose: String): Either<DomainError, Watchlist>
}
