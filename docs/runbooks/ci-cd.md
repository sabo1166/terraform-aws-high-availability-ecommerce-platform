# CI/CD runbook (GitHub Actions)

Status: workflows are written but **have never run**. They were checked locally only (YAML parsing and shell syntax). No GitHub remote is configured in this repository yet, and none of the configuration below exists.

## Workflows

| File | Trigger | Jobs |
| --- | --- | --- |
| `terraform.yml` | pull request; push to `main`/`master`; manual (`workflow_dispatch`) | **validate** (always): `terraform fmt -check -recursive`; `init -backend=false` + `validate` for `bootstrap/` and `environments/dev/`; both Python unit-test suites; no AWS. **plan** (manual only): fails unless `TF_STATE_BUCKET`/`TF_STATE_REGION` are set (bootstrap done); plan access keys (repository secrets), remote-backend init, `terraform plan -out` (never `-destroy`), summary of addresses and actions only, fails if the plan deletes or replaces resources unless `allow_deletions` is selected, plan encrypted and uploaded (3-day retention). **apply** (manual, only when the `apply` input is true): runs in the `dev-apply` Environment with the apply access keys stored as that Environment's secrets, checks out the planned commit, verifies the commit and plan SHA-256, applies the saved plan. |
| `application.yml` | pull request / push touching `application/**`; manual | **frontend**: `npm ci`, `npm test`, `npm run build` (type check and bundle), uploads `dist` as an artifact. **backend**: `npm ci`, type check, `npm test` (including the MySQL store contract tests against a throwaway `mysql:8.0` service container), `npm run build`, uploads `dist` plus `package.json`/lock file. **infrastructure-check** (manual, only when `check_infrastructure` is selected, after both jobs): the repository-secret access keys (read use only), remote-state outputs, confirms both Auto Scaling Groups have only in-service, ELB-healthy instances. There is **no deploy job**: the Terraform resources define no deployment mechanism (`docs/runbooks/application-deployment.md`). |

Terraform apply is never triggered by a push or by the application workflow, and no workflow runs destroy.

## Prerequisites that do not exist yet

GitHub repository (or Environment) **variables**: `AWS_REGION`, `TF_STATE_BUCKET`, `TF_STATE_REGION`, `DOMAIN_NAME`, `ROUTE53_HOSTED_ZONE_ID`, `ALB_LOGS_BUCKET_NAME`.

**Secrets** (repository level): `ORIGIN_VERIFY_HEADER_VALUE` (16+ characters), `TFPLAN_ENCRYPTION_KEY` (long random passphrase used to encrypt the plan artifact; must be a repository secret so the plan and apply jobs see the same value), and `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` for the **plan** identity. The same two names are also stored as **secrets of the `dev-apply` Environment** for the **apply** identity; inside the apply job the Environment values override the repository ones.

**GitHub Environments**: `dev-apply`, with required reviewers, a restriction to the protected branch, and its own `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` secrets (the apply identity). (A deployment Environment will be needed when an application deploy job exists.)

**AWS**: two IAM users, created by you outside this repository, each with its own access key pair: a **plan** user and an **apply** user. Both need the state-bucket access policy (`state_access_policy_json`, see `bootstrap/README.md`). The plan user additionally needs whatever read permissions Terraform's refresh requires; the apply user needs permission to create and change the resources in this stack (deliberately not `AdministratorAccess`). Those two permission sets are **not defined anywhere in this repository** and need their own design and review. The application infrastructure check in `application.yml` reuses the repository-level (plan) keys and only needs state read plus `autoscaling:DescribeAutoScalingGroups`.

**State**: the bootstrap stack applied and the S3 bucket available (`bootstrap/README.md`). The deploy workflow copies `backend.tf.example` to `backend.tf` at run time and passes the bucket and region with `-backend-config`; no backend file is committed.

**Application**: `application.yml` uses the Node.js version in each app's `.nvmrc` (22), `npm ci` with the committed `package-lock.json`, and the `test`, `typecheck`, and `build` scripts. The backend job's MySQL service uses an empty root password on a throwaway container that exists only for that job. This workflow has not run on GitHub: the MySQL contract tests in particular have never executed anywhere.

## Safeguards in the Terraform deployment jobs

- Manual dispatch only; `apply` defaults to false; one run at a time (concurrency group, no cancellation).
- The plan is written with `-out`, its stdout is discarded, and only resource addresses and actions go to the job summary. The saved plan can contain secrets, so it is encrypted with `TFPLAN_ENCRYPTION_KEY` before upload and plaintext plan files are removed.
- The apply job checks out the exact commit recorded by the plan job (not the branch tip), verifies `git rev-parse HEAD`, verifies the commit and plan SHA-256 recorded in the artifact metadata against the plan job outputs, and applies the **saved plan**, so only the reviewed changes are applied. Terraform rejects a saved plan when the state changed since it was created.
- Authentication uses static access keys (no OIDC; no `id-token` permission). The workflows read them only from `secrets.AWS_ACCESS_KEY_ID` and `secrets.AWS_SECRET_ACCESS_KEY`, never echo them, and never write them to files; GitHub masks secret values in logs.
- Access boundary: the plan job has no Environment and uses the repository-level keys; the apply job runs in `dev-apply` and uses that Environment's keys, which only approved runs can read. The `validate` job and pull requests use no AWS credentials.

### Security limitations of access keys

- Static keys are long-lived and are not scoped to a repository, branch, or workflow: anyone with the key pair can use it from anywhere until it is deactivated. OIDC roles avoid this; they were replaced here by your decision for this lab. Rotate or delete the keys when the lab ends.
- The repository-level (plan) keys are readable by any workflow run in this repository, including runs of a branch edited by someone with write access. Keep the plan user's permissions limited to state access and reads, and consider putting those keys in a branch-restricted Environment instead (not configured here).
- If the `dev-apply` Environment has no secrets of its own, GitHub silently falls back to the repository keys for the apply job, which removes the separation. Verify both key pairs are set at the right level.
- Required reviewers on `dev-apply` gate the apply keys; they do not limit what an approved apply can do.

## Known limitations

- Never executed: expect first-run fixes. Action versions use major tags (`@v4`, `@v3`), not commit SHAs; pin SHAs after verifying them.
- Lock files hold hashes from the machine that created them; `terraform init` on Linux runners may fail or want updates if a platform hash is missing. If that happens, run `terraform providers lock` for `linux_amd64` and commit the result. `-lockfile=readonly` is not used for this reason.
- Reviewers see only addresses and actions, not attribute-level diffs, to avoid exposing sensitive values; a deeper review needs a separate, access-controlled process.
- `terraform_version: "^1.10.0"` accepts any 1.x release from 1.10; pin an exact version for fully reproducible runs.
