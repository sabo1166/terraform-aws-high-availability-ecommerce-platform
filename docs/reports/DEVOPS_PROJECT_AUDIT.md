# DevOps Project Audit — terraform-aws-high-availability-ecommerce-platform

Refreshed 2026-10-22 from the current working tree and index. Evidence is labelled **code** (read in the repository), **local** (a command run on this machine, no AWS access), or **untested** (not verified anywhere). **Nothing has been planned, applied, or run on AWS**, so no resource is deployed and no runtime behavior is verified.

## 1. Executive summary

All 13 modules and `environments/dev` are implemented and pass local `terraform fmt -check`, `init -backend=false`, and `validate`. The two Lambda functions have Python unit tests that pass against mocked AWS responses only. The project is **not production-ready**: there is no application code, no CI, no remote state in use, plain HTTP between CloudFront and the ALB, and no AWS runtime verification of any kind.

## 2. Repository and Git state

- 80 files are staged and the working tree matches the index (`git diff --name-only` is empty). `git diff --cached --check` reports no whitespace errors. The documentation and `.gitignore` edits made after that are not yet staged.
- Not staged by design: `docs/reports/` (this report) until reviewed.
- No secrets matched a scan for AWS key patterns, private keys, and `password = "..."`. No state, plan, `*.tfvars`, `__pycache__`, or `build/` files are tracked. `.terraform/` directories exist locally in `bootstrap/` and `environments/dev/` but are gitignored.
- `core.autocrlf=true` produces LF-to-CRLF warnings; they are not errors but conflict with `.editorconfig` (`end_of_line = lf`).

## 3. Architecture found in the code

Route 53 -> CloudFront + ACM + WAF -> public ALB -> frontend ASG -> internal ALB -> backend ASG -> RDS MySQL Multi-AZ.

| Layer | Module | Implemented in code |
| --- | --- | --- |
| VPC, 2 AZs, public/app/db subnets, NAT | `network` | yes (single NAT by default) |
| Security group chain by reference | `security` | yes |
| EC2 role/profile, Lambda role | `iam` | yes |
| ALB access logs bucket, Athena workgroup, Glue database | `logging` | yes (no Glue table) |
| Public and internal ALBs, target groups, HTTP listeners | `alb` | yes (optional access logs and origin-header check) |
| Frontend/backend launch templates and ASGs | `compute` | yes (placeholder bootstrap) |
| RDS MySQL | `database` | yes |
| Alarms and encrypted SNS topic | `monitoring` | yes |
| Alarm logger and read-only health monitor Lambdas | `automation` | yes |
| ACM, WAF, CloudFront, Route 53 aliases | `acm`, `waf`, `cloudfront`, `dns` | yes (domain and hosted zone required) |

## 4. Inventory

| Path | Status |
| --- | --- |
| `modules/*` (13) | IMPLEMENTED, validated locally, not deployed |
| `environments/dev/*` | IMPLEMENTED, validated locally, not deployed |
| `bootstrap/*` | IMPLEMENTED, validated locally, not applied |
| `lambda/health-monitor/health_monitor.py` | IMPLEMENTED, unit-tested with mocks |
| `modules/automation/src/alarm_logger.py` | IMPLEMENTED, unit-tested with mocks |
| `README.md`, `CLAUDE.md` | written in this refresh |
| `application/frontend`, `application/backend` | EMPTY, no application code |
| `lambda/automation`, `tests/application`, `tests/terraform`, `docs/architecture`, `docs/runbooks`, `.github/workflows` | EMPTY |
| `.serena/` | local tooling workspace, now gitignored |

## 5. Local test results

| Check | Result |
| --- | --- |
| `python -I -B -m unittest discover -s tests/lambda` | 10 tests, OK (mocked) |
| `python -I -B -m unittest discover -s modules/automation/tests` | 8 tests, OK |
| `terraform fmt -check -recursive` | exit 0 |
| `init -backend=false` + `validate`: `environments/dev`, `bootstrap`, and each module in an isolated copy | valid |
| `validate` with the health monitor disabled (wrapper) | valid |
| Zip contents of the two Lambda packages | not inspected: `archive_file` is a plan-time data source |

