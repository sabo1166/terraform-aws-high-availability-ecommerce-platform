## Export the record names created for the site.
output "record_fqdns" {
  description = "Fully qualified names of the alias records."
  value       = distinct([for record in aws_route53_record.alias : record.fqdn])
}
