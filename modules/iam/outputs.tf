## Export IAM identities for dependent modules.
output "ec2_instance_profile_name" {
  description = "Name of the EC2 instance profile."
  value       = aws_iam_instance_profile.ec2.name
}

output "ec2_role_arn" {
  description = "ARN of the EC2 IAM role."
  value       = aws_iam_role.ec2.arn
}

output "lambda_role_arn" {
  description = "ARN of the Lambda execution role."
  value       = aws_iam_role.lambda.arn
}

output "frontend_instance_profile_name" {
  description = "Name of the frontend instance profile."
  value       = aws_iam_instance_profile.tier["frontend"].name
}

output "backend_instance_profile_name" {
  description = "Name of the backend instance profile."
  value       = aws_iam_instance_profile.tier["backend"].name
}

output "frontend_role_name" {
  description = "Name of the frontend instance role."
  value       = aws_iam_role.tier["frontend"].name
}

output "backend_role_name" {
  description = "Name of the backend instance role."
  value       = aws_iam_role.tier["backend"].name
}
