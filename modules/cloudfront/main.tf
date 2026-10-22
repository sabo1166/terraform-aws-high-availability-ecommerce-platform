## Shared tags and origin identifier.
locals {
  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
  }

  origin_id = "${var.project_name}-${var.environment}-public-alb"
}

## AWS managed policies, looked up by name so no policy IDs are hardcoded.
## Caching is disabled because the application is dynamic and no cache rules are defined yet.
data "aws_cloudfront_cache_policy" "caching_disabled" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_origin_request_policy" "all_viewer" {
  name = "Managed-AllViewer"
}

## Distribution in front of the public ALB. Viewers must use HTTPS (TLS 1.2 or newer).
resource "aws_cloudfront_distribution" "this" {
  enabled         = true
  comment         = "${var.project_name}-${var.environment}"
  aliases         = var.aliases
  price_class     = var.price_class
  web_acl_id      = var.web_acl_arn
  http_version    = "http2and3"
  is_ipv6_enabled = true

  origin {
    origin_id   = local.origin_id
    domain_name = var.origin_domain_name

    ## The ALB currently has only an HTTP listener (no regional certificate), so CloudFront
    ## talks to it over HTTP. The secret header below stops direct access to the ALB.
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }

    custom_header {
      name  = var.origin_verify_header_name
      value = var.origin_verify_header_value
    }
  }

  default_cache_behavior {
    target_origin_id         = local.origin_id
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    compress                 = true
    cache_policy_id          = data.aws_cloudfront_cache_policy.caching_disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer.id
  }

  viewer_certificate {
    acm_certificate_arn      = var.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-${var.environment}-cdn"
  })
}
