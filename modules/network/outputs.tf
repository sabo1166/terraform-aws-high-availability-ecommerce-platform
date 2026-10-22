## Export network identifiers required by other Terraform modules.
output "vpc_id" {
  description = "ID of the VPC."
  value       = aws_vpc.this.id
}

output "public_subnet_ids" {
  description = "IDs of public subnets."
  value       = aws_subnet.public[*].id
}

output "private_app_subnet_ids" {
  description = "IDs of private application subnets."
  value       = aws_subnet.private_app[*].id
}

output "private_db_subnet_ids" {
  description = "IDs of private database subnets."
  value       = aws_subnet.private_db[*].id
}

output "availability_zones" {
  description = "Availability Zones selected for the network."
  value       = local.availability_zones
}
