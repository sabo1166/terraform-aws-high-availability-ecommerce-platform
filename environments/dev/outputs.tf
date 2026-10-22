## Expose network identifiers for later modules and verification.
output "vpc_id" {
  description = "ID of the project VPC."
  value       = module.network.vpc_id
}

output "public_subnet_ids" {
  description = "Public subnet IDs for the internet-facing ALB."
  value       = module.network.public_subnet_ids
}

output "private_app_subnet_ids" {
  description = "Private subnet IDs for Frontend and Backend EC2 instances."
  value       = module.network.private_app_subnet_ids
}

output "private_db_subnet_ids" {
  description = "Private subnet IDs for the RDS database subnet group."
  value       = module.network.private_db_subnet_ids
}

## Application entry points and operational identifiers.
output "public_alb_dns_name" {
  description = "DNS name of the public ALB (origin; direct requests are rejected without the origin header)."
  value       = module.alb.public_alb_dns_name
}

output "internal_alb_dns_name" {
  description = "DNS name of the internal ALB."
  value       = module.alb.internal_alb_dns_name
}

output "cloudfront_domain_name" {
  description = "CloudFront distribution domain name."
  value       = module.cloudfront.distribution_domain_name
}

output "site_record_names" {
  description = "Route 53 alias records pointing at CloudFront."
  value       = module.dns.record_fqdns
}

output "frontend_asg_name" {
  description = "Name of the frontend Auto Scaling Group."
  value       = module.compute.frontend_asg_name
}

output "backend_asg_name" {
  description = "Name of the backend Auto Scaling Group."
  value       = module.compute.backend_asg_name
}

output "db_address" {
  description = "DNS address of the RDS endpoint."
  value       = module.database.db_address
}

output "db_master_user_secret_arn" {
  description = "ARN of the Secrets Manager secret with the RDS-managed master credentials (the secret value is not exposed)."
  value       = module.database.master_user_secret_arn
}

output "alarm_topic_arn" {
  description = "ARN of the alarm notification topic."
  value       = module.monitoring.alarm_topic_arn
}

output "alb_logs_bucket_name" {
  description = "Name of the ALB access log bucket."
  value       = module.logging.alb_logs_bucket_name
}

output "athena_workgroup_name" {
  description = "Athena workgroup for ALB log analysis."
  value       = module.logging.athena_workgroup_name
}

output "health_monitor_function_name" {
  description = "Name of the target group health monitor Lambda function (null when disabled)."
  value       = module.automation.health_monitor_function_name
}
