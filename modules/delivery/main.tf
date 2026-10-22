## Delivery foundation: a private artifact bucket, CodeDeploy for the two Auto Scaling Groups, read access for the
## instances, the container for the JWT secret, and an optional GitHub OIDC deploy identity.
## Nothing here deploys an application: the bundles, appspec files, and pipeline jobs come in later phases.
locals {
  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
  }

  name_prefix = "${var.project_name}-${var.environment}"

  ## Bucket names are global; the account ID and region keep this one unique.
  artifact_bucket_name = "${local.name_prefix}-artifacts-${data.aws_caller_identity.current.account_id}-${data.aws_region.current.name}"

  tiers = {
    frontend = {
      asg_name          = var.frontend_asg_name
      target_group_name = var.frontend_target_group_name
      alarm_name        = var.unhealthy_host_alarm_names.frontend
    }
    backend = {
      asg_name          = var.backend_asg_name
      target_group_name = var.backend_target_group_name
      alarm_name        = var.unhealthy_host_alarm_names.backend
    }
  }

  partition = data.aws_partition.current.partition
  region    = data.aws_region.current.name
  account   = data.aws_caller_identity.current.account_id

  deploy_identity_enabled = var.github_repository != null
  create_oidc_provider    = local.deploy_identity_enabled && var.github_oidc_provider_arn == null
}

data "aws_caller_identity" "current" {}

data "aws_region" "current" {}

data "aws_partition" "current" {}

## ---------------------------------------------------------------------------------------------------------
## Artifact bucket
## ---------------------------------------------------------------------------------------------------------

## Release bundles are kept as the rollback history, so the bucket is never force-destroyed.
resource "aws_s3_bucket" "artifacts" {
  bucket        = local.artifact_bucket_name
  force_destroy = false

  tags = merge(local.common_tags, {
    Name = local.artifact_bucket_name
  })
}

## Disable ACLs; the bucket owner owns every object.
resource "aws_s3_bucket_ownership_controls" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

## Block every form of public access.
resource "aws_s3_bucket_public_access_block" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

## Versioning lets a deployment name an exact object version and keeps overwritten objects recoverable.
resource "aws_s3_bucket_versioning" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  versioning_configuration {
    status = "Enabled"
  }
}

## SSE-S3 keeps the bucket free of KMS key-policy coupling. Switch to SSE-KMS if key and bucket permissions
## must be separated (decision recorded in docs/architecture/deployment-delivery-design.md).
resource "aws_s3_bucket_server_side_encryption_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

## Current releases are kept (see var.release_expiration_days); only superseded versions and failed uploads expire.
resource "aws_s3_bucket_lifecycle_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  rule {
    id     = "expire-noncurrent-versions-and-failed-uploads"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = var.noncurrent_version_retention_days
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  dynamic "rule" {
    for_each = var.release_expiration_days == null ? [] : [var.release_expiration_days]

    content {
      id     = "expire-old-releases"
      status = "Enabled"

      filter {
        prefix = "releases/"
      }

      expiration {
        days = rule.value
      }
    }
  }

  depends_on = [aws_s3_bucket_versioning.artifacts]
}

