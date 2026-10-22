# DNS Module

Creates Route 53 alias records that point the site's domain names at CloudFront.

Status: statically validated only. No domain or hosted zone exists in this repository; nothing has been planned or applied.

## Resources

`aws_route53_record.alias`: an `A` and an `AAAA` alias record for each name in `domain_names`.

## Inputs

| Name | Description | Default |
| --- | --- | --- |
| `hosted_zone_id` | Existing Route 53 hosted zone ID | required |
| `domain_names` | Record names inside the zone (at least 1) | required |
| `cloudfront_domain_name` | CloudFront distribution domain name | required |
| `cloudfront_hosted_zone_id` | CloudFront hosted zone ID | required |

## Outputs

`record_fqdns`.

## Notes and limitations

- The hosted zone must already exist and the names must belong to it; the module does not create zones, register domains, or check delegation.
- Creating an `A`/`AAAA` record fails if a conflicting record already exists for the same name.
- Route 53 charges for the hosted zone itself, which this module does not create.
