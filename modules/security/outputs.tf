## Export security group IDs for dependent modules.
output "public_alb_security_group_id" {
  description = "Security group ID for the public ALB."
  value       = aws_security_group.public_alb.id
}

output "frontend_security_group_id" {
  description = "Security group ID for frontend EC2 instances."
  value       = aws_security_group.frontend.id
}

output "internal_alb_security_group_id" {
  description = "Security group ID for the internal ALB."
  value       = aws_security_group.internal_alb.id
}

output "backend_security_group_id" {
  description = "Security group ID for backend EC2 instances."
  value       = aws_security_group.backend.id
}

output "database_security_group_id" {
  description = "Security group ID for the RDS database."
  value       = aws_security_group.database.id
}
