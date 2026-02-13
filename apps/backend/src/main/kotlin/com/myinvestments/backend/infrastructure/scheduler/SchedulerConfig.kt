package com.myinvestments.backend.infrastructure.scheduler

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.scheduling.annotation.EnableScheduling
import org.springframework.web.client.RestTemplate

@Configuration
@ConditionalOnProperty(name = ["app.scheduler.nextjs.url"], matchIfMissing = false)
@EnableScheduling
class SchedulerConfig {

    @Bean
    fun restTemplate(): RestTemplate = RestTemplate()
}
