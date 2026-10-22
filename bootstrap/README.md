# Bootstrap Stack: Terraform remote-state S3 bucket

Creates the S3 bucket that stores Terraform state for the application stacks. It is a **separate stack with its own local state** and owns only this bucket.

**Status: configuration only. No bucket has been created.** The files here pass local `terraform fmt` and `terraform validate`. Nothing has been planned or applied, no AWS call has been made, and no backend has been initialised.

## What it creates

- S3 bucket named by the operator (globally unique, no default), `force_destroy = false`, `prevent_destroy = true`.
- Block Public Access (all four settings) and `BucketOwnerEnforced` ownership (ACLs disabled).
- Versioning enabled; noncurrent versions expire after 90 days (configurable); incomplete uploads are aborted after 7 days; leftover delete markers (`expired_object_delete_marker`) are removed once no older versions remain.
- Default encryption SSE-S3 (AES256), so no KMS key or KMS permissions are involved.
- Lifecycle rule `expire-saved-plans`: objects under `<state_key_prefix>plans/` (saved Terraform plans stored by the deploy workflow) expire after 7 days and their noncurrent versions after 1 day. State files are not under that prefix. An existing bucket gets this rule only when this stack is applied again by an administrator.
- Bucket policy with two Deny statements: any request not sent over TLS (`aws:SecureTransport = false`), and any request using a TLS version older than 1.2 (`s3:TlsVersion` `NumericLessThan` `1.2`).
- State locking uses S3 native lock files (`use_lockfile = true`, Terraform 1.10 or later) from the consuming stack. **No DynamoDB table is created.**

It also renders a least-privilege IAM policy as the output `state_access_policy_json`. That is JSON only: this stack creates and attaches no IAM resource and contains no credentials.

## Inputs and outputs

| Input | Description | Default |
| --- | --- | --- |
| `state_bucket_name` | Globally unique bucket name (3-63 chars, lowercase letters, digits, dots, hyphens) | none (required) |
| `aws_region` | Region of the bucket | `us-east-1` |
| `state_key_prefix` | Key prefix used by the dev stack; only shapes the generated policy | `ha-ecommerce/dev/` |
| `noncurrent_version_retention_days` | Days to keep old state versions | `90` |
| `project_name`, `environment` | Tag values | `ha-ecommerce`, `shared` |

Outputs: `state_bucket_name`, `state_bucket_arn`, `state_bucket_region`, `state_access_policy_json`.

See `terraform.tfvars.example`. Real `*.tfvars` files are gitignored.

## Credentials for the GitHub Actions lab (access keys, not OIDC)

Never put access keys, passwords, or other secrets in Terraform files, variables files, or state.

