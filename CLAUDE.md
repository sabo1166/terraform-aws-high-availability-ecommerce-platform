# CLAUDE.md

Guidance for AI assistants working in this repository. See `README.md` for the architecture and layout.

## Workflow

INSPECT -> UNDERSTAND -> PLAN -> IMPLEMENT -> TEST -> VERIFY -> DOCUMENT. Read existing files and `git status` before editing. Preserve existing, working code and staged changes.

## Safety rules

- Never run `terraform plan`, `apply`, or `destroy`, and never use AWS credentials or live AWS APIs, without explicit approval for that action.
- Never change or migrate a backend, and never stage, commit, or push unless asked.
- Never print or commit secrets, state, plans, real `*.tfvars`, or the origin verification secret.
- Do not delete or overwrite user files; do not invent domains, ARNs, endpoints, health paths, or application code.
- Do not claim anything is deployed, working on AWS, or production-ready from local checks.

## Local checks

```powershell
terraform fmt -check -recursive
# validate in an isolated copy outside the repo (init creates .terraform/ and may update the lock file):
terraform init -backend=false ; terraform validate
python -B -m unittest discover -s tests/lambda
python -B -m unittest discover -s modules/automation/tests
```

Use `python -B` so `__pycache__` is not created.

## Conventions

- Each module has `main.tf`, `variables.tf`, `outputs.tf`, `README.md`; add `versions.tf` only when needed (provider aliases, `archive`).
- `##` comments explain important decisions, especially security ones.
- Names are `${project_name}-${environment}-...`; tags are `Project`, `Environment`, `ManagedBy` (plus `Name`/`Tier`).
- Variables have descriptions, types, and validation where useful; no secrets in defaults; secrets are `sensitive`.
- Provider constraints live in `environments/dev/versions.tf` (`aws ~> 5.100`, `archive ~> 2.7`); CloudFront certificates and WAF use the `aws.us_east_1` alias.
- Health-check paths are configured only in the ALB module.
- Keep the alarm logger (`modules/automation/src/`) and the health monitor (`lambda/health-monitor/`) separate; the health monitor must stay read-only.

## Current state

All 13 modules and `environments/dev` exist and validate locally. Not done: application code, CI workflows, remote state in use, HTTPS to the origin, per-tier IAM roles, scaling policies, Glue table. Several placeholder directories are empty.
