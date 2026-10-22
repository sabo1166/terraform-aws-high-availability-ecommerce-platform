## Bootstrap stack: owns ONLY the remote-state bucket.
## Its own state stays local (it cannot store state in a bucket it has not created yet).
provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "Terraform"
      Stack       = "bootstrap"
    }
  }
}

## State can contain secrets in plaintext, so the bucket is never force-destroyed
## and is protected from accidental deletion.
resource "aws_s3_bucket" "state" {
  bucket        = var.state_bucket_name
  force_destroy = false

  tags = {
    Name = var.state_bucket_name
  }

  lifecycle {
    prevent_destroy = true
  }
}

## Disable ACLs; the bucket owner owns every object.
resource "aws_s3_bucket_ownership_controls" "state" {
  bucket = aws_s3_bucket.state.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

## Block every form of public access.
resource "aws_s3_bucket_public_access_block" "state" {
  bucket = aws_s3_bucket.state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

## Versioning allows recovery from a corrupted or overwritten state file.
resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id

  versioning_configuration {
    status = "Enabled"
  }
}

## SSE-S3 (AES256) keeps the bucket free of KMS cost and key-policy coupling.
## Switch to SSE-KMS if separation of key and bucket permissions is required.
resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

## Limit storage growth from old state versions without touching the current one.
resource "aws_s3_bucket_lifecycle_configuration" "state" {
  bucket = aws_s3_bucket.state.id

  rule {
    id     = "expire-noncurrent-state-versions"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = var.noncurrent_version_retention_days
    }

    ## Versioning turns every delete (for example the .tflock file Terraform removes after each run)
    ## into a delete marker. Once all older versions have expired, remove the leftover marker so
    ## markers do not accumulate. This never touches current versions.
    expiration {
      expired_object_delete_marker = true
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  depends_on = [aws_s3_bucket_versioning.state]
}

## Deny any request that is not sent over TLS.
data "aws_iam_policy_document" "state_tls_only" {
  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["s3:*"]

    resources = [
      aws_s3_bucket.state.arn,
      "${aws_s3_bucket.state.arn}/*",
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

  ## Also refuse TLS 1.0 and 1.1. Requests over TLS 1.2 or newer are unaffected. Clients that
  ## cannot do TLS 1.2 (very old tooling) will be rejected.
  statement {
    sid     = "DenyOldTlsVersions"
    effect  = "Deny"
    actions = ["s3:*"]

    resources = [
      aws_s3_bucket.state.arn,
      "${aws_s3_bucket.state.arn}/*",
    ]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "NumericLessThan"
      variable = "s3:TlsVersion"
      values   = ["1.2"]
    }
  }
}

resource "aws_s3_bucket_policy" "state" {
  bucket = aws_s3_bucket.state.id
  policy = data.aws_iam_policy_document.state_tls_only.json

  depends_on = [aws_s3_bucket_public_access_block.state]
}

## Least-privilege policy for whoever runs Terraform against this backend (for example the IAM user whose
## access keys are stored as GitHub secrets). This data source only renders JSON; it creates nothing and
## attaches nothing. It follows the S3 backend requirements: list the bucket, and read, write, and delete
## objects under the state prefix (the delete is needed because use_lockfile creates and removes a
## "<key>.tflock" object next to the state). No KMS permissions are needed because encryption is SSE-S3.
data "aws_iam_policy_document" "state_access" {
  statement {
    sid       = "ListStateBucket"
    effect    = "Allow"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.state.arn]
  }

  statement {
    sid       = "ReadWriteStateObjects"
    effect    = "Allow"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.state.arn}/${var.state_key_prefix}*"]
  }

  ## An explicit Deny always overrides an Allow in IAM policy evaluation. This stops the identity the
  ## policy is attached to from deleting a state object (a key ending in ".tfstate"). It does NOT match
  ## the lock file "<key>.tflock" (it ends in ".tflock"), so locking keeps working: the Allow above still
  ## lets Terraform create and delete that file. See bootstrap/README.md for what this does not cover.
  statement {
    sid       = "DenyDeletingStateObjects"
    effect    = "Deny"
    actions   = ["s3:DeleteObject"]
    resources = ["${aws_s3_bucket.state.arn}/${var.state_key_prefix}*.tfstate"]
  }
}
