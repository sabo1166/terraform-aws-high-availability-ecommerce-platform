## General settings.
variable "project_name" {
  description = "Project identifier."
  type        = string
}

variable "environment" {
  description = "Deployment environment."
  type        = string
}

## S3 bucket names are global; the caller must choose a unique name (no default on purpose).
variable "alb_logs_bucket_name" {
  description = "Globally unique name of the S3 bucket that stores ALB access logs and Athena query results."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$", var.alb_logs_bucket_name))
    error_message = "Bucket name must be 3-63 characters: lowercase letters, numbers, dots, and hyphens, starting and ending with a letter or number."
  }
}

variable "alb_log_prefix" {
  description = "Prefix under which ALBs write logs (without leading or trailing slash). Configure the same prefix on the ALB access_logs block."
  type        = string
  default     = "alb"

  validation {
    condition     = can(regex("^[A-Za-z0-9_-]+(/[A-Za-z0-9_-]+)*$", var.alb_log_prefix))
    error_message = "Prefix must be non-empty, without leading or trailing slashes (letters, numbers, hyphens, underscores, and slashes between segments)."
  }
}

variable "log_retention_days" {
  description = "Days before ALB access logs expire."
  type        = number
  default     = 90

  validation {
    condition     = var.log_retention_days >= 1
    error_message = "Log retention must be at least 1 day."
  }
}

variable "athena_results_retention_days" {
  description = "Days before Athena query results expire."
  type        = number
  default     = 30

  validation {
    condition     = var.athena_results_retention_days >= 1
    error_message = "Athena results retention must be at least 1 day."
  }
}

variable "athena_bytes_scanned_cutoff_per_query" {
  description = "Maximum bytes a single Athena query may scan (minimum allowed by AWS is 10 MB)."
  type        = number
  default     = 10737418240

  validation {
    condition     = var.athena_bytes_scanned_cutoff_per_query >= 10485760
    error_message = "The per-query scan limit must be at least 10485760 bytes (10 MB)."
  }
}
