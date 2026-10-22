## Domain inputs are required on purpose: no domain or hosted zone is assumed.
variable "hosted_zone_id" {
  description = "ID of the existing Route 53 hosted zone."
  type        = string

  validation {
    condition     = can(regex("^Z[A-Z0-9]+$", var.hosted_zone_id))
    error_message = "hosted_zone_id must look like a Route 53 hosted zone ID (starts with Z)."
  }
}

variable "domain_names" {
  description = "Record names to point at CloudFront; they must be inside the hosted zone."
  type        = list(string)

  validation {
    condition     = length(var.domain_names) >= 1
    error_message = "At least one domain name is required."
  }
}

variable "cloudfront_domain_name" {
  description = "CloudFront distribution domain name used as the alias target."
  type        = string
}

variable "cloudfront_hosted_zone_id" {
  description = "Route 53 hosted zone ID of the CloudFront distribution."
  type        = string
}
