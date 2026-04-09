# Migration Docs

This directory contains the standard migration documentation for deploying and migrating:

1. `payment-kit`
2. `aigne-hub`

in that order.

These docs are environment-agnostic. They can be used for:

- `staging`
- `production`
- other named target environments

Files:

- `MIGRATION_RUNBOOK.md`
  Human-oriented migration and deployment guide.
- `AI_EXECUTION_SPEC.md`
  AI-oriented execution contract with phase gates and stop conditions.
- `deployment-input.example.yaml`
  Example structured input file to be populated with real environment values.

Recommended usage:

1. Read `MIGRATION_RUNBOOK.md` for the overall process.
2. Populate a real execution input file based on `deployment-input.example.yaml`.
3. Use `AI_EXECUTION_SPEC.md` when testing execution-oriented AI agents.
