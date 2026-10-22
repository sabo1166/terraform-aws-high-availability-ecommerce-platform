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
| 3 | Medium | Dev `required_version = ">= 1.6.0"` but `use_lockfile` needs 1.10 or later. | `environments/dev/versions.tf` (code) |
| 4 | Medium | No application, CI workflow, or Glue table exists; several placeholder directories are empty. | Section 4 |
| 5 | Medium | All private security groups allow egress to `0.0.0.0/0`, including the database group. | `modules/security/main.tf:68, 99, 130, 161` |
| 6 | Medium | The shared EC2 role serves both tiers and has no access to the database secret, so the backend cannot fetch credentials; per-tier roles are needed first. | `modules/iam/main.tf:40`; `modules/database/README.md` |
| 7 | Medium | No ASG scaling policies, so `max_size` is never used. | `modules/compute/main.tf` |
| 8 | Medium | The AMI is unpinned by default; a new Amazon Linux 2023 release triggers a rolling replacement on the next apply. | `modules/compute/main.tf:128`, `variables.tf` |
| 9 | Low | A single NAT carries all AWS API traffic (no VPC endpoints): availability and cost risk. | `modules/network/main.tf:115-130` |
| 10 | Low | No alarms on Lambda `Errors`; no VPC flow logs, CloudFront or WAF logs; log bucket has no versioning. | code |

### Possible risks (not verified on AWS)

- The first `terraform apply` may wait up to `wait_for_capacity_timeout` (default 10m, `modules/compute/variables.tf:137`) and instances may fail ELB health checks in a replacement loop, because the bootstrap installs no application.
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

- **P0:** apply the bootstrap stack and configure the dev backend with human approval; raise dev `required_version` to 1.10 or later; set the compute capacity wait to `0` until an application exists.
- **P1:** regional certificate, HTTPS listener, origin DNS name, `https-only`, and restrict the public ALB group to the CloudFront prefix list; per-tier IAM roles and database secret access; tighten security-group egress and add VPC endpoints and scaling policies; add a CI workflow for `fmt`, `validate`, and the tests.
- **P2:** Glue table, flow/CloudFront/WAF logging, Lambda error alarms, pin `ami_id`, align test layout.
- Then review a real `terraform plan` and run a human-approved apply in a throwaway environment.

## 10. Verdict

- **Commit:** ready once the staged set and this documentation are reviewed.
- **Deploy:** **not ready.** Nothing has been verified on AWS and no application exists.