These are static checks. `validate` does not prove resources can be created, and the Python tests do not exercise real AWS, SNS, EventBridge, or ELBv2 responses.

## 6. Findings

### Confirmed by local checks or code

| # | Severity | Finding | Evidence |
| --- | --- | --- | --- |
| 1 | High | CloudFront reaches the ALB over plain HTTP, so the origin secret header and traffic cross the internet unencrypted. The public ALB group is open to `0.0.0.0/0` on 80 and 443. | `modules/cloudfront/main.tf:41`; `modules/security/main.tf:16-30` (code) |
| 2 | High | Dev has no state backend; `backend.tf.example` is only an example and the bootstrap stack is unapplied. State would be local and unlocked, and holds the origin secret. | `environments/dev` (code) |
| 3 | ~~Medium~~ Resolved | Dev `required_version` was `>= 1.6.0` while `use_lockfile` needs 1.10 or later; it is now `>= 1.10.0` (see section 11). | `environments/dev/versions.tf` (code) |
| 4 | Medium | No application, CI workflow, or Glue table exists; several placeholder directories are empty. | Section 4 |
| 5 | Medium | All private security groups allow egress to `0.0.0.0/0`, including the database group. | `modules/security/main.tf:68, 99, 130, 161` |
| 6 | Medium | The shared EC2 role serves both tiers and has no access to the database secret, so the backend cannot fetch credentials; per-tier roles are needed first. | `modules/iam/main.tf:40`; `modules/database/README.md` |
| 7 | Medium | No ASG scaling policies, so `max_size` is never used. | `modules/compute/main.tf` |
| 8 | Medium | The AMI is unpinned by default; a new Amazon Linux 2023 release triggers a rolling replacement on the next apply. | `modules/compute/main.tf:128`, `variables.tf` |
| 9 | Low | A single NAT carries all AWS API traffic (no VPC endpoints): availability and cost risk. | `modules/network/main.tf:115-130` |
| 10 | Low | No alarms on Lambda `Errors`; no VPC flow logs, CloudFront or WAF logs; log bucket has no versioning. | code |

### Possible risks (not verified on AWS)

- Instances may fail ELB health checks and be replaced in a loop, because the bootstrap installs no application. The apply-time wait is now `0` in dev (the module default stays `10m`), so apply will not block or fail on this; the unhealthy targets only show in the alarms and health monitor logs (section 11).
- Unhealthy-host alarms will fire until an application serves the health-check path.
- The customer-managed key on the alarm SNS topic is intended to work with CloudWatch alarms and the Lambda subscription; not tested.
- The health monitor log policy uses `"${log_group.arn}:*"`; I expect the provider ARN to have no suffix, but this was not checked locally.
- `engine_version = "8.0"` (major only) and the `db.t3.micro` Multi-AZ combination are unchecked against AWS.
- The ELB log bucket policy supports only regions that use a regional ELB account ID (for example `us-east-1`).
- ACM validation fails unless the supplied hosted zone is authoritative for the domain.

## 7. Cost drivers (not estimated)

Two ALBs, a NAT Gateway plus per-GB processing, four t3.micro instances, Multi-AZ RDS and its Secrets Manager secret, WAF (web ACL and rules), CloudFront, a KMS key, CloudWatch alarms and logs, and Athena queries.

## 8. Missing requirements

Application code and deployment artifacts; health endpoints; a real domain and hosted zone; HTTPS to the origin; per-tier IAM roles; scaling policies; CI; a Glue table; runbooks and architecture documents.

## 9. Remediation plan

- **P0:** ~~raise dev `required_version` to 1.10 or later~~ (done); ~~set the compute capacity wait to `0` in dev until an application exists~~ (done); **still open:** apply the bootstrap stack and configure the dev backend with human approval, following the sequence in `bootstrap/README.md`.
- **P1:** regional certificate, HTTPS listener, origin DNS name, `https-only`, and restrict the public ALB group to the CloudFront prefix list; per-tier IAM roles and database secret access; tighten security-group egress and add VPC endpoints and scaling policies; add a CI workflow for `fmt`, `validate`, and the tests.
- **P2:** Glue table, flow/CloudFront/WAF logging, Lambda error alarms, pin `ami_id`, align test layout.
- Then review a real `terraform plan` and run a human-approved apply in a throwaway environment.

