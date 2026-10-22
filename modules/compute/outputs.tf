## Export Auto Scaling and launch template identifiers for monitoring and automation.
output "frontend_asg_name" {
  description = "Name of the frontend Auto Scaling Group."
  value       = aws_autoscaling_group.this["frontend"].name
}

output "frontend_asg_arn" {
  description = "ARN of the frontend Auto Scaling Group."
  value       = aws_autoscaling_group.this["frontend"].arn
}

output "backend_asg_name" {
  description = "Name of the backend Auto Scaling Group."
  value       = aws_autoscaling_group.this["backend"].name
}

output "backend_asg_arn" {
  description = "ARN of the backend Auto Scaling Group."
  value       = aws_autoscaling_group.this["backend"].arn
}

output "frontend_launch_template_id" {
  description = "ID of the frontend launch template."
  value       = aws_launch_template.this["frontend"].id
}

output "backend_launch_template_id" {
  description = "ID of the backend launch template."
  value       = aws_launch_template.this["backend"].id
}
