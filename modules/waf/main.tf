## Shared tags and rule definitions.
locals {
  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
  }

  ## AWS managed rule groups, evaluated in priority order.
  managed_rule_groups = {
    common-rule-set = {
      name     = "AWSManagedRulesCommonRuleSet"
      priority = 10
    }
    known-bad-inputs = {
      name     = "AWSManagedRulesKnownBadInputsRuleSet"
      priority = 20
    }
    ip-reputation = {
      name     = "AWSManagedRulesAmazonIpReputationList"
      priority = 30
    }
  }
}

## Web ACL for CloudFront. Scope CLOUDFRONT is only valid in us-east-1, so the caller must
## pass a provider configured for that region.
resource "aws_wafv2_web_acl" "this" {
  name        = "${var.project_name}-${var.environment}-cloudfront"
  description = "Web ACL protecting the CloudFront distribution."
  scope       = "CLOUDFRONT"

  ## Allow by default; blocking comes from the managed rules and the rate limit below.
  default_action {
    allow {}
  }

  dynamic "rule" {
    for_each = local.managed_rule_groups

    content {
      name     = rule.key
      priority = rule.value.priority

      override_action {
        none {}
      }

      statement {
        managed_rule_group_statement {
          name        = rule.value.name
          vendor_name = "AWS"
        }
      }

      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = "${var.project_name}-${var.environment}-${rule.key}"
        sampled_requests_enabled   = true
      }
    }
  }

  ## Block IPs that exceed the request rate, limiting scraping and brute-force traffic.
  rule {
    name     = "rate-limit"
    priority = 40

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = var.rate_limit
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.project_name}-${var.environment}-rate-limit"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.project_name}-${var.environment}-web-acl"
    sampled_requests_enabled   = true
  }

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-${var.environment}-cloudfront-waf"
  })
}
