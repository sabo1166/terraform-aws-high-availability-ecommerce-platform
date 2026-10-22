## Shared tags and names for database resources.
locals {
  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
  }

  identifier = "${var.project_name}-${var.environment}-mysql"
}

## Place the database only in the isolated private database subnets.
resource "aws_db_subnet_group" "this" {
  name        = "${var.project_name}-${var.environment}-db"
  description = "Private database subnets for ${local.identifier}."
  subnet_ids  = var.private_db_subnet_ids

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-${var.environment}-db-subnet-group"
  })
}

## RDS MySQL. Key security decisions:
## - manage_master_user_password lets RDS generate the password and keep it in Secrets Manager,
##   so no password appears in Terraform code, variables, or outputs.
## - The instance is never publicly accessible and only the database security group applies.
## - Storage is encrypted at rest with the account's default RDS key.
resource "aws_db_instance" "this" {
  identifier = local.identifier

  engine         = "mysql"
  engine_version = var.engine_version
  instance_class = var.instance_class

  allocated_storage     = var.allocated_storage
  max_allocated_storage = var.max_allocated_storage
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name                     = var.db_name
  username                    = var.master_username
  manage_master_user_password = true

  multi_az               = var.multi_az
  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [var.database_security_group_id]
  publicly_accessible    = false

  iam_database_authentication_enabled = true
  enabled_cloudwatch_logs_exports     = ["error", "slowquery"]

  backup_retention_period    = var.backup_retention_period
  copy_tags_to_snapshot      = true
  auto_minor_version_upgrade = true
  apply_immediately          = var.apply_immediately

  deletion_protection       = var.deletion_protection
  skip_final_snapshot       = var.skip_final_snapshot
  final_snapshot_identifier = var.skip_final_snapshot ? null : "${local.identifier}-final"

  tags = merge(local.common_tags, {
    Name = local.identifier
  })
}
