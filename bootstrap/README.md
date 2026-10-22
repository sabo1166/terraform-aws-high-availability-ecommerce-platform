# Bootstrap Stack

Creates the S3 bucket that stores Terraform state for the application stacks. It is a **separate stack with its own local state**; it owns only this bucket.

## What it creates

- S3 bucket (name supplied by the operator, globally unique), `force_destroy = false`, `prevent_destroy = true`
- Block Public Access (all four settings) and `BucketOwnerEnforced` ownership
- Versioning enabled; noncurrent versions expire after 90 days (configurable)
- SSE-S3 (AES256) encryption
- Bucket policy denying any request without TLS (`aws:SecureTransport = false`)

Locking uses S3 native lock files (`use_lockfile = true`, Terraform 1.10+) from the consuming stack, so **no DynamoDB table is created**.

## Ownership

The bootstrap state (`terraform.tfstate` in this directory) is local and gitignored. Whoever applies this stack must keep that file safe; losing it means the bucket must be imported. Do not store it in git.

## Workflow

All steps that touch AWS need explicit human approval. Nothing below has been run.

**Prerequisites**

- Terraform 1.10 or later (S3 native locking, `use_lockfile`).
- AWS credentials for the target account, held outside the repository, allowed to create and configure an S3 bucket (`s3:CreateBucket`, `PutBucketVersioning`, `PutEncryptionConfiguration`, `PutBucketPublicAccessBlock`, `PutBucketPolicy`, `PutLifecycleConfiguration`, `PutBucketOwnershipControls`, and the matching reads).
- A globally unique bucket name chosen by you.
- Day-to-day operators of the dev stack need, on that bucket and the `ha-ecommerce/dev/` key prefix: `s3:ListBucket`, `s3:GetObject`, `s3:PutObject`, and `s3:DeleteObject` (the lock file `terraform.tfstate.tflock` is created and deleted next to the state object). No DynamoDB table is involved.

**Sequence**

1. Static checks (safe, no AWS access): `terraform init -backend=false`, then `terraform validate` in `bootstrap/`.
2. With approval and credentials, in `bootstrap/`: `terraform init`, then review `terraform plan -var state_bucket_name=<unique-name>` (expect only the bucket and its configuration resources), then `terraform apply`. Back up the resulting local `terraform.tfstate` immediately; it is the only record of the bucket.
3. Verify the bucket: Block Public Access on, ownership `BucketOwnerEnforced`, versioning `Enabled`, default encryption `AES256`, the `DenyInsecureTransport` policy present (console or `aws s3api get-public-access-block|get-bucket-versioning|get-bucket-encryption|get-bucket-policy`).
4. In `environments/dev/`, copy `backend.tf.example` to `backend.tf` and run `terraform init -backend-config="bucket=<name>" -backend-config="region=<region>"`. Do this **before the first apply of the dev stack**.
5. Bootstrap state and application state are separate: the dev state lives at `ha-ecommerce/dev/terraform.tfstate` in the bucket, while bootstrap state stays local.

**State migration considerations**

- The dev stack has never been applied, and no `terraform.tfstate` exists in `environments/dev/` (checked locally), so there is no state to migrate if step 4 happens first. This is the recommended order.
- If dev state ever exists locally before the backend is configured: stop, copy `terraform.tfstate` to a safe location, confirm nobody else is applying, and only then run `terraform init -backend-config=... -migrate-state` with explicit approval. Afterwards verify with `terraform state list` and keep the backup until the remote object is confirmed.
- Never use `-lock=false` or `force-unlock` without understanding the lock holder. A stale `.tflock` object in the bucket means another run is active or crashed.
- The bucket has `prevent_destroy` and `force_destroy = false`. State versions expire after 90 days (noncurrent), which limits rollback history.
- The bootstrap stack's own local state cannot be moved into the bucket it creates without a second, separate migration; that is intentionally not set up.

## Inputs

| Name | Description | Default |
| --- | --- | --- |
| `state_bucket_name` | Globally unique bucket name (required) | none |
| `aws_region` | Bucket region | `us-east-1` |
| `project_name` | Tag value | `ha-ecommerce` |
| `environment` | Tag value | `shared` |
| `noncurrent_version_retention_days` | Noncurrent version expiry | `90` |

## Outputs

`state_bucket_name`, `state_bucket_arn`, `state_bucket_region`.

## Notes

- Terraform backend blocks cannot use variables, so the bucket name is passed with `-backend-config`.
- The dev stack declares `required_version >= 1.10.0`, matching `use_lockfile`.
