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

All steps that touch AWS need explicit human approval.

1. Static checks (safe, no AWS access):
   `terraform init -backend=false` then `terraform validate` in `bootstrap/`.
2. After approval, with AWS credentials: `terraform init`, review `terraform plan -var state_bucket_name=<unique-name>`, then `terraform apply`.
3. Verify the bucket: Block Public Access on, versioning `Enabled`, default encryption `AES256`, and the `DenyInsecureTransport` policy present (console or `aws s3api get-public-access-block|get-bucket-versioning|get-bucket-encryption|get-bucket-policy`).
4. Back up the dev state file (`terraform.tfstate` copy) before any migration. Only migrate if explicitly approved and the dev stack has existing state.
5. In `environments/dev/`, copy `backend.tf.example` to `backend.tf`, then run
   `terraform init -backend-config="bucket=<name>" -backend-config="region=<region>"`
   (add `-migrate-state` only when migrating approved existing state).
6. Bootstrap state and application state are separate: the dev state lives at `ha-ecommerce/dev/terraform.tfstate` in the bucket, while bootstrap state stays local.

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
- The dev stack currently declares `required_version >= 1.6.0`; raise it to `>= 1.10.0` when enabling `use_lockfile`.
