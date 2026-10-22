## General settings.
variable "project_name" {
  description = "Project identifier."
  type        = string
}

variable "environment" {
  description = "Deployment environment."
  type        = string
}

## Network and security inputs.
variable "vpc_id" {
  description = "VPC ID where the target groups are created."
  type        = string
}

variable "public_subnet_ids" {
  description = "Public subnet IDs for the internet-facing ALB (at least two Availability Zones)."
  type        = list(string)

  validation {
    condition     = length(var.public_subnet_ids) >= 2
    error_message = "An ALB requires subnets in at least two Availability Zones."
  }
}

variable "private_app_subnet_ids" {
  description = "Private application subnet IDs for the internal ALB (at least two Availability Zones)."
  type        = list(string)

  validation {
    condition     = length(var.private_app_subnet_ids) >= 2
    error_message = "An ALB requires subnets in at least two Availability Zones."
  }
}

variable "public_alb_security_group_id" {
  description = "Security group ID for the public ALB."
  type        = string
}

variable "internal_alb_security_group_id" {
  description = "Security group ID for the internal ALB."
  type        = string
}

## Target group ports.
variable "frontend_port" {
  description = "Port on which frontend instances receive traffic from the public ALB."
  type        = number
  default     = 80

  validation {
    condition     = var.frontend_port >= 1 && var.frontend_port <= 65535
    error_message = "Frontend port must be between 1 and 65535."
  }
}

variable "backend_port" {
  description = "Port on which backend instances receive traffic from the internal ALB."
  type        = number
  default     = 3000

  validation {
    condition     = var.backend_port >= 1 && var.backend_port <= 65535
    error_message = "Backend port must be between 1 and 65535."
  }
}

## Health checks. The default path "/" is a placeholder; application endpoints are not yet verified.
variable "frontend_health_check_path" {
  description = "Health-check path for the frontend target group (placeholder until the application endpoint is confirmed)."
  type        = string
  default     = "/"

  validation {
    condition     = startswith(var.frontend_health_check_path, "/")
    error_message = "Health-check path must start with '/'."
  }
}

variable "backend_health_check_path" {
  description = "Health-check path for the backend target group (placeholder until the application endpoint is confirmed)."
  type        = string
  default     = "/"

  validation {
    condition     = startswith(var.backend_health_check_path, "/")
    error_message = "Health-check path must start with '/'."
  }
}

variable "health_check_interval" {
  description = "Seconds between health checks."
  type        = number
  default     = 30

  validation {
    condition     = var.health_check_interval >= 5 && var.health_check_interval <= 300
    error_message = "Health-check interval must be between 5 and 300 seconds."
  }
}

variable "health_check_timeout" {
  description = "Seconds before a health check times out; must be lower than the interval."
  type        = number
  default     = 5

  validation {
    condition     = var.health_check_timeout >= 2 && var.health_check_timeout <= 120
    error_message = "Health-check timeout must be between 2 and 120 seconds."
  }
}

variable "healthy_threshold" {
  description = "Consecutive successful checks before a target is healthy."
  type        = number
  default     = 3

  validation {
    condition     = var.healthy_threshold >= 2 && var.healthy_threshold <= 10
    error_message = "Healthy threshold must be between 2 and 10."
  }
}

variable "unhealthy_threshold" {
  description = "Consecutive failed checks before a target is unhealthy."
  type        = number
  default     = 3

  validation {
    condition     = var.unhealthy_threshold >= 2 && var.unhealthy_threshold <= 10
    error_message = "Unhealthy threshold must be between 2 and 10."
  }
}

variable "health_check_matcher" {
  description = "HTTP status codes that count as healthy, for example 200 or 200-399."
  type        = string
  default     = "200-399"

  validation {
    condition     = can(regex("^[0-9]{3}(-[0-9]{3})?(,[0-9]{3}(-[0-9]{3})?)*$", var.health_check_matcher))
    error_message = "Matcher must be HTTP codes or ranges such as 200, 200-299, or 200,301."
  }
}

## Optional access logging. The bucket and its policy (logging module) must exist before the ALBs.
variable "access_logs_bucket_name" {
  description = "S3 bucket for ALB access logs; null disables access logging."
  type        = string
  default     = null
}

variable "access_logs_prefix" {
  description = "Prefix for access logs; must match the prefix allowed by the logging module bucket policy."
  type        = string
  default     = "alb"
}

## Optional origin protection: when enabled, the public ALB forwards only requests that carry
## the secret header CloudFront adds, and answers 403 to everything else.
variable "enable_origin_verification" {
  description = "Require the origin verification header on the public ALB."
  type        = bool
  default     = false
}

variable "origin_verify_header_name" {
  description = "Name of the header CloudFront sends to the origin."
  type        = string
  default     = "X-Origin-Verify"
}

variable "origin_verify_header_value" {
  description = "Secret header value; required when enable_origin_verification is true. It is stored in Terraform state."
  type        = string
  default     = null
  sensitive   = true
}

## Deletion protection is configured independently for each load balancer.
variable "public_alb_deletion_protection" {
  description = "Enable deletion protection on the public ALB."
  type        = bool
  default     = false
}

variable "internal_alb_deletion_protection" {
  description = "Enable deletion protection on the internal ALB."
  type        = bool
  default     = false
}
