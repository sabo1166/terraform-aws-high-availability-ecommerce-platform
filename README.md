# Terraform AWS High-Availability E-Commerce Platform

Terraform for a two-tier, multi-AZ web platform on AWS.

**Status: not deployed, not production-ready.** The Terraform passes local `fmt` and `validate`, the Python tests pass with mocked AWS responses, and the **Oriel demo storefront and API** (`application/`) build and pass their local tests. Nothing has been planned, applied, or run on AWS, and **application deployment is not implemented**: the EC2 bootstrap is still a placeholder that installs nothing, and the Terraform defines no way to deliver the application to the private instances (see `docs/runbooks/application-deployment.md`).

## The application: Oriel (demo store)

`application/frontend` (React, TypeScript, Vite; lazy 3D hero with a static fallback) and `application/backend` (Fastify, TypeScript, Zod, MySQL or an in-memory store) implement a complete demo shop: catalogue with search, filters, sorting and pagination; product pages with variants and stock; persistent cart; server-priced checkout with transactional stock handling (demo payment only, no card data); customer accounts, order history; and a protected admin area for products, stock, and orders. Brand, products, prices, and policies are fictional.

Run it locally without a database:

```powershell
cd application/backend;  npm ci; npm run dev     # API on :3000 (STORE=memory, seeded demo data)
cd application/frontend; npm ci; npm run dev     # storefront on http://localhost:5173
```

Docs: `application/backend/README.md`, `application/frontend/README.md`, `docs/api/README.md`, `docs/architecture/application-architecture.md`. The MySQL store has not been run against a real database, and the UI has not been checked in a real browser (details in those READMEs).

## Architecture (as coded)

```
Route 53 -> CloudFront (+ ACM certificate, + WAF) -> Public ALB
         -> Frontend EC2 Auto Scaling Group -> Internal ALB
         -> Backend EC2 Auto Scaling Group -> RDS MySQL (Multi-AZ)
```

- VPC across two Availability Zones with public, private application, and private database subnets; one NAT Gateway by default (cheaper, not AZ-resilient).
- Security groups chain by reference: public ALB -> frontend (80) -> internal ALB (80) -> backend (3000) -> database (3306).
- EC2: IMDSv2 required, no public IPs, encrypted gp3 root volumes, shared instance profile with `CloudWatchAgentServerPolicy`.
- RDS MySQL with RDS-managed master password (Secrets Manager), encryption, backups, private subnets.
- CloudFront-to-ALB uses **plain HTTP** with a secret header check; the ALB has no HTTPS listener yet.
- ALB access logs to S3 with an Athena workgroup and Glue database (no table yet).
- CloudWatch alarms and a KMS-encrypted SNS topic; a log-only alarm Lambda; an optional read-only target group health monitor Lambda.

## Repository layout

| Path | Purpose |
| --- | --- |
| `bootstrap/` | Separate stack (local state) for the remote-state S3 bucket. |
| `environments/dev/` | Root configuration that wires all modules together. |
| `modules/` | `network`, `security`, `iam`, `logging`, `alb`, `compute`, `database`, `monitoring`, `automation`, `acm`, `waf`, `cloudfront`, `dns`; each has a README. |
| `lambda/health-monitor/` | Source for the health monitor Lambda. |
| `modules/automation/src/` | Source for the alarm logger Lambda. |
| `tests/lambda/`, `modules/automation/tests/` | Python unit tests. |
| `application/frontend/`, `application/backend/` | The Oriel storefront and API (with deployment templates in each `deploy/`). |
| `.github/workflows/` | `terraform.yml` and `application.yml`. |
| `docs/` | `api/`, `architecture/`, `runbooks/`, `reports/` (audit). |
| `lambda/automation/`, `tests/application/`, `tests/terraform/` | Empty placeholders; not implemented. |

## Required inputs for `environments/dev`

No default exists for these; supply your own (nothing is assumed):

- `domain_name` and `route53_hosted_zone_id` (an existing Route 53 hosted zone that is authoritative for the domain)
- `alb_logs_bucket_name` (globally unique S3 bucket name)

Optional: `origin_verify_header_value` (secret, 16+ characters). When unset, Terraform generates a random value (`random_password.origin_verify`) and uses it for both CloudFront and the ALB; to pin your own, set `$env:TF_VAR_origin_verify_header_value`. Either way it is stored in Terraform state.

See `environments/dev/terraform.tfvars.example`. Real `*.tfvars` files are gitignored.

## Local validation (no AWS access needed)

```powershell
terraform fmt -check -recursive
cd environments/dev
terraform init -backend=false      # downloads providers; creates .terraform/
terraform validate
cd ../..
python -B -m unittest discover -s tests/lambda -v
python -B -m unittest discover -s modules/automation/tests -v
cd application/backend;  npm ci; npm run typecheck; npm test; npm run build; cd ../..
cd application/frontend; npm ci; npm test; npm run build; cd ../..
```

`validate` checks syntax and references only. It does not prove that resources can be created.

## CI/CD

Two GitHub Actions workflows exist in `.github/workflows/` (`terraform.yml` and `application.yml`). They have never run, and the repository variables, secrets, Environments, and the AWS access keys (IAM users) they need do not exist yet. Application deployment is not implemented. See `docs/runbooks/ci-cd.md`.

## Remote state

State is local until the backend is configured. `bootstrap/README.md` describes creating the state bucket (S3 native locking, Terraform 1.10 or later) and `environments/dev/backend.tf.example` shows the backend block. Creating the bucket and migrating state both need explicit human approval.

## Safety

- Do not run `terraform plan` or `apply` without reviewing the credentials and target account first; `apply` creates billable resources (ALBs, NAT, Multi-AZ RDS, CloudFront, WAF, KMS, and more).
- Never commit state, plans, real `*.tfvars`, credentials, or the origin secret.

## Known limitations

- The application is not deployed: instances will fail load balancer health checks until the frontend and backend are installed on them. No deployment pipeline exists (the workflows have never run).
- No remote state is configured for dev; the bootstrap stack is not applied.
- Unrestricted security-group egress, a shared EC2 role for both tiers, no database secret access for the backend, no Auto Scaling policies, HTTP between CloudFront and the origin.
- See `docs/reports/DEVOPS_PROJECT_AUDIT.md` for the full list.
