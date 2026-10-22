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
variable "private_db_subnet_ids" {
  description = "Private database subnet IDs for the DB subnet group (at least two Availability Zones)."
  type        = list(string)

  validation {
    condition     = length(var.private_db_subnet_ids) >= 2
    error_message = "A DB subnet group requires subnets in at least two Availability Zones."
  }
}

variable "database_security_group_id" {
  description = "Security group ID attached to the database."
  type        = string
}

## Engine and sizing.
variable "engine_version" {
  description = "MySQL engine version. A major version such as 8.0 lets RDS choose its default minor version."
  type        = string
  default     = "8.0"
}

variable "instance_class" {
  description = "RDS instance class."
  type        = string
  default     = "db.t3.micro"
}

variable "allocated_storage" {
  description = "Initial storage in GiB (gp3 for MySQL requires at least 20)."
  type        = number
  default     = 20

  validation {
    condition     = var.allocated_storage >= 20
    error_message = "Allocated storage must be at least 20 GiB."
  }
}

variable "max_allocated_storage" {
  description = "Upper limit in GiB for storage autoscaling; null disables autoscaling."
  type        = number
  default     = 100

  validation {
    condition     = var.max_allocated_storage == null ? true : var.max_allocated_storage >= 20
    error_message = "Maximum allocated storage must be null or at least 20 GiB."
  }
}

variable "multi_az" {
  description = "Deploy a standby in a second Availability Zone. The architecture calls for true; false reduces cost but removes database failover."
  type        = bool
  default     = true
}

## Database identity. The master password is generated and stored by RDS in Secrets Manager.
variable "db_name" {
  description = "Name of the initial database."
  type        = string
  default     = "appdb"

  validation {
    condition     = can(regex("^[A-Za-z][A-Za-z0-9_]{0,63}$", var.db_name))
    error_message = "Database name must start with a letter and contain only letters, numbers, and underscores (up to 64 characters)."
  }
}

variable "master_username" {
  description = "Master user name. The password is managed by RDS and never passed through Terraform."
  type        = string
  default     = "dbadmin"

  validation {
    condition     = can(regex("^[A-Za-z][A-Za-z0-9_]{0,15}$", var.master_username))
    error_message = "Master username must start with a letter and contain only letters, numbers, and underscores (up to 16 characters)."
  }
}

## Backup and protection.
variable "backup_retention_period" {
  description = "Days to keep automated backups."
  type        = number
  default     = 7

  validation {
    condition     = var.backup_retention_period >= 1 && var.backup_retention_period <= 35
    error_message = "Backup retention must be between 1 and 35 days."
  }
}

variable "deletion_protection" {
  description = "Protect the database from deletion. Defaults to false for development."
  type        = bool
  default     = false
}

variable "skip_final_snapshot" {
  description = "Skip the final snapshot on deletion. Defaults to false so data is kept."
  type        = bool
  default     = false
}

variable "apply_immediately" {
  description = "Apply modifications immediately instead of in the next maintenance window."
  type        = bool
  default     = false
}
