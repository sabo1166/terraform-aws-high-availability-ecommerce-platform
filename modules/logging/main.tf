## Shared tags and names for logging resources.
locals {
  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
  }

  athena_results_prefix = "athena-results"

  ## Glue and Athena database names allow only letters, numbers, and underscores.
  glue_database_name = replace("${var.project_name}_${var.environment}_alb_logs", "-", "_")

  ## Bucket names are global across all AWS accounts. Unless a name is supplied, derive a predictable one
  ## that cannot collide with another account's bucket: the account ID and region make it unique.
  custom_bucket_name   = var.alb_logs_bucket_name == null ? "" : trimspace(var.alb_logs_bucket_name)
  alb_logs_bucket_name = local.custom_bucket_name != "" ? local.custom_bucket_name : "${var.project_name}-${var.environment}-alb-logs-${data.aws_caller_identity.current.account_id}-${data.aws_region.current.name}"
}

data "aws_caller_identity" "current" {}

data "aws_region" "current" {}

## Regional Elastic Load Balancing account that delivers ALB access logs.
## Valid for regions that use a regional ELB account ID (for example us-east-1);
## newer regions use a service principal instead and are not supported by this module.
data "aws_elb_service_account" "main" {}

## Bucket for ALB access logs and Athena query results. Never force-destroyed,
## so logs cannot be lost through an accidental destroy that still has objects.
resource "aws_s3_bucket" "alb_logs" {
  bucket        = local.alb_logs_bucket_name
  force_destroy = false

  tags = merge(local.common_tags, {
    Name = local.alb_logs_bucket_name
  })

  lifecycle {
    precondition {
      condition     = can(regex("^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$", local.alb_logs_bucket_name))
      error_message = "The ALB log bucket name must be 3-63 lowercase letters, numbers, dots, or hyphens. If project_name or environment contain other characters, set alb_logs_bucket_name explicitly."
    }
  }
}

## Disable ACLs; the bucket owner owns every object.
resource "aws_s3_bucket_ownership_controls" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

## Block every form of public access.
resource "aws_s3_bucket_public_access_block" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

## ALB access logs support only SSE-S3; SSE-KMS is not supported for delivery.
resource "aws_s3_bucket_server_side_encryption_configuration" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

## Expire access logs and query results on separate schedules.
resource "aws_s3_bucket_lifecycle_configuration" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id

  rule {
    id     = "expire-alb-access-logs"
    status = "Enabled"

    filter {
      prefix = "${var.alb_log_prefix}/"
    }

    expiration {
      days = var.log_retention_days
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  rule {
    id     = "expire-athena-results"
    status = "Enabled"

    filter {
      prefix = "${local.athena_results_prefix}/"
    }

    expiration {
      days = var.athena_results_retention_days
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

## Allow only the regional ELB account to write logs, and only under this account's AWSLogs path.
## Deny every request that is not sent over TLS.
data "aws_iam_policy_document" "alb_logs" {
  statement {
    sid       = "AllowElbLogDelivery"
    effect    = "Allow"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.alb_logs.arn}/${var.alb_log_prefix}/AWSLogs/${data.aws_caller_identity.current.account_id}/*"]

    principals {
      type        = "AWS"
      identifiers = [data.aws_elb_service_account.main.arn]
    }
  }

  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["s3:*"]

    resources = [
      aws_s3_bucket.alb_logs.arn,
      "${aws_s3_bucket.alb_logs.arn}/*",
    ]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id
  policy = data.aws_iam_policy_document.alb_logs.json

  depends_on = [aws_s3_bucket_public_access_block.alb_logs]
}

## Glue database for future ALB log analysis. No table is defined yet: the schema and
## partition strategy are a follow-up (see README).
resource "aws_glue_catalog_database" "alb_logs" {
  name        = local.glue_database_name
  description = "Database for ALB access log analysis."
}

## Athena workgroup. Settings are enforced so users cannot override the encrypted result location.
resource "aws_athena_workgroup" "alb_logs" {
  name        = "${var.project_name}-${var.environment}-alb-logs"
  description = "Workgroup for ALB access log queries."
  state       = "ENABLED"

  configuration {
    enforce_workgroup_configuration    = true
    publish_cloudwatch_metrics_enabled = true
    bytes_scanned_cutoff_per_query     = var.athena_bytes_scanned_cutoff_per_query

    result_configuration {
      output_location = "s3://${aws_s3_bucket.alb_logs.bucket}/${local.athena_results_prefix}/"

      encryption_configuration {
        encryption_option = "SSE_S3"
      }
    }
  }

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-${var.environment}-alb-logs"
  })
}
