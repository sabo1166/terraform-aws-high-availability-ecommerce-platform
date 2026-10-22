# WAF Module

Creates a CloudFront-scoped AWS WAFv2 web ACL.

Status: statically validated only. Nothing has been planned, applied, or tested against real traffic.

## Resources

`aws_wafv2_web_acl.this` with default action `allow` and these rules:

| Priority | Rule | Action |
| --- | --- | --- |
| 10 | `AWSManagedRulesCommonRuleSet` | managed rule actions |
| 20 | `AWSManagedRulesKnownBadInputsRuleSet` | managed rule actions |
| 30 | `AWSManagedRulesAmazonIpReputationList` | managed rule actions |
| 40 | Rate limit per IP (default 2000 per 5 minutes) | block |

CloudWatch metrics and sampled requests are enabled on every rule.

## Inputs

| Name | Description | Default |
| --- | --- | --- |
| `project_name`, `environment` | Naming and tags | required |
| `rate_limit` | Requests per 5 minutes per IP | `2000` |

## Outputs

`web_acl_arn`, `web_acl_name`.

## Notes and limitations

- **Region:** scope `CLOUDFRONT` exists only in `us-east-1`. Instantiate with `providers = { aws = aws.us_east_1 }`.
- **Cost:** WAF bills per web ACL, per rule, and per request. No cost has been estimated here.
- Managed rules can block legitimate traffic (false positives) and are untested against the application. Review sampled requests after deployment.
- WAF request logging is not configured (it needs a log destination named `aws-waf-logs-*`).
- Rate-based rules apply to a single CloudFront edge view of an IP and are not a DDoS guarantee.
