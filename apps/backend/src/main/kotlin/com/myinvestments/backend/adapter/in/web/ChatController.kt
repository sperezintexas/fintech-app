package com.myinvestments.backend.adapter.`in`.web

import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/chat")
class ChatController {

    @GetMapping("/config")
    fun getConfig(): ResponseEntity<Map<String, Any>> = ResponseEntity.ok(emptyMap())

    @GetMapping("/history")
    fun getHistory(): ResponseEntity<List<*>> = ResponseEntity.ok(emptyList<Any>())

    @PostMapping
    fun send(@RequestBody body: Map<String, Any>): ResponseEntity<Map<String, Any>> =
        ResponseEntity.status(501).body(mapOf("error" to "Chat not yet implemented in backend"))
}
