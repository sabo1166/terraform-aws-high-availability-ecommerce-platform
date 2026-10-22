## Export the automation function details.
output "lambda_function_name" {
  description = "Name of the alarm logging Lambda function."
  value       = aws_lambda_function.alarm_logger.function_name
}

output "lambda_function_arn" {
  description = "ARN of the alarm logging Lambda function."
  value       = aws_lambda_function.alarm_logger.arn
}

output "lambda_log_group_name" {
  description = "CloudWatch log group of the function."
  value       = aws_cloudwatch_log_group.alarm_logger.name
}

output "health_monitor_function_name" {
  description = "Name of the health monitor Lambda function (null when disabled)."
  value       = one(aws_lambda_function.health_monitor[*].function_name)
}

output "health_monitor_log_group_name" {
  description = "CloudWatch log group of the health monitor (null when disabled)."
  value       = one(aws_cloudwatch_log_group.health_monitor[*].name)
}
