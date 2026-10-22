## Export the alarm topic for automation and operators.
output "alarm_topic_arn" {
  description = "ARN of the SNS topic that receives alarm notifications."
  value       = aws_sns_topic.alarms.arn
}

output "alarm_kms_key_arn" {
  description = "ARN of the KMS key encrypting the alarm topic."
  value       = aws_kms_key.alarms.arn
}

output "alarm_names" {
  description = "Names of the CloudWatch alarms."
  value       = [for alarm in aws_cloudwatch_metric_alarm.this : alarm.alarm_name]
}

output "unhealthy_host_alarm_names" {
  description = "Names of the unhealthy-host alarms per tier, used by the CodeDeploy deployment groups."
  value = {
    frontend = aws_cloudwatch_metric_alarm.this["frontend-unhealthy-hosts"].alarm_name
    backend  = aws_cloudwatch_metric_alarm.this["backend-unhealthy-hosts"].alarm_name
  }
}