## 10. Verdict

- **Commit:** the Terraform platform, the P0 hardening, and the bootstrap state-bucket work are committed; the application, workflows, and later documentation were committed afterwards (see section 14).
- **Deploy:** **not ready.** Nothing has been verified on AWS and no application exists.

## 11. Local P0 hardening (after the first commit)

Changes (code):

- `environments/dev/versions.tf`: `required_version` raised to `>= 1.10.0` (the local Terraform is v1.16.2; the `aws ~> 5.100` and `archive ~> 2.7` constraints and the lock file are unchanged).
- `environments/dev/variables.tf` and `main.tf`: new `asg_wait_for_capacity_timeout` (default `"0"`) passed to the compute module. The compute module default stays `10m`. ELB health checks and the grace period are unchanged; only Terraform's apply-time wait is disabled, so unhealthy targets are still reported by the alarms and the health monitor but no longer block `apply`. Set it back to a duration once an application serves the health-check path.
- `bootstrap/README.md`: exact remote-state sequence, prerequisites (Terraform 1.10, bucket and object permissions, no DynamoDB), and migration notes. No `terraform.tfstate` exists in `environments/dev/`, so there is nothing to migrate if the backend is configured before the first apply.
- `modules/compute/README.md`: documents the wait behavior.
- `docs/architecture/https-origin-design.md`: proposal only for HTTPS between CloudFront and the ALB (origin hostname, regional ACM certificate, ALB 443 listener, `https-only` origin, CloudFront prefix-list restriction). Not implemented: it needs a confirmed domain, hosted zone, and certificate strategy.

Local results (no AWS access): `terraform fmt -check -recursive` exit 0; Python tests 10 and 8, all OK (mocked); `init -backend=false` and `validate` for `environments/dev` and `bootstrap` in isolated copies both valid; the regenerated dev lock file is identical to the repository copy.

Still open: bootstrap apply and backend configuration (needs approval and credentials), HTTPS to the origin, per-tier IAM roles, scaling policies, security-group egress, CI, application code. None of this has been verified on AWS.

## 12. Application (Oriel demo store), added after the P0 hardening

Code: `application/backend` (Fastify, TypeScript, Zod; memory and MySQL stores; migrations and seed), `application/frontend` (React, TypeScript, Vite; 3D hero with fallback), deployment templates (`application/frontend/deploy/nginx.conf.template`, `application/backend/deploy/oriel-backend.service`), `.github/workflows/application.yml` rewritten around the real code, and docs (`docs/api/`, `docs/architecture/application-architecture.md`, `docs/runbooks/application-deployment.md`, app READMEs).

Local results (no AWS access):

| Check | Result |
| --- | --- |
| Backend `tsc --noEmit`, `npm run build` | pass |
| Backend `vitest run` | 60 passed, 12 skipped (the MySQL contract tests run only with `MYSQL_TEST_*`) |
| Frontend `tsc --noEmit`, `npm run build` | pass (initial bundle 173 kB gzip; lazy 3D chunk 268 kB gzip) |
| Frontend `vitest run` | 51 passed (jsdom, mocked API) |
| HTTP smoke test: built backend (memory store) + `vite preview` proxy | home and SPA fallback 200; products via proxy; register, checkout (server price 19,200 cents incl. free delivery), account orders; customer 403 and admin 200 on `/admin/orders`; `/healthz` via proxy |
| Workflow structure check (YAML, shell syntax, policy rules) | pass |

Not verified (untested assumptions):

- **`MysqlStore`, the SQL migration, and the migration runner have never run against a real MySQL server** (none available locally, Docker daemon not running). They are covered by contract tests written to run in CI against a MySQL 8.0 service container, which has not executed.
- **No real-browser check**: layout at mobile/desktop widths, the 3D scene, animation, focus rings, console output, and the Report-Only CSP were not inspected; jsdom does not render CSS or WebGL.
- Nginx template, systemd unit, `TRUST_PROXY=4`, and secret injection are untested on AWS. **No deployment mechanism exists** in Terraform; the application workflow therefore has no deploy job.

