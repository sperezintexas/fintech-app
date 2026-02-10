# Security Policy

## Overview

myInvestments is a fintech application that handles sensitive financial data. This document outlines our security practices, vulnerability reporting procedures, and implemented security controls.

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

### How to Report

1. **Email**: Send details to the repository maintainers via GitHub Security Advisories
2. **GitHub Security Advisory**: Use the "Report a vulnerability" feature in the Security tab

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response Timeline

- **Initial Response**: Within 48 hours
- **Triage**: Within 5 business days
- **Resolution**: Depends on severity (Critical: 7 days, High: 30 days, Medium: 90 days)

### Safe Harbor

We consider security research conducted in good faith to be authorized. We will not pursue legal action against researchers who:

- Act in good faith
- Avoid privacy violations
- Do not access or modify user data
- Report findings responsibly

## Security Architecture

### Authentication

- **OAuth 2.0**: Twitter/X authentication via NextAuth.js v5
- **Credentials**: Email/password with scrypt hashing (64-byte key, 16-byte salt)
- **Access Keys**: SHA-256 hashed, stored in MongoDB
- **Session**: JWT-based with secure, httpOnly cookies

### Authorization

- **Route Protection**: Next.js middleware enforces authentication on protected routes
- **API Protection**: All sensitive API routes require valid session
- **Username Allowlist**: X authentication restricted to approved usernames

### Data Protection

- **At Rest**: MongoDB with appropriate access controls
- **In Transit**: HTTPS enforced in production (HSTS enabled)
- **Secrets**: Environment variables, never committed to repository

## Security Controls

### Input Validation

All user input is validated using:

1. **Zod Schemas** (`src/lib/api-schemas.ts`): Type-safe validation for API inputs
2. **Sanitization** (`src/lib/security.ts`): NoSQL injection prevention, XSS escaping
3. **ObjectId Validation**: MongoDB IDs validated before use in queries

```typescript
// Example: Always validate input before database queries
import { createAccountSchema } from "@/lib/api-schemas";
import { sanitizeMongoValue } from "@/lib/security";

const validated = createAccountSchema.parse(body);
const sanitized = sanitizeMongoValue(validated);
```

### NoSQL Injection Prevention

MongoDB queries are protected against injection attacks:

- **Operator Rejection**: User input containing `$` operators is rejected
- **Type Checking**: Values are type-checked before query construction
- **Parameterized Queries**: Native MongoDB driver with proper parameter binding

### XSS Prevention

- **React**: Automatic escaping of rendered content
- **No dangerouslySetInnerHTML**: Forbidden in codebase (enforced by code review)
- **Content Security Policy**: Restricts script execution sources
- **Input Sanitization**: HTML entities escaped in user-generated content

### Security Headers

Implemented via Next.js middleware and config:

| Header | Value | Purpose |
|--------|-------|---------|
| X-Frame-Options | DENY | Prevent clickjacking |
| X-Content-Type-Options | nosniff | Prevent MIME sniffing |
| X-XSS-Protection | 1; mode=block | Enable XSS filter |
| Content-Security-Policy | [see config] | Control resource loading |
| Strict-Transport-Security | max-age=31536000 | Enforce HTTPS |
| Referrer-Policy | strict-origin-when-cross-origin | Control referrer info |
| Permissions-Policy | camera=(), microphone=()... | Disable unused features |

### Rate Limiting

- **Global**: 100 requests/minute per IP (middleware)
- **Chat API**: 20 messages/minute per IP
- **Login**: 3 attempts per IP in 15-minute window, alerts on 10+ distinct IPs

### Secrets Management

- **Pre-commit Hook**: Gitleaks scans for secrets before commits
- **CI Pipeline**: Gitleaks action scans all commits
- **Environment Variables**: All secrets via env vars, never in code

## Automated Security Scanning

### CI/CD Pipeline (`.github/workflows/security.yml`)

| Tool | Purpose | Frequency |
|------|---------|-----------|
| **Gitleaks** | Secret detection | Every push/PR |
| **npm audit** | Dependency vulnerabilities | Every push/PR |
| **CodeQL** | Static code analysis (SAST) | Every push/PR |
| **Dependency Review** | License & vulnerability check | Every PR |
| **OSV Scanner** | Google's vulnerability database | Every push/PR |
| **Trivy** | Container & filesystem scanning | Every push/PR |

### Daily Scans

Security workflow runs daily at 6 AM UTC to catch newly discovered vulnerabilities.

### Local Development

```bash
# Install pre-commit hooks
pip install pre-commit
pre-commit install

# Run security scans locally
pre-commit run --all-files

# Check for dependency vulnerabilities
pnpm audit
```

## Security Best Practices for Contributors

### Code Review Checklist

- [ ] Input validation using Zod schemas
- [ ] MongoDB queries use `sanitizeMongoValue()` or `buildSafeQuery()`
- [ ] No hardcoded secrets or credentials
- [ ] Authentication required for sensitive endpoints
- [ ] Error messages don't leak sensitive information
- [ ] Logging doesn't include PII or secrets

### Secure Coding Guidelines

1. **Never trust user input**: Always validate and sanitize
2. **Use parameterized queries**: Never concatenate user input into queries
3. **Principle of least privilege**: Request minimum necessary permissions
4. **Defense in depth**: Multiple layers of security controls
5. **Fail securely**: Default to deny, handle errors gracefully

### Adding New API Routes

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { createAccountSchema, formatZodErrors } from "@/lib/api-schemas";
import { sanitizeMongoValue, logSecurityEvent } from "@/lib/security";

export async function POST(request: NextRequest) {
  // 1. Check authentication
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 2. Parse and validate input
    const body = await request.json();
    const validated = createAccountSchema.parse(body);

    // 3. Sanitize for database
    const sanitized = sanitizeMongoValue(validated);

    // 4. Perform operation
    // ...

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: formatZodErrors(error) },
        { status: 400 }
      );
    }

    // 5. Log security events
    logSecurityEvent({
      type: "invalid_input",
      message: "Failed to process request",
      path: "/api/accounts",
    });

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
```

## Incident Response

### Detection

- Automated security alerts from CI/CD
- Login failure spike alerts (10+ distinct IPs)
- Application error monitoring

### Response Process

1. **Identify**: Determine scope and impact
2. **Contain**: Isolate affected systems
3. **Eradicate**: Remove threat
4. **Recover**: Restore normal operations
5. **Document**: Post-incident review

### Contact

For security incidents, contact repository maintainers immediately via GitHub Security Advisories.

## Compliance Considerations

While not certified, this application follows security best practices aligned with:

- OWASP Top 10
- CWE/SANS Top 25
- NIST Cybersecurity Framework

## Third-Party Dependencies

### Security-Critical Dependencies

| Package | Purpose | Security Notes |
|---------|---------|----------------|
| next-auth | Authentication | OAuth 2.0, PKCE support |
| mongodb | Database | TLS by default, SCRAM-SHA-256 |
| zod | Validation | Type-safe input validation |
| crypto (Node.js) | Cryptography | scrypt, timingSafeEqual |

### Dependency Updates

- Automated via Dependabot
- npm audit in CI pipeline
- Manual review for major updates

## Changelog

- **2026-02-10**: Added comprehensive security middleware, input validation schemas, and enhanced CI security scanning
- **Initial**: Basic authentication and secret scanning

---

*Last updated: February 2026*
