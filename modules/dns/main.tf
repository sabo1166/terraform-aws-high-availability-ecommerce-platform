## Alias records pointing each domain name at CloudFront (IPv4 and IPv6).
## Alias records to CloudFront are free of query charges and work at the zone apex.
resource "aws_route53_record" "alias" {
  for_each = {
    for pair in setproduct(var.domain_names, ["A", "AAAA"]) : "${pair[0]}-${pair[1]}" => {
      name = pair[0]
      type = pair[1]
    }
  }

  zone_id = var.hosted_zone_id
  name    = each.value.name
  type    = each.value.type

  alias {
    name                   = var.cloudfront_domain_name
    zone_id                = var.cloudfront_hosted_zone_id
    evaluate_target_health = false
  }
}
