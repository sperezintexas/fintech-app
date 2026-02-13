package com.myinvestments.backend.bootstrap

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication

@SpringBootApplication(scanBasePackages = ["com.myinvestments.backend"])
class Application

fun main(args: Array<String>) {
    runApplication<Application>(*args)
}
