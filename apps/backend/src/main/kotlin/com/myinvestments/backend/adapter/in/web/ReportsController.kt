package com.myinvestments.backend.adapter.`in`.web

import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/reports")
class ReportsController {

    @GetMapping
    fun list(): ResponseEntity<Map<String, Any>> = ResponseEntity.ok(emptyMap())
}
