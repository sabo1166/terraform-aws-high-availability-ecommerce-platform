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

## Application (`application/`)

- `application/backend`: Fastify + TypeScript + Zod; `Store` interface with `MemoryStore` (tests, local) and `MysqlStore`; money is integer cents; prices, stock, and roles are decided only on the server; no default credentials (admin comes from the seed command with env-provided values); payment is a demo and no card data is ever accepted.
- `application/frontend`: React + TypeScript + Vite, feature folders, a typed API client, cart persisted in `localStorage` and re-priced by the server, lazy 3D hero with an SVG fallback and reduced-motion support.
- Checks: `npm run typecheck`, `npm test`, `npm run build` in each app (Node 22 per `.nvmrc`). Backend MySQL tests need `MYSQL_TEST_*` pointing at a throwaway database whose name ends in `_test`.
- Do not claim the MySQL path or the browser UI works until they have actually been run (neither has been verified locally). Deployment is not implemented; see `docs/runbooks/application-deployment.md` before adding a deploy job.
- Only the two workflow files `terraform.yml` and `application.yml` may exist; application pushes must never trigger `terraform apply`.

## Current state

All 14 modules (including `delivery`, the Phase 1 CodeDeploy foundation: written and validated offline, not planned or applied), `environments/dev`, and the Oriel application exist and validate/test locally. Not done: deploying the application (Phase 2 onward of `docs/architecture/deployment-delivery-design.md`), HTTPS to the origin, scaling policies, Glue table, MySQL and browser verification. `lambda/automation` and a few test/doc directories are empty.
