## Export delivery identifiers for the pipeline, the compute module, and operators.
output "artifact_bucket_name" {
  description = "Name of the private S3 bucket that stores release bundles."
  value       = aws_s3_bucket.artifacts.id
}

output "artifact_bucket_arn" {
  description = "ARN of the artifact bucket."
  value       = aws_s3_bucket.artifacts.arn
}

output "codedeploy_app_name" {
  description = "Name of the CodeDeploy application."
  value       = aws_codedeploy_app.this.name
}

output "deployment_group_names" {
  description = "Names of the CodeDeploy deployment groups, keyed by tier."
  value       = { for tier, group in aws_codedeploy_deployment_group.this : tier => group.deployment_group_name }
}

output "codedeploy_service_role_arn" {
  description = "ARN of the role CodeDeploy assumes."
  value       = aws_iam_role.codedeploy.arn
}

output "jwt_secret_arn" {
  description = "ARN of the Secrets Manager secret holding the JWT signing key. The value must be set outside Terraform."
  value       = aws_secretsmanager_secret.jwt.arn
}

output "github_deploy_role_arn" {
  description = "ARN of the OIDC role GitHub Actions assumes to deploy. Null when github_repository is not set."
  value       = one(aws_iam_role.github_deploy[*].arn)
}
