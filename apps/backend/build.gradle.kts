plugins {
    id("org.jetbrains.kotlin.jvm") version "2.0.21"
    id("org.jetbrains.kotlin.plugin.spring") version "2.0.21"
    id("org.springframework.boot") version "3.4.4"
    id("io.spring.dependency-management") version "1.1.6"
}

group = "com.myinvestments"
version = "2.0.0"

java {
    sourceCompatibility = JavaVersion.VERSION_21
    targetCompatibility = JavaVersion.VERSION_21
}

repositories {
    mavenCentral()
}

dependencies {
    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.springframework.boot:spring-boot-starter-validation")
    implementation("org.springframework.boot:spring-boot-starter-actuator")
    implementation("org.springframework.boot:spring-boot-starter-oauth2-resource-server")
    implementation("org.springframework.boot:spring-boot-starter-security")
    implementation("org.springframework.boot:spring-boot-starter-data-mongodb")
    implementation("com.fasterxml.jackson.module:jackson-module-kotlin")
    implementation("org.jetbrains.kotlin:kotlin-reflect")
    implementation("org.jetbrains.kotlin:kotlin-stdlib")

    implementation("io.arrow-kt:arrow-core:1.2.1")
    implementation("io.arrow-kt:arrow-fx-coroutines:1.2.1")

    implementation("org.springdoc:springdoc-openapi-starter-webmvc-ui:2.7.0")

    implementation("io.github.microutils:kotlin-logging-jvm:3.0.5")

    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

// Load .env or .env.local into bootRun (single source of truth at repo root); optional fallback: ~/.gradle/gradle.properties
val backendEnvKeys = listOf(
    "MONGODB_URI", "MONGODB_DB", "SERVER_PORT", "APP_VERSION",
    "SCHEDULER_ENABLED", "NEXTJS_URL", "CRON_SECRET"
)
tasks.named<org.springframework.boot.gradle.tasks.run.BootRun>("bootRun") {
    val envFile = sequenceOf(
        project.file(".env.local"), project.file(".env"),
        rootProject.file(".env.local"), rootProject.file(".env"),
        project.rootDir.parentFile?.resolve(".env.local"), project.rootDir.parentFile?.resolve(".env"),
        project.rootDir.parentFile?.parentFile?.resolve(".env.local"), project.rootDir.parentFile?.parentFile?.resolve(".env")
    ).firstOrNull { it?.exists() == true }
    if (envFile != null) {
        envFile.readLines()
            .filter { it.isNotBlank() && !it.trimStart().startsWith("#") }
            .map { line ->
                val idx = line.indexOf('=')
                if (idx > 0) line.substring(0, idx).trim() to line.substring(idx + 1).trim().trim('"').trim('\'')
                else null
            }
            .filterNotNull()
            .forEach { (k, v) -> environment(k, v) }
    }
    backendEnvKeys.forEach { key ->
        project.findProperty(key)?.toString()?.takeIf { it.isNotBlank() }?.let { environment(key, it) }
    }
}

tasks.withType<Test> {
    useJUnitPlatform()
}

tasks.withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile>().configureEach {
    kotlinOptions {
        jvmTarget = "21"
        freeCompilerArgs = listOf("-Xjsr305=strict", "-opt-in=kotlin.RequiresOptIn")
    }
}
