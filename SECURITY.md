# Security Policy

Gohan is still an early extraction and should be treated as pre-1.0 software.

## Supported Scope

At this stage, the repository is focused on:

- runtime control-plane contracts
- control-plane runtime state handling
- probe bridge protocol and transport behavior
- browser-worker boundary and mock execution loop

Security review is most useful around:

- remote event ingestion
- runtime identity correlation
- worker and probe trust boundaries
- unsafe assumptions in file, process, or network handling

## Reporting

A dedicated public security contact has not been published yet.

Until one is added:

- do not open a public issue for a sensitive vulnerability
- report it through a private maintainer channel if you already have one
- if no private channel exists, wait to publish exploit details until a maintainer has had a chance to respond

## Expectations

- treat all incoming runtime and probe payloads as untrusted
- prefer explicit allowlists and narrow contracts over permissive parsing
- avoid assuming current mock/demo behavior is production-hardening
