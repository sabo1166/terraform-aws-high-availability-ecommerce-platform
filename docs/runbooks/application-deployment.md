# Application deployment runbook

Status: **application deployment is not implemented and has never been run.** The application builds and passes its tests locally, but the Terraform resources define no way to get code onto the instances. This page records what the code needs, what the existing Terraform provides, and the smallest secure changes recommended. Nothing here was verified on AWS.

## What the Terraform in this repository provides (read from the code)

- Frontend and backend instances are in **private subnets**, no public IPs, no SSH rule, IMDSv2 required (`modules/compute`, `modules/security`).
- Frontend security group accepts TCP **80** from the public ALB; internal ALB group accepts **80** from the frontend; backend group accepts **3000** from the internal ALB; database group accepts **3306** from the backend (`modules/security/main.tf`).
- Public ALB forwards port 80 to the frontend target group (port 80); the internal ALB forwards port 80 to the backend target group (port 3000). Both target groups default to health-check path `/` and matcher `200-399` (`modules/alb`). Health-check paths are set only in the ALB module variables; `environments/dev` does not pass them yet.
- The instance bootstrap installs nothing (placeholder templates in `modules/compute/templates`). The shared EC2 role only has `CloudWatchAgentServerPolicy`: **no Systems Manager, no S3 read, no Secrets Manager read** (`modules/iam`).
- The only S3 bucket is the ALB log bucket; there is no artifact bucket. CodeDeploy and SSM are not used.
- RDS is private; its master password is managed by RDS in Secrets Manager (Terraform output `db_master_user_secret_arn`). Nothing grants the backend access to it.
- Useful outputs for a deployment: `internal_alb_dns_name`, `frontend_asg_name`, `backend_asg_name`, `db_address`, `db_master_user_secret_arn`.

## What the application needs on the instances

**Frontend instances** (Nginx on port 80): the contents of `application/frontend/dist` in `/var/www/oriel`, and `application/frontend/deploy/nginx.conf.template` rendered with `INTERNAL_ALB_DNS` (the internal ALB DNS name). It serves `/healthz` itself and proxies `/api/` to the internal ALB.

**Backend instances** (Node.js 22, port 3000): `application/backend/dist`, `package.json`, `package-lock.json`, and production dependencies installed with `npm ci --omit=dev`, run by `application/backend/deploy/oriel-backend.service`. Required environment (file readable only by root and the service user, created at boot): `NODE_ENV=production`, `STORE=mysql`, `HOST=0.0.0.0`, `PORT=3000`, `JWT_SECRET` (random, 32+ characters), `CORS_ORIGINS` (the public site origin, for example `https://<your-domain>`), `TRUST_PROXY=4`, `COOKIE_SECURE=true`, `DB_HOST` (`db_address`), `DB_NAME`, `DB_USER`, `DB_PASSWORD` (from the Secrets Manager secret), `DB_SSL_CA_PATH` (AWS RDS CA bundle on disk).

**Health checks:** the backend answers `GET /healthz` (liveness, no database) and `GET /` (same, matching the ALB default path) and `GET /readyz` (checks the database). Use `/healthz` for both target groups: it is database-free, so a database outage does not make the load balancer replace healthy instances. Nginx answers `/healthz` and also serves `/` (index.html), so the ALB defaults would pass today, but set the paths explicitly.

**One-off data setup** (needs network access to the private database; not possible from CI): run `npm run migrate` then `npm run seed` from a backend instance (or any host inside the VPC) with the same `DB_*` settings. `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` create an admin only if you provide them; choose your own values and do not commit them.

The delivery-mechanism comparison (Systems Manager vs CodeDeploy, recommending CodeDeploy) and the exact Terraform change list are in `docs/architecture/deployment-delivery-design.md`. The list below is the short version.

## Smallest secure Terraform changes recommended (not implemented)

1. **Artifact delivery:** a private, versioned, encrypted S3 bucket for build artifacts (public access blocked, TLS-only, like the existing log bucket). CI uploads `frontend-dist-*` and `backend-dist-*` there using a narrowly scoped role.
2. **Instance access without SSH:** attach `AmazonSSMManagedInstanceCore` and deploy with Systems Manager (Run Command or State Manager), or use CodeDeploy. Either needs a decision from you; neither is assumed.
3. **Split the EC2 role per tier:** the backend role gets read on exactly the artifact prefix and `secretsmanager:GetSecretValue` on exactly `db_master_user_secret_arn`; the frontend role gets read on its artifact prefix only. The frontend must not be able to read the database secret.
4. **Bootstrap:** replace the placeholder user data with steps that install Nginx or Node.js, fetch the artifact, render the config, read the secret, and start the service; failures must log to `/var/log/bootstrap.log`.
5. **Health paths** are now passed from `environments/dev` to the ALB module (`frontend_health_check_path` and `backend_health_check_path`, both default `/healthz`; done). Remaining here: set `asg_wait_for_capacity_timeout` back to a duration so a failing rollout fails the apply.
6. **HTTPS to the origin and ALB restriction:** see `docs/architecture/https-origin-design.md`. Cookies are `Secure` and rely on HTTPS at CloudFront.
7. **Customer-managed KMS key** for the database secret if you want key-level separation (the default key is used today).

## CI/CD

`.github/workflows/application.yml` runs a preflight check, the frontend and backend tests and builds, a production dependency audit, and an optional read-only infrastructure health check, then reports one verdict (see "Application CI pipeline" in `docs/runbooks/ci-cd.md`). Build outputs are uploaded as short-lived artifacts on pushes and manual runs. It has **no deploy job** because none of the above exists; adding one before the mechanism is decided would only be a placeholder. Terraform changes still go through `terraform.yml`; application pushes never run `terraform apply`.

## Not verified

The Nginx template and systemd unit were not run. `TRUST_PROXY=4` reflects the hop count read from the architecture (CloudFront, public ALB, Nginx, internal ALB) and was not checked on AWS. The Report-Only CSP in the Nginx template has not been exercised in a browser.
