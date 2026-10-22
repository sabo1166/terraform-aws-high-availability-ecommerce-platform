## Export logging identifiers for dependent modules.
output "alb_logs_bucket_name" {
  description = "Name of the S3 bucket that stores ALB access logs."
  value       = aws_s3_bucket.alb_logs.id
}

output "alb_logs_bucket_arn" {
  description = "ARN of the ALB access log bucket."
  value       = aws_s3_bucket.alb_logs.arn
}

output "athena_workgroup_name" {
  description = "Name of the Athena workgroup for ALB log queries."
  value       = aws_athena_workgroup.alb_logs.name
}

output "glue_database_name" {
  description = "Name of the Glue catalog database for ALB logs."
  value       = aws_glue_catalog_database.alb_logs.name
}
