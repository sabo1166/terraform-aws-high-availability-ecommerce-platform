## General settings.
variable "project_name" {
  description = "Project identifier."
  type        = string
}

variable "environment" {
  description = "Deployment environment."
  type        = string
}

## Network, security, and IAM inputs.
variable "private_app_subnet_ids" {
  description = "Private application subnet IDs for both Auto Scaling Groups (at least two Availability Zones)."
  type        = list(string)

  validation {
    condition     = length(var.private_app_subnet_ids) >= 2
    error_message = "Auto Scaling Groups require subnets in at least two Availability Zones."
  }
}

variable "frontend_security_group_id" {
  description = "Security group ID for frontend instances."
  type        = string
}

variable "backend_security_group_id" {
  description = "Security group ID for backend instances."
  type        = string
}

variable "instance_profile_name" {
  description = "Name of the shared EC2 instance profile attached to both tiers."
  type        = string
}

## Load balancer inputs. Health-check paths are owned by the ALB module, not configured here.
variable "frontend_target_group_arn" {
  description = "ARN of the frontend target group the frontend Auto Scaling Group registers with."
  type        = string
}

variable "backend_target_group_arn" {
  description = "ARN of the backend target group the backend Auto Scaling Group registers with."
  type        = string
}

## AMI selection.
variable "ami_id" {
  description = "Optional AMI ID for both tiers. When null, the latest Amazon Linux 2023 AMI is resolved from the public SSM parameter (a new AMI release replaces instances; pin an ID for stability)."
  type        = string
  default     = null

  validation {
    condition     = var.ami_id == null || can(regex("^ami-[0-9a-f]{8,17}$", coalesce(var.ami_id, "")))
    error_message = "ami_id must be null or a valid AMI ID such as ami-0123456789abcdef0."
  }
}

## Per-tier sizing. A minimum of two instances keeps each tier available across two Availability Zones.
variable "frontend" {
  description = "Sizing for the frontend Auto Scaling Group."
  type = object({
    instance_type    = optional(string, "t3.micro")
    min_size         = optional(number, 2)
    max_size         = optional(number, 4)
    desired_capacity = optional(number, 2)
    root_volume_size = optional(number, 20)
  })
  default = {}

  validation {
    condition = (
      var.frontend.min_size >= 2 &&
      var.frontend.min_size <= var.frontend.desired_capacity &&
      var.frontend.desired_capacity <= var.frontend.max_size
    )
    error_message = "Frontend capacity must satisfy 2 <= min_size <= desired_capacity <= max_size."
  }

  validation {
    condition     = var.frontend.root_volume_size >= 8
    error_message = "Frontend root volume must be at least 8 GiB."
  }
}

variable "backend" {
  description = "Sizing for the backend Auto Scaling Group."
  type = object({
    instance_type    = optional(string, "t3.micro")
    min_size         = optional(number, 2)
    max_size         = optional(number, 4)
    desired_capacity = optional(number, 2)
    root_volume_size = optional(number, 20)
  })
  default = {}

  validation {
    condition = (
      var.backend.min_size >= 2 &&
      var.backend.min_size <= var.backend.desired_capacity &&
      var.backend.desired_capacity <= var.backend.max_size
    )
    error_message = "Backend capacity must satisfy 2 <= min_size <= desired_capacity <= max_size."
  }

  validation {
    condition     = var.backend.root_volume_size >= 8
    error_message = "Backend root volume must be at least 8 GiB."
  }
}

## Rollout and health behavior.
variable "health_check_grace_period" {
  description = "Seconds the Auto Scaling Groups wait before applying load balancer health checks to a new instance."
  type        = number
  default     = 300

  validation {
    condition     = var.health_check_grace_period >= 0
    error_message = "Grace period must not be negative."
  }
}

variable "instance_refresh_min_healthy_percentage" {
  description = "Minimum percentage of healthy instances kept during a rolling instance refresh."
  type        = number
  default     = 50

  validation {
    condition     = var.instance_refresh_min_healthy_percentage >= 0 && var.instance_refresh_min_healthy_percentage <= 100
    error_message = "Percentage must be between 0 and 100."
  }
}

variable "wait_for_capacity_timeout" {
  description = "How long Terraform waits for the minimum healthy capacity after creating an Auto Scaling Group (for example 10m); 0 disables waiting."
  type        = string
  default     = "10m"
}
