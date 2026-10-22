## General settings.
variable "project_name" {
  description = "Project identifier."
  type        = string
}

variable "environment" {
  description = "Deployment environment."
  type        = string
}

## Origin and edge inputs.
variable "origin_domain_name" {
  description = "DNS name of the public ALB used as the origin."
  type        = string
}

variable "aliases" {
  description = "Domain names served by the distribution; they must be covered by the certificate."
  type        = list(string)

  validation {
    condition     = length(var.aliases) >= 1
    error_message = "At least one alias is required."
  }
}

variable "certificate_arn" {
  description = "ARN of the validated ACM certificate in us-east-1."
  type        = string
}

variable "web_acl_arn" {
  description = "ARN of the CloudFront-scoped WAF web ACL."
  type        = string
}

## Origin protection. CloudFront adds this secret header and the ALB only forwards requests that carry it.
variable "origin_verify_header_name" {
  description = "Name of the custom header CloudFront sends to the origin."
  type        = string
  default     = "X-Origin-Verify"
}

variable "origin_verify_header_value" {
  description = "Secret value of the origin verification header. Supply it outside source control (for example TF_VAR_origin_verify_header_value); it is stored in Terraform state."
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.origin_verify_header_value) >= 16
    error_message = "The origin verification value must be at least 16 characters."
  }
}

variable "price_class" {
  description = "CloudFront price class; PriceClass_100 is the cheapest."
  type        = string
  default     = "PriceClass_100"

  validation {
    condition     = contains(["PriceClass_100", "PriceClass_200", "PriceClass_All"], var.price_class)
    error_message = "price_class must be PriceClass_100, PriceClass_200, or PriceClass_All."
  }
}
