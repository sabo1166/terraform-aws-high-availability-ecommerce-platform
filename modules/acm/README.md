# ACM Module

Creates a DNS-validated ACM certificate and its Route 53 validation records.

Status: statically validated only. No domain or hosted zone exists in this repository; nothing has been planned, applied, or validated by ACM.

## Resources

- `aws_acm_certificate.this`: DNS-validated, `create_before_destroy`.
- `aws_route53_record.validation`: one validation record per domain, in the existing hosted zone.
- `aws_acm_certificate_validation.this`: waits for ACM to validate the certificate.

## Inputs

| Name | Description | Default |
| --- | --- | --- |
| `project_name`, `environment` | Naming and tags | required |
| `domain_name` | Primary domain you own | required |
| `subject_alternative_names` | Additional names | `[]` |
| `hosted_zone_id` | Existing Route 53 hosted zone ID | required |

## Outputs

`certificate_arn` (validated), `domain_name`.

## Notes and limitations

- **Region:** CloudFront requires the certificate in `us-east-1`. Instantiate this module with `providers = { aws = aws.us_east_1 }`.
- The domain and hosted zone must already exist and be delegated to Route 53; the module cannot create or verify them. Apply waits for validation and fails if the zone is not authoritative for the domain.
- This certificate is for CloudFront viewers only. The ALB origin currently uses HTTP, so no regional certificate is created for the ALB.
