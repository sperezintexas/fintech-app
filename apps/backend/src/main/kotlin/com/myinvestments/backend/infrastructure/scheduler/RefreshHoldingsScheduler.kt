package com.myinvestments.backend.infrastructure.scheduler

import arrow.core.fold
import com.myinvestments.backend.application.port.RunTaskPort
import com.myinvestments.backend.domain.error.DomainError
import org.slf4j.LoggerFactory
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component

private val log = LoggerFactory.getLogger(RefreshHoldingsScheduler::class.java)

/**
 * Triggers refreshHoldingsPrices on the Next.js app every 15 minutes.
 * Throttling outside market hours is handled by the Next.js runBuiltInJob.
 */
@Component
@ConditionalOnBean(RunTaskPort::class)
class RefreshHoldingsScheduler(private val runTaskPort: RunTaskPort) {

    @Scheduled(fixedDelayString = "\${app.scheduler.refresh-holdings-interval:900000}") // 15 min default
    fun triggerRefreshHoldings() {
        runTaskPort.runBuiltInJob("refreshHoldingsPrices", lastRun = null).fold(
            { err: DomainError ->
                log.warn("refreshHoldingsPrices trigger failed: {}", err)
            },
            { _: Unit -> log.debug("Triggered refreshHoldingsPrices") },
        )
    }
}
