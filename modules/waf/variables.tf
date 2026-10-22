## General settings.
variable "project_name" {
  description = "Project identifier."
  type        = string
}

variable "environment" {
  description = "Deployment environment."
  type        = string
}

variable "rate_limit" {
  description = "Maximum requests per five-minute window from a single IP address before it is blocked."
  type        = number
  default     = 2000

  validation {
    condition     = var.rate_limit >= 10 && var.rate_limit <= 20000000
    error_message = "rate_limit must be between 10 and 20000000."
  }
}
