## Export load balancer and target group identifiers for dependent modules.
output "public_alb_dns_name" {
  description = "DNS name of the public ALB."
  value       = aws_lb.public.dns_name
}

output "public_alb_arn" {
  description = "ARN of the public ALB."
  value       = aws_lb.public.arn
}

output "public_alb_zone_id" {
  description = "Route 53 hosted zone ID of the public ALB, used for alias records."
  value       = aws_lb.public.zone_id
}

output "internal_alb_dns_name" {
  description = "DNS name of the internal ALB."
  value       = aws_lb.internal.dns_name
}

output "internal_alb_arn" {
  description = "ARN of the internal ALB."
  value       = aws_lb.internal.arn
}

## ARN suffixes are the identifiers CloudWatch uses as metric dimensions.
output "public_alb_arn_suffix" {
  description = "ARN suffix of the public ALB, used as a CloudWatch dimension."
  value       = aws_lb.public.arn_suffix
}

output "internal_alb_arn_suffix" {
  description = "ARN suffix of the internal ALB, used as a CloudWatch dimension."
  value       = aws_lb.internal.arn_suffix
}

output "frontend_target_group_arn_suffix" {
  description = "ARN suffix of the frontend target group, used as a CloudWatch dimension."
  value       = aws_lb_target_group.frontend.arn_suffix
}

output "backend_target_group_arn_suffix" {
  description = "ARN suffix of the backend target group, used as a CloudWatch dimension."
  value       = aws_lb_target_group.backend.arn_suffix
}

output "frontend_target_group_arn" {
  description = "ARN of the frontend target group."
  value       = aws_lb_target_group.frontend.arn
}

output "backend_target_group_arn" {
  description = "ARN of the backend target group."
  value       = aws_lb_target_group.backend.arn
}
