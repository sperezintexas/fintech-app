package com.myinvestments.backend.infrastructure.scheduler

import arrow.core.fold
import com.myinvestments.backend.application.dto.ReportTaskScheduleDto
import com.myinvestments.backend.application.port.ReportTaskPort
import com.myinvestments.backend.application.port.RunTaskPort
import org.slf4j.LoggerFactory
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.scheduling.support.CronExpression
import org.springframework.stereotype.Component
import com.myinvestments.backend.domain.error.DomainError
import java.time.Instant
import java.time.ZoneOffset
import java.time.ZonedDateTime

private val log = LoggerFactory.getLogger(ReportTaskScheduler::class.java)

/**
 * Every minute, loads active report tasks from MongoDB and triggers run-task for any task
 * whose cron schedule is due (UTC). Uses Spring's CronExpression (6-field: second minute hour day month dow).
 * Converts 5-field cron from frontend to 6-field by prepending "0 ".
 */
@Component
@ConditionalOnBean(RunTaskPort::class)
class ReportTaskScheduler(
    private val reportTaskPort: ReportTaskPort,
    private val runTaskPort: RunTaskPort,
) {

    @Scheduled(cron = "0 * * * * ?") // every minute at second 0
    fun triggerDueReportTasks() {
        reportTaskPort.findActiveScheduledTasks().fold(
            { err: DomainError ->
                log.warn("Report tasks load failed: {}", err)
            },
            { tasks: List<ReportTaskScheduleDto> ->
                val now = ZonedDateTime.now(ZoneOffset.UTC)
                for (task in tasks) {
                    if (isDue(task, now)) {
                        runTaskPort.runTask(task.id).fold(
                            { err: DomainError ->
                                log.warn("runTask {} failed: {}", task.id, err)
                            },
                            { _: Unit -> log.debug("Triggered task {}", task.id) },
                        )
                    }
                }
            },
        )
    }

    private fun isDue(task: ReportTaskScheduleDto, now: ZonedDateTime): Boolean {
        val cron6 = toSixFieldCron(task.scheduleCron) ?: return false
        val expression = try {
            CronExpression.parse(cron6)
        } catch (_: Exception) {
            return false
        }
        val after = task.lastRunAt?.let { Instant.parse(it).atZone(ZoneOffset.UTC) } ?: now.minusMinutes(2)
        val next = expression.next(after) ?: return false
        // Due if next run is in the past or within this minute
        return !next.isAfter(now.plusSeconds(30))
    }

    /**
     * Frontend stores 5-field cron (minute hour day month dow). Spring expects 6-field (second minute hour day month dow).
     */
    private fun toSixFieldCron(cron: String): String? {
        val trimmed = cron.trim()
        if (trimmed.isBlank()) return null
        val parts = trimmed.split(Regex("\\s+"))
        return if (parts.size == 5) "0 $trimmed" else if (parts.size == 6) trimmed else null
    }
}
