## General settings.
variable "project_name" {
  description = "Project identifier."
  type        = string
}

variable "environment" {
  description = "Deployment environment."
  type        = string
}

## Inputs from the IAM and monitoring modules.
variable "lambda_role_arn" {
  description = "ARN of the Lambda execution role from the IAM module (CloudWatch Logs access only)."
  type        = string
}

variable "alarm_topic_arn" {
  description = "ARN of the SNS alarm topic that triggers the function."
  type        = string
}

variable "log_retention_days" {
  description = "Days to keep the function's CloudWatch logs."
  type        = number
  default     = 30

  validation {
    condition     = contains([1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1096, 1827, 2192, 2557, 2922, 3288, 3653], var.log_retention_days)
    error_message = "log_retention_days must be a value supported by CloudWatch Logs retention."
  }
}

## Optional read-only target group health monitor (see health_monitor.tf).
variable "enable_health_monitor" {
  description = "Deploy the scheduled, read-only target group health monitor."
  type        = bool
  default     = false
}

variable "health_monitor_target_group_arns" {
  description = "Map of label to ALB target group ARN that the health monitor checks (required when the monitor is enabled)."
  type        = map(string)
  default     = {}

  validation {
    condition     = alltrue([for arn in values(var.health_monitor_target_group_arns) : can(regex("^arn:aws[a-z-]*:elasticloadbalancing:[a-z0-9-]+:[0-9]{12}:targetgroup/[A-Za-z0-9-]+/[0-9a-f]+$", arn))])
    error_message = "Every value must be an ELBv2 target group ARN."
  }
}

variable "health_monitor_schedule_expression" {
  description = "EventBridge schedule for the health monitor, for example rate(5 minutes)."
  type        = string
  default     = "rate(5 minutes)"

  validation {
    condition     = can(regex("^(rate|cron)\\(.+\\)$", var.health_monitor_schedule_expression))
    error_message = "Schedule must be an EventBridge rate(...) or cron(...) expression."
  }
}
