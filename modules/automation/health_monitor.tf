## Read-only target group health monitor. It runs on a schedule, calls only
## elbv2:DescribeTargetHealth, and logs healthy/unhealthy counts. It never changes infrastructure.
## The source lives in the root lambda/health-monitor directory and is separate from the alarm logger.
locals {
  health_monitor_enabled = var.enable_health_monitor
  health_monitor_name    = "${var.project_name}-${var.environment}-health-monitor"
}

data "archive_file" "health_monitor" {
  count = local.health_monitor_enabled ? 1 : 0

  type        = "zip"
  source_file = "${path.module}/../../lambda/health-monitor/health_monitor.py"
  output_path = "${path.module}/build/health_monitor.zip"
}

resource "aws_cloudwatch_log_group" "health_monitor" {
  count = local.health_monitor_enabled ? 1 : 0

  name              = "/aws/lambda/${local.health_monitor_name}"
  retention_in_days = var.log_retention_days

  tags = merge(local.common_tags, {
    Name = "${local.health_monitor_name}-logs"
  })
}

## Dedicated role (not the shared Lambda role) so the ELB permission is not granted to other functions.
data "aws_iam_policy_document" "health_monitor_assume_role" {
  statement {
    sid     = "AllowLambdaServiceAssumeRole"
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "health_monitor" {
  count = local.health_monitor_enabled ? 1 : 0

  name_prefix        = "${var.project_name}-${var.environment}-hm-"
  description        = "Read-only execution role for the target group health monitor."
  assume_role_policy = data.aws_iam_policy_document.health_monitor_assume_role.json

  tags = merge(local.common_tags, {
    Name = "${local.health_monitor_name}-role"
  })
}

## Least privilege: write to its own log group only, and describe target health.
## DescribeTargetHealth does not support resource-level permissions, so "*" is required for that one action.
data "aws_iam_policy_document" "health_monitor" {
  count = local.health_monitor_enabled ? 1 : 0

  statement {
    sid       = "WriteOwnLogs"
    effect    = "Allow"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.health_monitor[0].arn}:*"]
  }

  statement {
    sid       = "ReadTargetHealth"
    effect    = "Allow"
    actions   = ["elasticloadbalancing:DescribeTargetHealth"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "health_monitor" {
  count = local.health_monitor_enabled ? 1 : 0

  name   = "read-target-health"
  role   = aws_iam_role.health_monitor[0].id
  policy = data.aws_iam_policy_document.health_monitor[0].json
}

resource "aws_lambda_function" "health_monitor" {
  count = local.health_monitor_enabled ? 1 : 0

  function_name    = local.health_monitor_name
  description      = "Read-only monitor that logs ALB target group health."
  role             = aws_iam_role.health_monitor[0].arn
  runtime          = "python3.12"
  handler          = "health_monitor.handler"
  filename         = data.archive_file.health_monitor[0].output_path
  source_code_hash = data.archive_file.health_monitor[0].output_base64sha256
  timeout          = 30
  memory_size      = 128

  environment {
    variables = {
      TARGET_GROUPS = jsonencode(var.health_monitor_target_group_arns)
    }
  }

  tags = merge(local.common_tags, {
    Name = local.health_monitor_name
  })

  depends_on = [aws_cloudwatch_log_group.health_monitor, aws_iam_role_policy.health_monitor]

  lifecycle {
    precondition {
      condition     = length(var.health_monitor_target_group_arns) > 0
      error_message = "health_monitor_target_group_arns must not be empty when the health monitor is enabled."
    }
  }
}

## A failed check is not retried; the next scheduled run checks again.
resource "aws_lambda_function_event_invoke_config" "health_monitor" {
  count = local.health_monitor_enabled ? 1 : 0

  function_name          = aws_lambda_function.health_monitor[0].function_name
  maximum_retry_attempts = 0
}

resource "aws_cloudwatch_event_rule" "health_monitor" {
  count = local.health_monitor_enabled ? 1 : 0

  name                = "${local.health_monitor_name}-schedule"
  description         = "Runs the target group health monitor."
  schedule_expression = var.health_monitor_schedule_expression

  tags = merge(local.common_tags, {
    Name = "${local.health_monitor_name}-schedule"
  })
}

resource "aws_cloudwatch_event_target" "health_monitor" {
  count = local.health_monitor_enabled ? 1 : 0

  rule = aws_cloudwatch_event_rule.health_monitor[0].name
  arn  = aws_lambda_function.health_monitor[0].arn
}

## Allow only this EventBridge rule to invoke the function.
resource "aws_lambda_permission" "health_monitor_events" {
  count = local.health_monitor_enabled ? 1 : 0

  statement_id  = "AllowScheduleInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.health_monitor[0].function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.health_monitor[0].arn
}