New findings:

| # | Severity | Finding | Evidence |
| --- | --- | --- | --- |
| 11 | High | The application cannot be delivered to the private instances: no artifact store, no Systems Manager/CodeDeploy, bootstrap installs nothing. | `modules/compute/templates`, `modules/iam/main.tf` |
| 12 | High (untested) | MySQL store/migrations unverified; first real run may fail. | Section 12 above |
| 13 | Medium | Backend cannot read the RDS-managed secret (no IAM grant) and the shared EC2 role would expose it to the frontend if granted. | `modules/iam`, `modules/database/README.md` |
| 14 | Medium | Catalogue search/filter runs in memory per request; no caching (CloudFront caching disabled). Fine for a demo catalogue. | `application/backend/src/routes/catalog.ts` |
| 15 | Low | Backend rate limits are per instance (in memory) and grow with instance count. | `application/backend/src/app.ts` |
| 16 | Info | Payment is a demo; no card data accepted. Passwords use scrypt; roles are enforced server-side; admin accounts only via seeding. | tests in `application/backend/tests/api.test.ts` |

## 13. MySQL and browser verification gate (after section 12)

| Gate | Result |
| --- | --- |
| Real MySQL 8.0 run (migrations, seed, contract tests) | **Blocked, not run.** No MySQL server on this machine (only MySQL Workbench's client tools), no MySQL service or listener on 3306, Docker Desktop installed but stopped (WSL `docker-desktop` distro stopped), no software installed without approval. The 12 MySQL tests remain skipped. |
| Real-browser checks (headless Chrome 155 over DevTools, built storefront + real backend, memory store) | **57/57 checks passed** after fixes (`application/frontend/e2e`, `npm run e2e`); screenshots reviewed. |
| Frontend unit tests | 53 passed; backend 60 passed, 12 skipped |

Defects found in the browser and fixed: first Tab skipped the skip link (focus moved to `<main>` on first load); sign-out redirected to login; mobile header search collapsed; icon buttons could shrink; hero headline wrapping; faceted 3D vase; three.js shadow-map deprecation warning. Remaining: `THREE.Clock` deprecation from `@react-three/fiber` (third party).

Not verified: MySQL store, Firefox/Safari/devices, screen readers, contrast measurements, CSP, anything on AWS. Delivery design (SSM vs CodeDeploy, recommendation CodeDeploy) is in `docs/architecture/deployment-delivery-design.md`; no Terraform was changed.

## 14. Pre-publication audit (before the first push)

Checks run locally (no AWS, no remote backend, no Docker): `npm ci`, type check, tests and builds for the backend (60 passed, 12 skipped) and frontend (53 passed); `npm audit --audit-level=high` for both apps (0 vulnerabilities reported by the registry advisory database); `terraform fmt -check -recursive`; `terraform init -backend=false` plus `validate` for `environments/dev` and `bootstrap` in an isolated copy; the Python Lambda tests (10 and 8); the workflow structure and authentication checks.

Fixed in this pass:

- `environments/dev` did not pass health-check paths to the ALB module. It now passes `frontend_health_check_path` and `backend_health_check_path` (default `/healthz`, which both application tiers answer without touching the database).
- Documentation that still described the work as uncommitted, and the runbooks that listed the health-path wiring as outstanding, were corrected.

Not run: the 12 MySQL contract tests (no MySQL server on this machine and Docker was not started), the real-browser run (it needs the backend and preview servers; the last documented run was 57/57), and anything on AWS or GitHub Actions.

Unresolved (needs credentials, a domain, a decision, or a real AWS account): application delivery to the private instances; per-tier IAM roles and database-secret access; HTTP between CloudFront and the origin; open public ALB and unrestricted security-group egress; no applied remote state; the plan and apply IAM users, GitHub secrets, variables and the `dev-apply` Environment; MySQL verification; scaling policies; a real domain and hosted zone for any `terraform plan` of the dev stack.

`.serena/` is local tooling configuration, is ignored by `.gitignore`, and is intentionally not committed.