data "aws_iam_policy_document" "artifacts_bucket" {
  ## Deny any request that is not sent over TLS.
  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["s3:*"]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    resources = [
      aws_s3_bucket.artifacts.arn,
      "${aws_s3_bucket.artifacts.arn}/*",
    ]

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }

  ## Deny uploads that ask for an encryption mode other than SSE-S3 (a request without the header is encrypted
  ## by the bucket default).
  statement {
    sid       = "DenyNonS3ManagedEncryptionUploads"
    effect    = "Deny"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.artifacts.arn}/*"]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "StringNotEqualsIfExists"
      variable = "s3:x-amz-server-side-encryption"
      values   = ["AES256"]
    }
  }
}

resource "aws_s3_bucket_policy" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  policy = data.aws_iam_policy_document.artifacts_bucket.json

  depends_on = [aws_s3_bucket_public_access_block.artifacts]
}

## ---------------------------------------------------------------------------------------------------------
## Instance access: each tier reads only its own release prefix. The backend also reads exactly two secrets.
## ---------------------------------------------------------------------------------------------------------

## Container for the JWT signing secret. It deliberately has NO value here, so the secret never enters
## Terraform state. Set it once out of band (aws secretsmanager put-secret-value) with a random value of at
## least 32 characters before the first backend deployment. It uses the account's default Secrets Manager key.
resource "aws_secretsmanager_secret" "jwt" {
  name                    = "${var.project_name}/${var.environment}/backend/jwt-secret"
  description             = "JWT signing secret for the backend API. The value is set outside Terraform."
  recovery_window_in_days = var.jwt_secret_recovery_window_in_days

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-backend-jwt-secret"
  })
}

data "aws_iam_policy_document" "frontend_read_releases" {
  statement {
    sid       = "ReadFrontendReleases"
    effect    = "Allow"
    actions   = ["s3:GetObject", "s3:GetObjectVersion"]
    resources = ["${aws_s3_bucket.artifacts.arn}/releases/frontend/*"]
  }
}

resource "aws_iam_role_policy" "frontend_read_releases" {
  name   = "read-frontend-releases"
  role   = var.frontend_role_name
  policy = data.aws_iam_policy_document.frontend_read_releases.json
}

data "aws_iam_policy_document" "backend_read_releases_and_secrets" {
  statement {
    sid       = "ReadBackendReleases"
    effect    = "Allow"
    actions   = ["s3:GetObject", "s3:GetObjectVersion"]
    resources = ["${aws_s3_bucket.artifacts.arn}/releases/backend/*"]
  }

  statement {
    sid       = "ReadBackendSecrets"
    effect    = "Allow"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [var.db_master_user_secret_arn, aws_secretsmanager_secret.jwt.arn]
  }
}

resource "aws_iam_role_policy" "backend_read_releases_and_secrets" {
  name   = "read-backend-releases-and-secrets"
  role   = var.backend_role_name
  policy = data.aws_iam_policy_document.backend_read_releases_and_secrets.json
}

## ---------------------------------------------------------------------------------------------------------
## CodeDeploy
## ---------------------------------------------------------------------------------------------------------

resource "aws_codedeploy_app" "this" {
  name             = local.name_prefix
  compute_platform = "Server"

  tags = merge(local.common_tags, {
    Name = local.name_prefix
  })
}

## Trust policy: only the CodeDeploy service may assume the service role.
data "aws_iam_policy_document" "codedeploy_assume_role" {
  statement {
    sid     = "AllowCodeDeployServiceAssumeRole"
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["codedeploy.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "codedeploy" {
  name_prefix        = "${local.name_prefix}-codedeploy-"
  description        = "Service role CodeDeploy assumes to roll deployments across the Auto Scaling Groups."
  assume_role_policy = data.aws_iam_policy_document.codedeploy_assume_role.json

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-codedeploy-role"
  })
}

## AWS-managed policy for CodeDeploy with Auto Scaling groups and load balancers.
resource "aws_iam_role_policy_attachment" "codedeploy" {
  role       = aws_iam_role.codedeploy.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSCodeDeployRole"
}

## One deployment group per tier. In-place rolling deployments with traffic control: CodeDeploy takes an
## instance out of the target group, installs the revision, validates it, and puts it back. Instances launched
## by Auto Scaling later get the last successful revision. The groups attach to the existing Auto Scaling Groups
## and target groups; nothing about those resources is changed here.
resource "aws_codedeploy_deployment_group" "this" {
  for_each = local.tiers

  app_name               = aws_codedeploy_app.this.name
  deployment_group_name  = "${local.name_prefix}-${each.key}"
  service_role_arn       = aws_iam_role.codedeploy.arn
  deployment_config_name = var.deployment_config_name
  autoscaling_groups     = [each.value.asg_name]

  deployment_style {
    deployment_type   = "IN_PLACE"
    deployment_option = "WITH_TRAFFIC_CONTROL"
  }

  load_balancer_info {
    target_group_info {
      name = each.value.target_group_name
    }
  }

  auto_rollback_configuration {
    enabled = true
    events  = concat(["DEPLOYMENT_FAILURE"], var.enable_alarm_gating ? ["DEPLOYMENT_STOP_ON_ALARM"] : [])
  }

  alarm_configuration {
    enabled                   = var.enable_alarm_gating
    alarms                    = [each.value.alarm_name]
    ignore_poll_alarm_failure = false
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-${each.key}"
    Tier = each.key
  })

  depends_on = [aws_iam_role_policy_attachment.codedeploy]
}

## ---------------------------------------------------------------------------------------------------------
## GitHub OIDC deploy identity (created only when github_repository is set)
## ---------------------------------------------------------------------------------------------------------

## An account can have one provider for token.actions.githubusercontent.com. If one already exists, pass its
## ARN in github_oidc_provider_arn instead of creating a second one.
resource "aws_iam_openid_connect_provider" "github" {
  count = local.create_oidc_provider ? 1 : 0

  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-github-oidc"
  })
}

locals {
  oidc_provider_arn = local.deploy_identity_enabled ? coalesce(var.github_oidc_provider_arn, one(aws_iam_openid_connect_provider.github[*].arn)) : null
}

## Trust policy: only workflow jobs of this repository that run in the named GitHub Environment may assume the
## role. The audience and the subject are both pinned; the repository is public, so an unpinned subject would
## let any repository's workflow assume it.
data "aws_iam_policy_document" "github_assume_role" {
  count = local.deploy_identity_enabled ? 1 : 0

  statement {
    sid     = "AllowGitHubEnvironmentAssumeRole"
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [local.oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repository}:environment:${var.github_environment}"]
    }
  }
}

resource "aws_iam_role" "github_deploy" {
  count = local.deploy_identity_enabled ? 1 : 0

  name_prefix          = "${local.name_prefix}-github-deploy-"
  description          = "Assumed by GitHub Actions (OIDC) to publish releases and start CodeDeploy deployments."
  assume_role_policy   = data.aws_iam_policy_document.github_assume_role[0].json
  max_session_duration = 3600

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-github-deploy-role"
  })
}

## Least privilege for the pipeline: write releases, start and watch deployments of this application only, and
## read the health of the two tiers. No SSM, EC2 write, IAM, Secrets Manager or Terraform state access.
data "aws_iam_policy_document" "github_deploy" {
  count = local.deploy_identity_enabled ? 1 : 0

  statement {
    sid       = "PublishReleases"
    effect    = "Allow"
    actions   = ["s3:PutObject", "s3:GetObject", "s3:GetObjectVersion", "s3:AbortMultipartUpload"]
    resources = ["${aws_s3_bucket.artifacts.arn}/releases/*"]
  }

  statement {
    sid     = "StartDeployments"
    effect  = "Allow"
    actions = ["codedeploy:CreateDeployment"]
    resources = concat(
      [for group in aws_codedeploy_deployment_group.this : "arn:${local.partition}:codedeploy:${local.region}:${local.account}:deploymentgroup:${aws_codedeploy_app.this.name}/${group.deployment_group_name}"],
      ["arn:${local.partition}:codedeploy:${local.region}:${local.account}:deploymentconfig:${var.deployment_config_name}"],
      ["arn:${local.partition}:codedeploy:${local.region}:${local.account}:application:${aws_codedeploy_app.this.name}"],
    )
  }

  statement {
    sid       = "RegisterRevisions"
    effect    = "Allow"
    actions   = ["codedeploy:GetApplicationRevision", "codedeploy:RegisterApplicationRevision"]
    resources = ["arn:${local.partition}:codedeploy:${local.region}:${local.account}:application:${aws_codedeploy_app.this.name}"]
  }

  ## Read-only calls that do not support resource-level restrictions.
  statement {
    sid    = "WatchDeploymentsAndHealth"
    effect = "Allow"
    actions = [
      "codedeploy:GetDeployment",
      "codedeploy:GetDeploymentTarget",
      "codedeploy:ListDeploymentTargets",
      "elasticloadbalancing:DescribeTargetHealth",
      "autoscaling:DescribeAutoScalingGroups",
      "cloudwatch:DescribeAlarms",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "github_deploy" {
  count = local.deploy_identity_enabled ? 1 : 0

  name   = "publish-and-deploy"
  role   = aws_iam_role.github_deploy[0].id
  policy = data.aws_iam_policy_document.github_deploy[0].json
}
