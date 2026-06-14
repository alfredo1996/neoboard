# Security Policy

## Supported Versions

| Version | Supported                       |
| ------- | ------------------------------- |
| 2.x     | :white_check_mark:              |
| 1.x     | :hammer_and_wrench: maintenance |
| < 1.0   | :x:                             |

## Reporting a Vulnerability

**Please do NOT report security vulnerabilities through public GitHub issues.**

Instead, use [GitHub Security Advisories](https://github.com/alfredo1996/neoboard/security/advisories/new) to report vulnerabilities privately. This ensures the issue is handled confidentially before public disclosure.

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response Timeline

- **Acknowledgment**: within 48 hours
- **Initial assessment**: within 1 week
- **Fix or mitigation**: within 30 days for critical issues

## Security Architecture

NeoBoard handles database credentials and user authentication. Key security measures:

### Credentials

- All database credentials are encrypted at rest using **AES-256-GCM** with the 32-byte `ENCRYPTION_KEY` used directly as the key (no HKDF derivation, no envelope wrapping); each ciphertext uses a unique IV and an auth tag, and key rotation is supported via `ENCRYPTION_KEY_OLD`
- The `ENCRYPTION_KEY` environment variable is never stored in the database
- **Lost ENCRYPTION_KEY = all credentials unrecoverable** — there is no recovery mechanism by design
- Decrypted credentials are never logged

### Authentication

- Auth.js v5 with bcrypt password hashing
- JWT tokens include `tenantId` claim
- Session validation on every API request

### Multi-Tenancy

- `tenant_id` column on all database tables
- Every query includes tenant filter at ORM/middleware level
- Cross-tenant access is prevented at the database layer

### Query Safety

- All user queries use parameterized statements (never string interpolation)
- PostgreSQL: `BEGIN READ ONLY` transactions for non-write widgets
- Neo4j: session access modes enforce read/write separation
- Row limits enforced at driver level (MAX_ROWS+1 pattern)
- Query timeouts enforced at driver level (default 30s)

## Responsible Disclosure

We follow responsible disclosure practices. After a fix is released, we will:

1. Credit the reporter (unless they prefer anonymity)
2. Publish a security advisory on GitHub
3. Include the fix in the next release with a changelog entry
