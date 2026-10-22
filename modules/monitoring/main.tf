## Shared tags and the alarm definitions.
locals {
  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
  }

  name_prefix = "${var.project_name}-${var.environment}"

  alarms = {
    public-alb-5xx = {
      description         = "The public ALB is returning 5XX responses."
      namespace           = "AWS/ApplicationELB"
      metric_name         = "HTTPCode_ELB_5XX_Count"
      statistic           = "Sum"
      comparison_operator = "GreaterThanOrEqualToThreshold"
      threshold           = var.alb_5xx_threshold
      dimensions          = { LoadBalancer = var.public_alb_arn_suffix }
    }
    frontend-unhealthy-hosts = {
      description         = "Frontend targets are failing load balancer health checks."
      namespace           = "AWS/ApplicationELB"
      metric_name         = "UnHealthyHostCount"
      statistic           = "Maximum"
      comparison_operator = "GreaterThanOrEqualToThreshold"
      threshold           = 1
      dimensions = {
        LoadBalancer = var.public_alb_arn_suffix
        TargetGroup  = var.frontend_target_group_arn_suffix
      }
    }
    backend-unhealthy-hosts = {
      description         = "Backend targets are failing load balancer health checks."
      namespace           = "AWS/ApplicationELB"
      metric_name         = "UnHealthyHostCount"
      statistic           = "Maximum"
      comparison_operator = "GreaterThanOrEqualToThreshold"
      threshold           = 1
      dimensions = {
        LoadBalancer = var.internal_alb_arn_suffix
        TargetGroup  = var.backend_target_group_arn_suffix
      }
    }
    frontend-cpu-high = {
      description         = "Frontend Auto Scaling Group CPU is high."
      namespace           = "AWS/EC2"
      metric_name         = "CPUUtilization"
      statistic           = "Average"
      comparison_operator = "GreaterThanOrEqualToThreshold"
      threshold           = var.cpu_utilization_threshold
      dimensions          = { AutoScalingGroupName = var.frontend_asg_name }
    }
    backend-cpu-high = {
      description         = "Backend Auto Scaling Group CPU is high."
      namespace           = "AWS/EC2"
      metric_name         = "CPUUtilization"
      statistic           = "Average"
      comparison_operator = "GreaterThanOrEqualToThreshold"
      threshold           = var.cpu_utilization_threshold
      dimensions          = { AutoScalingGroupName = var.backend_asg_name }
    }
    database-cpu-high = {
      description         = "Database CPU is high."
      namespace           = "AWS/RDS"
      metric_name         = "CPUUtilization"
      statistic           = "Average"
      comparison_operator = "GreaterThanOrEqualToThreshold"
      threshold           = var.cpu_utilization_threshold
      dimensions          = { DBInstanceIdentifier = var.db_instance_id }
    }
    database-free-storage-low = {
      description         = "Database free storage is low."
      namespace           = "AWS/RDS"
      metric_name         = "FreeStorageSpace"
      statistic           = "Minimum"
      comparison_operator = "LessThanThreshold"
      threshold           = var.db_free_storage_threshold_bytes
      dimensions          = { DBInstanceIdentifier = var.db_instance_id }
    }
  }
}

data "aws_caller_identity" "current" {}

## Customer-managed key for the alarm topic. The AWS-managed SNS key cannot be used here because
## CloudWatch alarms are not allowed to publish to topics encrypted with it.
data "aws_iam_policy_document" "alarm_key" {
  statement {
    sid       = "EnableAccountAccess"
    effect    = "Allow"
    actions   = ["kms:*"]
    resources = ["*"]

    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"]
    }
  }

  statement {
    sid       = "AllowCloudWatchAlarms"
    effect    = "Allow"
    actions   = ["kms:Decrypt", "kms:GenerateDataKey*"]
    resources = ["*"]

    principals {
      type        = "Service"
      identifiers = ["cloudwatch.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

resource "aws_kms_key" "alarms" {
  description         = "Encrypts the ${local.name_prefix} alarm notification topic."
  enable_key_rotation = true
  policy              = data.aws_iam_policy_document.alarm_key.json

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-alarms-key"
  })
}

resource "aws_kms_alias" "alarms" {
  name          = "alias/${local.name_prefix}-alarms"
  target_key_id = aws_kms_key.alarms.key_id
}

## Notification topic for all alarms.
resource "aws_sns_topic" "alarms" {
  name              = "${local.name_prefix}-alarms"
  kms_master_key_id = aws_kms_key.alarms.arn

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-alarms"
  })
}

## Email subscriptions stay pending until each recipient confirms them.
resource "aws_sns_topic_subscription" "email" {
  for_each = toset(var.alarm_email_addresses)

  topic_arn = aws_sns_topic.alarms.arn
  protocol  = "email"
  endpoint  = each.value
}

## Alarms are notification-only. Missing data is not treated as a breach so idle or
## newly created resources do not trigger false alarms.
resource "aws_cloudwatch_metric_alarm" "this" {
  for_each = local.alarms

  alarm_name          = "${local.name_prefix}-${each.key}"
  alarm_description   = each.value.description
  namespace           = each.value.namespace
  metric_name         = each.value.metric_name
  statistic           = each.value.statistic
  comparison_operator = each.value.comparison_operator
  threshold           = each.value.threshold
  dimensions          = each.value.dimensions
  period              = 300
  evaluation_periods  = var.alarm_evaluation_periods
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.alarms.arn]
  ok_actions    = [aws_sns_topic.alarms.arn]

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-${each.key}"
  })
}
