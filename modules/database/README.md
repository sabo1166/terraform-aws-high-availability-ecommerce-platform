# Database Module

Creates an RDS MySQL instance in the private database subnets.

Status: statically validated only. Nothing has been planned, applied, or tested on AWS.

## Resources

- `aws_db_subnet_group.this`: private database subnets (at least two AZs).
- `aws_db_instance.this`:
  - MySQL, gp3 storage, `storage_encrypted = true`.
  - `manage_master_user_password = true`: RDS generates the master password and stores it in Secrets Manager. No password is accepted, stored, or output by Terraform.
  - `multi_az` (default `true`), `publicly_accessible = false`, attached only to the database security group.
  - IAM database authentication, error and slow-query logs exported to CloudWatch.
  - Automated backups (default 7 days), snapshot tags copied.

## Inputs

| Name | Description | Default |
| --- | --- | --- |
| `project_name`, `environment` | Naming and tags | required |
| `private_db_subnet_ids` | Private DB subnets (at least 2) | required |
| `database_security_group_id` | Database security group | required |
| `engine_version` | MySQL version | `8.0` |
| `instance_class` | Instance class | `db.t3.micro` |
| `allocated_storage` / `max_allocated_storage` | GiB, autoscaling limit (`null` disables) | `20` / `100` |
| `multi_az` | Standby in a second AZ | `true` |
| `db_name` / `master_username` | Initial database and master user | `appdb` / `dbadmin` |
| `backup_retention_period` | Days (1-35) | `7` |
| `deletion_protection` | Block deletion | `false` |
| `skip_final_snapshot` | Skip snapshot on delete | `false` |
| `apply_immediately` | Skip the maintenance window | `false` |

## Outputs

`db_instance_id`, `db_instance_arn`, `db_address`, `db_port`, `master_user_secret_arn`.

## Limitations and costs

- **Multi-AZ doubles database instance cost.** Set `multi_az = false` only for a cheaper dev environment without failover.
- Deletion protection is off by default (development); enable it outside dev. With `skip_final_snapshot = false`, destroying the instance requires the snapshot name `<identifier>-final` to be free.
- The secret ARN is exported, but no application role is granted `secretsmanager:GetSecretValue` on it. The shared EC2 role would give that access to both tiers, so granting it is deferred until backend access is scoped (for example a dedicated backend role).
- Encryption uses the account default RDS KMS key, not a customer-managed key.
- The password is stored in Secrets Manager (which is billed) and the RDS-managed secret is rotated automatically by RDS.
- Nothing was verified against AWS, including that the engine version and instance class combination is available in the target region.
