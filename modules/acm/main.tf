## Shared tags for certificate resources.
locals {
  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

## Public certificate validated through DNS.
## CloudFront only accepts certificates from us-east-1, so the caller must pass a
## provider configured for that region when this certificate is used with CloudFront.
resource "aws_acm_certificate" "this" {
  domain_name               = var.domain_name
  subject_alternative_names = var.subject_alternative_names
  validation_method         = "DNS"

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-${var.environment}-cert"
  })

  ## Create the replacement before removing the old certificate so CloudFront keeps a valid one.
  lifecycle {
    create_before_destroy = true
  }
}

## Create the DNS validation records in the existing hosted zone.
resource "aws_route53_record" "validation" {
  for_each = {
    for option in aws_acm_certificate.this.domain_validation_options : option.domain_name => {
      name   = option.resource_record_name
      record = option.resource_record_value
      type   = option.resource_record_type
    }
  }

  zone_id         = var.hosted_zone_id
  name            = each.value.name
  type            = each.value.type
  records         = [each.value.record]
  ttl             = 60
  allow_overwrite = true
}

## Wait until ACM has validated the certificate so dependents never use a pending certificate.
resource "aws_acm_certificate_validation" "this" {
  certificate_arn         = aws_acm_certificate.this.arn
  validation_record_fqdns = [for record in aws_route53_record.validation : record.fqdn]
}
