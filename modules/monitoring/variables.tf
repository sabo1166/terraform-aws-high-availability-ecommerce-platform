## General settings.
variable "project_name" {
  description = "Project identifier."
  type        = string
}

variable "environment" {
  description = "Deployment environment."
  type        = string
}

## Resources to monitor, taken from the ALB, compute, and database module outputs.
variable "public_alb_arn_suffix" {
  description = "ARN suffix of the public ALB."
  type        = string
}

variable "internal_alb_arn_suffix" {
  description = "ARN suffix of the internal ALB."
  type        = string
}

variable "frontend_target_group_arn_suffix" {
  description = "ARN suffix of the frontend target group."
  type        = string
}

variable "backend_target_group_arn_suffix" {
  description = "ARN suffix of the backend target group."
  type        = string
}

variable "frontend_asg_name" {
  description = "Name of the frontend Auto Scaling Group."
  type        = string
}

variable "backend_asg_name" {
  description = "Name of the backend Auto Scaling Group."
  type        = string
}

variable "db_instance_id" {
  description = "Identifier of the RDS instance."
  type        = string
}

## Notifications. No address is assumed; email subscriptions must be confirmed by each recipient.
variable "alarm_email_addresses" {
  description = "Email addresses subscribed to alarm notifications."
  type        = list(string)
  default     = []
}

## Alarm thresholds.
variable "alb_5xx_threshold" {
  description = "ELB-generated 5XX responses per period that trigger the public ALB alarm."
  type        = number
  default     = 10
}

variable "cpu_utilization_threshold" {
  description = "Average CPU percentage that triggers the EC2 and RDS CPU alarms."
  type        = number
  default     = 80

  validation {
    condition     = var.cpu_utilization_threshold > 0 && var.cpu_utilization_threshold <= 100
    error_message = "CPU threshold must be between 1 and 100 percent."
  }
}

variable "db_free_storage_threshold_bytes" {
  description = "Free database storage, in bytes, below which the alarm triggers (default 2 GiB)."
  type        = number
  default     = 2147483648
}

variable "alarm_evaluation_periods" {
  description = "Number of consecutive five-minute periods that must breach before an alarm fires."
  type        = number
  default     = 2

  validation {
    condition     = var.alarm_evaluation_periods >= 1
    error_message = "At least one evaluation period is required."
  }
}
