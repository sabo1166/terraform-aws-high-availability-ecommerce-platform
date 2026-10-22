# Logging Module

Creates the S3 bucket that receives ALB access logs, plus an Athena workgroup and Glue database for analysis.

Status: statically validated only. It is not connected to `environments/dev`, the ALB module does not use it yet, and nothing has been planned or applied.

## Resources

- `aws_s3_bucket.alb_logs`: `force_destroy = false`, `BucketOwnerEnforced` ownership.
- Block Public Access (all four settings) and SSE-S3 (AES256) encryption. ALB access logs do not support SSE-KMS.
- Lifecycle rules: logs under `<alb_log_prefix>/` expire after `log_retention_days` (default 90); Athena results under `athena-results/` expire after `athena_results_retention_days` (default 30).
- Bucket policy: allows `s3:PutObject` from the regional ELB account (`data.aws_elb_service_account`) only on `<alb_log_prefix>/AWSLogs/<account-id>/*`, and denies requests that are not sent over TLS.
- `aws_glue_catalog_database.alb_logs`: database for ALB log analysis.
- `aws_athena_workgroup.alb_logs`: enforced workgroup configuration, SSE-S3 encrypted results in `s3://<bucket>/athena-results/`, CloudWatch metrics enabled, per-query scan limit.

## Inputs

| Name | Description | Default |
| --- | --- | --- |
| `project_name`, `environment` | Naming and tags | required |
| `alb_logs_bucket_name` | Globally unique bucket name | required |
| `alb_log_prefix` | Log prefix, no leading or trailing slash | `alb` |
| `log_retention_days` | Access log expiry | `90` |
| `athena_results_retention_days` | Query result expiry | `30` |
| `athena_bytes_scanned_cutoff_per_query` | Per-query scan limit in bytes (at least 10 MB) | `10737418240` |

## Outputs

`alb_logs_bucket_name`, `alb_logs_bucket_arn`, `athena_workgroup_name`, `glue_database_name`.

## Security

- The bucket is private, encrypted, and TLS-only. Only the regional ELB account can write, and only to this account's `AWSLogs` path.
- Access logs can contain client IPs and request URLs; restrict who can read the bucket and run Athena queries.
- The bucket is not versioned and has no replication or access logging of its own.

## Limitations and follow-ups

- **No Glue table.** The table schema and partition strategy (for example partition projection by date) from the official ALB log format are not implemented; decide them as a follow-up.
- **Region support.** `aws_elb_service_account` works only in regions that use a regional ELB account ID (for example `us-east-1`). Newer regions need a `logdelivery.elasticloadbalancing.amazonaws.com` service principal instead.
- **ALB not connected.** The ALB module has no `access_logs` block yet; it must be given this bucket name and the same `alb_log_prefix` in a later change.
- The ALB checks write permission when access logging is enabled, so the bucket and policy must exist first.
- Nothing here has been deployed or verified on AWS.
