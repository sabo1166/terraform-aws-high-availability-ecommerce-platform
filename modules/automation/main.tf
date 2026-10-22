## Safe automation foundation: a Lambda function subscribed to the alarm topic that only logs
## each notification. No remediation is performed because the intended automation has not been
## defined, and the execution role intentionally has no EC2, Auto Scaling, or IAM permissions.
locals {
  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
  }

  function_name = "${var.project_name}-${var.environment}-alarm-logger"
}

## Package the handler. The zip is written to build/, which is gitignored.
data "archive_file" "alarm_logger" {
  type        = "zip"
  source_file = "${path.module}/src/alarm_logger.py"
  output_path = "${path.module}/build/alarm_logger.zip"
}

## Manage the log group so retention is bounded.
resource "aws_cloudwatch_log_group" "alarm_logger" {
  name              = "/aws/lambda/${local.function_name}"
  retention_in_days = var.log_retention_days

  tags = merge(local.common_tags, {
    Name = "${local.function_name}-logs"
  })
}

resource "aws_lambda_function" "alarm_logger" {
  function_name    = local.function_name
  description      = "Logs alarm notifications; performs no remediation."
  role             = var.lambda_role_arn
  runtime          = "python3.12"
  handler          = "alarm_logger.handler"
  filename         = data.archive_file.alarm_logger.output_path
  source_code_hash = data.archive_file.alarm_logger.output_base64sha256
  timeout          = 10
  memory_size      = 128

  tags = merge(local.common_tags, {
    Name = local.function_name
  })

  depends_on = [aws_cloudwatch_log_group.alarm_logger]
}

## Allow only the alarm topic to invoke the function.
resource "aws_lambda_permission" "sns" {
  statement_id  = "AllowAlarmTopicInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.alarm_logger.function_name
  principal     = "sns.amazonaws.com"
  source_arn    = var.alarm_topic_arn
}

resource "aws_sns_topic_subscription" "alarm_logger" {
  topic_arn = var.alarm_topic_arn
  protocol  = "lambda"
  endpoint  = aws_lambda_function.alarm_logger.arn

  depends_on = [aws_lambda_permission.sns]
}
