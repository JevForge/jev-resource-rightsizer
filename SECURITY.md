# Security Policy

## Supported versions

Security fixes are applied to the latest major tag (`v0`, later `v1`, …) and the newest patch release on that line.

## Reporting a vulnerability

Email security reports privately to the JevForge maintainers through GitHub Security Advisories on this repository. Do not open a public issue for credential leaks or RCE-class bugs.

## Hardening notes

- Never commit `AI_GATEWAY_API_KEY`, `TYPESAFE_API_KEY`, `JEV_CUSTOM_API_KEY`, cloud credentials, or Prometheus bearer tokens.
- Prefer `redact_resource_names: true` (default) so resource ids are hashed before Jev and in outputs.
- Treat Issue/PR text and metric labels as untrusted input (prompt-injection surface).
- This action cannot resize infrastructure; do not grant cloud write permissions to the workflow job for this step.
