## General project settings.
variable "project_name" {
  description = "Project identifier used in resource names and tags."
  type        = string
  default     = "ha-ecommerce"
}

variable "environment" {
  description = "Deployment environment."
  type        = string
  default     = "dev"
}

variable "aws_region" {
  description = "AWS region for the application infrastructure."
  type        = string
  default     = "us-east-1"
}

## Network settings.
variable "az_count" {
  description = "Number of Availability Zones used by the environment."
  type        = number
  default     = 2

  validation {
    condition     = var.az_count == 2
    error_message = "This architecture currently requires exactly two Availability Zones."
  }
}

variable "vpc_cidr" {
  description = "CIDR range for the project VPC."
  type        = string
  default     = "10.0.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "CIDR ranges for public load-balancer subnets."
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24"]
}

variable "private_app_subnet_cidrs" {
  description = "CIDR ranges for private application subnets."
  type        = list(string)
  default     = ["10.0.11.0/24", "10.0.12.0/24"]
}

variable "private_db_subnet_cidrs" {
  description = "CIDR ranges for private database subnets."
  type        = list(string)
  default     = ["10.0.21.0/24", "10.0.22.0/24"]
}

variable "enable_nat_gateway" {
  description = "Whether to create a NAT Gateway for private-subnet egress."
  type        = bool
  default     = true
}

variable "single_nat_gateway" {
  description = "Use one NAT Gateway to reduce cost; this is not AZ-resilient egress."
  type        = bool
  default     = true
}

## Domain and DNS inputs. No domain or hosted zone is assumed; supply your own.
variable "domain_name" {
  description = "Primary domain name served by CloudFront (must be inside the Route 53 hosted zone)."
  type        = string
}

variable "subject_alternative_names" {
  description = "Additional domain names served by CloudFront and covered by the certificate."
  type        = list(string)
  default     = []
}

variable "route53_hosted_zone_id" {
  description = "ID of the existing Route 53 hosted zone for the domain."
  type        = string
}

## Origin protection secret. Supply it with TF_VAR_origin_verify_header_value, never in a committed file.
variable "origin_verify_header_value" {
  description = "Secret header value shared by CloudFront and the public ALB (at least 16 characters; stored in Terraform state)."
  type        = string
  sensitive   = true
}

## Logging.
variable "alb_logs_bucket_name" {
  description = "Globally unique name of the S3 bucket for ALB access logs."
  type        = string
}

## Compute sizing (see modules/compute for defaults and validation).
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
}

## Database settings. Multi-AZ doubles database cost; the password is managed by RDS.
variable "db_instance_class" {
  description = "RDS instance class."
  type        = string
  default     = "db.t3.micro"
}

variable "db_multi_az" {
  description = "Deploy the database across two Availability Zones."
  type        = bool
  default     = true
}

variable "db_deletion_protection" {
  description = "Protect the database from deletion (false for development)."
  type        = bool
  default     = false
}

variable "db_skip_final_snapshot" {
  description = "Skip the final database snapshot on deletion."
  type        = bool
  default     = false
}

## Monitoring.
variable "alarm_email_addresses" {
  description = "Email addresses subscribed to alarm notifications."
  type        = list(string)
  default     = []
}

## Read-only target group health monitor (logs healthy/unhealthy counts; changes nothing).
variable "enable_health_monitor" {
  description = "Deploy the scheduled, read-only target group health monitor."
  type        = bool
  default     = true
}

variable "health_monitor_schedule_expression" {
  description = "EventBridge schedule for the health monitor."
  type        = string
  default     = "rate(5 minutes)"
}

## Pre-application setting: no application exists yet, so instances cannot pass ELB health checks.
## "0" stops `apply` from blocking on healthy capacity; ELB health checks stay enabled and unhealthy
## targets still show in the alarms and health monitor. Set to e.g. "10m" once an application serves
## the health-check path so a genuinely failing rollout fails the apply.
variable "asg_wait_for_capacity_timeout" {
  description = "How long apply waits for healthy Auto Scaling Group capacity (0 disables waiting)."
  type        = string
  default     = "0"
}
