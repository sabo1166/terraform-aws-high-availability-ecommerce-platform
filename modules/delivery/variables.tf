## General settings.
variable "project_name" {
  description = "Project identifier."
  type        = string
}

variable "environment" {
  description = "Deployment environment."
  type        = string
}

## Inputs from the existing compute, load balancer, IAM, database, and monitoring modules.
variable "frontend_asg_name" {
  description = "Name of the frontend Auto Scaling Group that the frontend deployment group targets."
  type        = string
}

variable "backend_asg_name" {
  description = "Name of the backend Auto Scaling Group that the backend deployment group targets."
  type        = string
}

variable "frontend_target_group_name" {
  description = "Name (not ARN) of the frontend target group, used for traffic control during deployments."
  type        = string
}

variable "backend_target_group_name" {
  description = "Name (not ARN) of the backend target group, used for traffic control during deployments."
  type        = string
}

variable "frontend_role_name" {
  description = "Name of the frontend instance IAM role that receives read access to the frontend release prefix."
  type        = string
}

variable "backend_role_name" {
  description = "Name of the backend instance IAM role that receives read access to the backend release prefix and the two secrets."
  type        = string
}

variable "db_master_user_secret_arn" {
  description = "ARN of the RDS-managed Secrets Manager secret the backend instances may read."
  type        = string
}

variable "unhealthy_host_alarm_names" {
  description = "Names of the CloudWatch unhealthy-host alarms for each tier, referenced by the deployment groups."
  type = object({
    frontend = string
    backend  = string
  })
}

## Deployment behavior.
variable "deployment_config_name" {
  description = "Built-in CodeDeploy configuration for rolling deployments. OneAtATime is the safest first choice; HalfAtATime is faster once the rollout is trusted."
  type        = string
  default     = "CodeDeployDefault.OneAtATime"

  validation {
    condition     = contains(["CodeDeployDefault.OneAtATime", "CodeDeployDefault.HalfAtATime"], var.deployment_config_name)
    error_message = "Use CodeDeployDefault.OneAtATime or CodeDeployDefault.HalfAtATime (AllAtOnce is deliberately not offered)."
  }
}

## The unhealthy-host alarms are already in ALARM while no application is deployed (the instances fail their
## health checks), and CodeDeploy would refuse to start or would stop a deployment because of them. Keep this
## false until a first revision is running and the alarms are OK, then set it to true.
variable "enable_alarm_gating" {
  description = "Make the unhealthy-host alarms stop a deployment and trigger a rollback. Leave false until the first successful deployment."
  type        = bool
  default     = false
}

## Artifact retention. Current releases are kept by default because a new Auto Scaling instance deploys the
## last successful revision: expiring it would break scale-out and instance replacement.
variable "release_expiration_days" {
  description = "Days after which current release objects expire. Null (the default) keeps them indefinitely; only set it well above the longest time between deployments."
  type        = number
  default     = null

  validation {
    condition     = var.release_expiration_days == null || var.release_expiration_days >= 30
    error_message = "Release expiration must be null or at least 30 days."
  }
}

variable "noncurrent_version_retention_days" {
  description = "Days to keep noncurrent (overwritten or deleted) object versions."
  type        = number
  default     = 30

  validation {
    condition     = var.noncurrent_version_retention_days >= 1
    error_message = "Noncurrent version retention must be at least 1 day."
  }
}

variable "jwt_secret_recovery_window_in_days" {
  description = "Recovery window for the JWT secret container after deletion (0 deletes immediately, otherwise 7-30)."
  type        = number
  default     = 7

  validation {
    condition     = var.jwt_secret_recovery_window_in_days == 0 || (var.jwt_secret_recovery_window_in_days >= 7 && var.jwt_secret_recovery_window_in_days <= 30)
    error_message = "Recovery window must be 0 or between 7 and 30 days."
  }
}

## GitHub OIDC deploy identity. Nothing is created for it while github_repository is null.
variable "github_repository" {
  description = "GitHub repository (owner/name) allowed to assume the deploy role through OIDC. Null disables the deploy identity."
  type        = string
  default     = null

  validation {
    condition     = var.github_repository == null || can(regex("^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$", var.github_repository))
    error_message = "github_repository must look like owner/name."
  }
}

variable "github_environment" {
  description = "Name of the GitHub Environment whose jobs may assume the deploy role (the OIDC subject is pinned to it). Create it in the repository settings and restrict its deployment branches."
  type        = string
  default     = "app-deploy"

  validation {
    condition     = can(regex("^[A-Za-z0-9._-]+$", var.github_environment))
    error_message = "The environment name may contain only letters, numbers, dots, underscores, and hyphens."
  }
}

variable "github_oidc_provider_arn" {
  description = "ARN of an existing GitHub OIDC identity provider in this account. Leave null to create it (an account can have only one)."
  type        = string
  default     = null
}
