# Security Policy

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| 0.6.x   | Yes                |
| < 0.6   | No                 |

## Security Design

Charmera Companion is designed with privacy and security as core principles:

- **100% local processing** — no data leaves your machine
- **No network calls** except to local Ollama (localhost:11434)
- **No cloud, no telemetry, no analytics**
- **Parameterized SQL** — all database queries use prepared statements
- **Path sanitization** — AI-generated filenames are sanitized before rename
- **No shell commands** — all operations use Rust standard library
- **Solid.js text escaping** — AI-generated text is rendered as text nodes, not
  HTML, and the frontend uses no `innerHTML`. Note that the Tauri webview runs
  with `"csp": null` (`crates/charmera-app/tauri.conf.json`), so there is no
  Content-Security-Policy backstop; escaping is the only layer here, not
  defence in depth. Setting a CSP is tracked as a hardening task.

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do not** open a public issue
2. Report it privately through
   [GitHub Security Advisories](https://github.com/h3qing/Kodak-Charmera-Companion/security/advisories/new)
   — this is the only supported reporting channel, and it keeps the report
   visible to the maintainer alone until a fix ships
3. Include steps to reproduce and potential impact
4. Allow reasonable time for a fix before public disclosure

Expect an acknowledgement within 7 days. This is a small hobby project with no
formal SLA or bug bounty.

## Scope

Security concerns for this project include:
- Path traversal in file rename operations
- SQL injection in search or catalog queries
- Arbitrary file read/write via Tauri IPC commands
- XSS through AI-generated descriptions rendered in the UI

Out of scope:
- Vulnerabilities in Ollama itself
- Physical access to the machine
- Social engineering
