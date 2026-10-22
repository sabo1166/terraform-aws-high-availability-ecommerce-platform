## Values needed to configure the application backend. None are secrets.
output "state_bucket_name" {
  description = "Name of the S3 bucket that stores Terraform state."
  value       = aws_s3_bucket.state.id
}

output "state_bucket_arn" {
  description = "ARN of the Terraform state bucket."
  value       = aws_s3_bucket.state.arn
}

output "state_bucket_region" {
  description = "Region of the Terraform state bucket."
  value       = aws_s3_bucket.state.region
}

output "state_access_policy_json" {
  description = "Least-privilege IAM policy (JSON) for running Terraform against this backend. Attach it yourself; this stack does not create or attach any IAM resource."
  value       = data.aws_iam_policy_document.state_access.json
}
