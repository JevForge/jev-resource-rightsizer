# Security Policy

## Supported versions

Security fixes ship on the latest major floating tag (`v0`, later `v1`, …) and the newest patch on that line.

## Reporting a vulnerability

Do **not** open a public Issue for credential leaks, RCE-class bugs, or other critical vulnerabilities.

Use [GitHub Security Advisories](https://github.com/JevForge/jev-resource-rightsizer/security/advisories/new) on this repository when available. Never include live secrets in the report — rotate them first and describe impact with redacted evidence.

## Hardening notes for consumers

* Never commit `AI_GATEWAY_API_KEY`, `TYPESAFE_API_KEY`, `JEV_CUSTOM_API_KEY`, cloud credentials, or `PROMETHEUS_BEARER_TOKEN`.
* Prefer `redact_resource_names: true` (default) so resource ids are hashed before Jev and in outputs.
* Treat Issue/PR text and metric labels as untrusted (prompt-injection surface).
* This Action cannot resize infrastructure; do not grant cloud write permissions to the workflow job solely for this step.
* Prefer pinned tags (`@v0.1.1`) in production workflows.
