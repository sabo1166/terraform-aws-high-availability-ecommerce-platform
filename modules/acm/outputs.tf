## Export the validated certificate for CloudFront.
output "certificate_arn" {
  description = "ARN of the validated ACM certificate (available only after DNS validation completes)."
  value       = aws_acm_certificate_validation.this.certificate_arn
}

output "domain_name" {
  description = "Primary domain name of the certificate."
  value       = aws_acm_certificate.this.domain_name
}