- **Repository secrets:** `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` (created by you in GitHub; not created or changed by this repository, and never pasted into chat).
- **Repository variables:** `AWS_REGION` (region for the AWS provider and credentials), `TF_STATE_BUCKET` (the bucket name), and `TF_STATE_REGION` (the bucket's region; the same value as `AWS_REGION` for this lab).
- **Workflows:** `.github/workflows/terraform.yml` and `application.yml` read exactly these two secrets through `aws-actions/configure-aws-credentials` (no OIDC). The init and plan jobs use the repository-level secrets; the apply job (Environment `dev-apply`) uses secrets of the same names stored on that Environment, which override the repository ones there. See `docs/runbooks/ci-cd.md`.
- Long-lived access keys are riskier than OIDC roles. Use a dedicated IAM user for this lab, give it only the permissions below, rotate or delete the keys when the lab ends, and never share them with the bootstrap operator account.

### Minimum IAM permissions

**1. Day-to-day Terraform runs against the backend** (the user whose keys go in GitHub): attach the policy printed by `terraform output -raw state_access_policy_json`, or equivalent:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Sid": "ListStateBucket", "Effect": "Allow", "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::<bucket-name>" },
    { "Sid": "ReadWriteStateObjects", "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::<bucket-name>/ha-ecommerce/dev/*" },
    { "Sid": "DenyDeletingStateObjects", "Effect": "Deny", "Action": "s3:DeleteObject",
      "Resource": "arn:aws:s3:::<bucket-name>/ha-ecommerce/dev/*.tfstate" }
  ]
}
```

`s3:DeleteObject` is required because `use_lockfile` creates and deletes `ha-ecommerce/dev/terraform.tfstate.tflock`. This policy only covers the state bucket; creating the application resources (ALB, EC2, RDS and so on) needs its own, separately designed permissions. Do not use `AdministratorAccess` for CI.

**2. Creating this bucket once** (run by a human administrator, not by the CI user): `s3:*` limited to the single resource `arn:aws:s3:::<bucket-name>` and `arn:aws:s3:::<bucket-name>/*`. The AWS provider reads many bucket sub-resources when it refreshes a bucket, so a hand-picked list of `s3:Put*`/`s3:Get*` actions is brittle; scoping by resource keeps it narrow.

## Safe sequence

Everything that touches AWS needs explicit human approval. Nothing below has been run.

1. **Static checks (no AWS access):** `terraform init -backend=false` then `terraform validate` in `bootstrap/` (or in an isolated copy, since `init` creates `.terraform/`).
2. **Create the bucket** (administrator credentials from your environment, never from a file in this repository). In `bootstrap/`:
   ```powershell
   terraform init
   terraform plan  -var "state_bucket_name=<globally-unique-name>"   # expect only the bucket and its configuration (about 7 resources)
   terraform apply -var "state_bucket_name=<globally-unique-name>"
   ```
   Immediately back up the resulting local `bootstrap/terraform.tfstate` (gitignored); it is the only record of the bucket.
3. **Verify the bucket:** Block Public Access on, ownership `BucketOwnerEnforced`, versioning `Enabled`, default encryption `AES256`, the `DenyInsecureTransport` policy present (console, or `aws s3api get-public-access-block|get-bucket-versioning|get-bucket-encryption|get-bucket-policy`).
4. **Create the CI identity:** a dedicated IAM user with the policy from `terraform output -raw state_access_policy_json`, its access keys saved as the GitHub secrets above, and the three variables set.
5. **Enable the dev backend** (only after steps 2 and 3, and before the first apply of the dev stack). In `environments/dev/`:
   ```powershell
   Copy-Item backend.tf.example backend.tf          # backend.tf is created locally; do not commit your bucket name
   terraform init -backend-config="bucket=<state-bucket-name>" -backend-config="region=<bucket-region>"
   ```
   The example (`backend.tf.example`) sets `key = "ha-ecommerce/dev/terraform.tfstate"`, `encrypt = true`, and `use_lockfile = true`; Terraform backend blocks cannot use variables, so the bucket and region are passed with `-backend-config`. The workflows do the same at run time.
6. Bootstrap state and application state are separate: dev state lives at `ha-ecommerce/dev/terraform.tfstate` in the bucket, while the bootstrap state stays local.

## State migration precautions

- The dev stack has never been applied and no `terraform.tfstate` exists in `environments/dev/`, so there is nothing to migrate if step 5 is done before the first apply. This is the recommended order.
- Do not run `terraform init` with the S3 backend against a bucket that has not been created and verified.
- If dev state ever exists locally before the backend is enabled: stop, copy `terraform.tfstate` somewhere safe, confirm nobody else is applying, then run `terraform init -backend-config=... -migrate-state` with explicit approval. Afterwards check `terraform state list` and keep the backup until the remote object is confirmed.
- Never use `-lock=false` or `force-unlock` without understanding who holds the lock. A leftover `.tflock` object means another run is active or crashed.
- The bucket has `prevent_destroy` and `force_destroy = false`; removing it deliberately means emptying it (including all versions) and editing this configuration. Old state versions expire after 90 days, which limits rollback history.
- The bootstrap stack's own local state cannot be moved into the bucket it creates without a second, separate migration; that is intentionally not set up.

## Security hardening and its limits

What the three hardening settings do, and what they do not:

- **Delete-marker cleanup (lifecycle).** `use_lockfile` creates and deletes `terraform.tfstate.tflock` on every run; with versioning each delete leaves a delete marker. The lifecycle rule now also removes a marker once no older versions of that key remain (`expired_object_delete_marker`). It never removes the current version of an object, and the existing 90-day noncurrent-version expiry and 7-day multipart cleanup are unchanged. It does not change retention: old state versions are still permanently removed after the configured number of days.
- **TLS 1.2 minimum (bucket policy).** A second Deny statement rejects requests that use TLS 1.0 or 1.1 (`s3:TlsVersion` below `1.2`), in addition to the existing HTTPS-only Deny. Clients that cannot negotiate TLS 1.2 will be refused. The condition applies to every principal, including administrators. I did not test this on AWS.
- **No deleting state objects (generated IAM policy).** The policy from `state_access_policy_json` now contains an explicit `DenyDeletingStateObjects` statement for `s3:DeleteObject` on keys under the prefix that end in `.tfstate`. In IAM evaluation an explicit Deny overrides an Allow, so the identity this policy is attached to cannot delete `ha-ecommerce/dev/terraform.tfstate`, while the Allow still lets it create and delete `terraform.tfstate.tflock`, because that key does not end in `.tfstate`. The policy also still does not grant `s3:DeleteObjectVersion`, so that identity cannot permanently remove versions.

**What this does not protect against:**

- The Deny lives in the identity policy, not in the bucket policy. It only constrains identities this policy is attached to. Administrators, the account root user, other IAM users or roles with their own S3 permissions, and anyone who can edit or detach the policy are not constrained by it.
- It does not stop the same identity from **overwriting** the state object (the Allow includes `s3:PutObject`), from running `terraform destroy` against the infrastructure, or from running `terraform state rm`; versioning is what allows recovery from a bad overwrite.
- It blocks only `s3:DeleteObject`. A principal with other permissions (for example `s3:DeleteObjectVersion` or `s3:*`) can still remove versions or the bucket's contents, and noncurrent versions are deleted by the lifecycle rule after the retention period.
- The bucket has no S3 Object Lock, no MFA Delete, no access logging, and no copy in another region or account. Nothing here has been applied or tested against AWS; the wildcard matching (`*.tfstate` matches the state key and not `*.tflock`) was checked only with a local pattern test.

## Notes

- Terraform 1.10 or later is required (`bootstrap/versions.tf`, `environments/dev/versions.tf`). Provider: `aws ~> 5.100`.
- Bucket names are global; choose one that is unlikely to collide and do not reuse a name you do not control.
- Validated (static) is not created (real): until step 2 is approved and run, no bucket, user, or secret exists.
