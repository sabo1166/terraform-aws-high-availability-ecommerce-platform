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
