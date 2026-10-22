## Export database connection details. No credentials are exposed; the secret ARN only references the secret.
output "db_instance_id" {
  description = "Identifier of the RDS instance."
  value       = aws_db_instance.this.identifier
}

output "db_instance_arn" {
  description = "ARN of the RDS instance."
  value       = aws_db_instance.this.arn
}

output "db_address" {
  description = "DNS address of the database endpoint."
  value       = aws_db_instance.this.address
}

output "db_port" {
  description = "Port of the database."
  value       = aws_db_instance.this.port
}

output "master_user_secret_arn" {
  description = "ARN of the Secrets Manager secret holding the RDS-managed master credentials."
  value       = aws_db_instance.this.master_user_secret[0].secret_arn
}

output "db_name" {
  description = "Name of the initial database."
  value       = aws_db_instance.this.db_name
}

output "master_username" {
  description = "Master user name (the password stays in the managed secret)."
  value       = aws_db_instance.this.username
}
