## General settings.
variable "project_name" {
  description = "Project identifier."
  type        = string
}

variable "environment" {
  description = "Deployment environment."
  type        = string
}

## Domain inputs are required on purpose: no domain or hosted zone is assumed.
variable "domain_name" {
  description = "Primary domain name for the certificate, for example the public site name you own."
  type        = string

  validation {
    condition     = can(regex("^([a-z0-9]([a-z0-9-]*[a-z0-9])?\\.)+[a-z]{2,}$", var.domain_name))
    error_message = "domain_name must be a lowercase fully qualified domain name."
  }
}

variable "subject_alternative_names" {
  description = "Additional domain names covered by the certificate."
  type        = list(string)
  default     = []

  validation {
    condition     = alltrue([for name in var.subject_alternative_names : can(regex("^(\\*\\.)?([a-z0-9]([a-z0-9-]*[a-z0-9])?\\.)+[a-z]{2,}$", name))])
    error_message = "Each subject alternative name must be a lowercase fully qualified domain name (a leading *. wildcard is allowed)."
  }
}

variable "hosted_zone_id" {
  description = "ID of the existing Route 53 hosted zone that contains the domain; used for DNS validation records."
  type        = string

  validation {
    condition     = can(regex("^Z[A-Z0-9]+$", var.hosted_zone_id))
    error_message = "hosted_zone_id must look like a Route 53 hosted zone ID (starts with Z)."
  }
}
