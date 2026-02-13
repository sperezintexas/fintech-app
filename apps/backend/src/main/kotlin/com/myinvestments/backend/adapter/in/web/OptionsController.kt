package com.myinvestments.backend.adapter.`in`.web

import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/options")
class OptionsController {

    @GetMapping
    fun getChain(@RequestParam symbol: String): ResponseEntity<Map<String, Any>> =
        ResponseEntity.ok(mapOf("symbol" to symbol, "options" to emptyList<Any>()))
}
