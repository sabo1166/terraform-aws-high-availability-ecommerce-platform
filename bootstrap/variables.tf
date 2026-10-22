## Inputs for the remote-state bootstrap stack.
variable "project_name" {
  description = "Project identifier used in tags."
  type        = string
  default     = "ha-ecommerce"
}

variable "environment" {
  description = "Environment tag for the state bucket."
  type        = string
  default     = "shared"
}

variable "aws_region" {
  description = "AWS region where the state bucket is created."
  type        = string
  default     = "us-east-1"
}

## S3 bucket names are global; the operator must choose a unique name (no default on purpose).
variable "state_bucket_name" {
  description = "Globally unique name of the S3 bucket that stores Terraform state."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$", var.state_bucket_name))
    error_message = "Bucket name must be 3-63 characters: lowercase letters, numbers, dots, and hyphens, starting and ending with a letter or number."
  }
}

variable "noncurrent_version_retention_days" {
  description = "Days to keep noncurrent state versions before they expire."
  type        = number
  default     = 90

  validation {
    condition     = var.noncurrent_version_retention_days >= 1
    error_message = "Retention must be at least 1 day."
  }
}
