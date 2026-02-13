package com.myinvestments.backend.adapter.`in`.web

import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/alerts")
class AlertsController {

    @GetMapping
    fun list(): ResponseEntity<List<*>> = ResponseEntity.ok(emptyList<Any>())
}
