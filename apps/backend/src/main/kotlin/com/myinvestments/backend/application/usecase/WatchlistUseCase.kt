package com.myinvestments.backend.application.usecase

import arrow.core.Either
import com.myinvestments.backend.application.port.WatchlistRepository
import com.myinvestments.backend.domain.error.DomainError
import com.myinvestments.backend.domain.model.Watchlist
import org.springframework.stereotype.Component

@Component
class WatchlistUseCase(private val watchlistRepository: WatchlistRepository) {

    fun list(): Either<DomainError, List<Watchlist>> = watchlistRepository.findAll()
    fun create(name: String, purpose: String): Either<DomainError, Watchlist> =
        watchlistRepository.insert(name.trim(), purpose.trim())
}
