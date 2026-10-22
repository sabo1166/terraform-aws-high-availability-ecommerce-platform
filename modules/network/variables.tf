## Network module inputs.
variable "project_name" {
  description = "Project identifier used in resource names and tags."
  type        = string
}

variable "environment" {
  description = "Deployment environment."
  type        = string
}

variable "vpc_cidr" {
  description = "CIDR range for the VPC."
  type        = string
}

variable "az_count" {
  description = "Number of Availability Zones."
  type        = number

  validation {
    condition     = var.az_count == 2
    error_message = "The network module currently supports exactly two Availability Zones."
  }
}

variable "public_subnet_cidrs" {
  description = "CIDR ranges for public subnets."
  type        = list(string)

  validation {
    condition     = length(var.public_subnet_cidrs) == var.az_count
    error_message = "Provide one public subnet CIDR per Availability Zone."
  }
}

variable "private_app_subnet_cidrs" {
  description = "CIDR ranges for private application subnets."
  type        = list(string)

  validation {
    condition     = length(var.private_app_subnet_cidrs) == var.az_count
    error_message = "Provide one private application subnet CIDR per Availability Zone."
  }
}

variable "private_db_subnet_cidrs" {
  description = "CIDR ranges for private database subnets."
  type        = list(string)

  validation {
    condition     = length(var.private_db_subnet_cidrs) == var.az_count
    error_message = "Provide one private database subnet CIDR per Availability Zone."
  }
}

variable "enable_nat_gateway" {
  description = "Whether to create a NAT Gateway."
  type        = bool
  default     = true
}

variable "single_nat_gateway" {
  description = "Whether to use one NAT Gateway instead of one per Availability Zone."
  type        = bool
  default     = true
}
