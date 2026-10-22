# CloudFront Module

Creates a CloudFront distribution in front of the public ALB.

Status: statically validated only. Nothing has been planned, applied, or tested with real traffic.

## Resources

- `aws_cloudfront_distribution.this`:
  - Custom origin: the public ALB, with a secret `origin_verify_header_name` header added to every origin request.
  - Viewer protocol `redirect-to-https`, TLS 1.2 minimum (`TLSv1.2_2021`), SNI-only ACM certificate.
  - WAF web ACL attached; HTTP/2 and HTTP/3; IPv6 enabled.
  - Managed `CachingDisabled` cache policy and `AllViewer` origin request policy (looked up by name).
- Two data sources for the managed cache and origin request policies.

## Inputs

| Name | Description | Default |
| --- | --- | --- |
| `project_name`, `environment` | Naming and tags | required |
| `origin_domain_name` | Public ALB DNS name | required |
| `aliases` | Domain names served (at least 1) | required |
| `certificate_arn` | Validated ACM certificate (us-east-1) | required |
| `web_acl_arn` | CloudFront WAF web ACL | required |
| `origin_verify_header_name` | Header name | `X-Origin-Verify` |
| `origin_verify_header_value` | Secret header value, sensitive, 16+ characters | required |
| `price_class` | Price class | `PriceClass_100` |

## Outputs

`distribution_id`, `distribution_arn`, `distribution_domain_name`, `distribution_hosted_zone_id`.

## Origin protection and limitations

- The ALB module forwards traffic only when the secret header matches (when origin verification is enabled there). The secret is stored in Terraform state; supply it with `TF_VAR_origin_verify_header_value`, never in a committed file.
- **CloudFront-to-ALB traffic is unencrypted HTTP** because the ALB has no HTTPS listener or regional certificate. Anyone who can observe that path could read the header. This is a known gap; fixing it needs a regional certificate and an origin DNS name.
- The public ALB security group still allows `0.0.0.0/0` on ports 80 and 443; restricting it to the CloudFront origin-facing prefix list is not implemented.
- Caching is disabled; no cache behaviors, error pages, or access logs are configured.
- No geo restriction. CloudFront standard logging and monitoring alarms are not configured.
- Cost depends on traffic and price class; none has been estimated.
