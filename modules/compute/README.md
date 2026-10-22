# Compute Module

Creates the frontend and backend Launch Templates and Auto Scaling Groups.

Status: **validate-only.** The module is statically validated, but it is not connected to `environments/dev`, and nothing has been planned, applied, or run on AWS. The bootstrap is a placeholder; no application is installed.

## Resources

Both tiers are created with `for_each` over `frontend` and `backend` (addresses such as `aws_launch_template.this["frontend"]`).

- `aws_launch_template.this`:
  - Amazon Linux 2023 (latest from the public SSM parameter, or `ami_id`).
  - IMDSv2 required (`http_tokens = "required"`, hop limit 1).
  - No public IP; the tier's existing security group.
  - Encrypted gp3 root volume (account default EBS key).
  - Shared EC2 instance profile.
  - Instance and volume tags (provider `default_tags` do not reach Auto Scaling launches).
- `aws_autoscaling_group.this`: private application subnets, `health_check_type = "ELB"`, target group registration, rolling instance refresh on launch template changes.
- `data.aws_ssm_parameter.al2023`: only when `ami_id` is null.

## Inputs

| Name | Description | Default |
| --- | --- | --- |
| `project_name`, `environment` | Naming and tags | required |
| `private_app_subnet_ids` | Private app subnets (at least 2) | required |
| `frontend_security_group_id`, `backend_security_group_id` | Security group per tier | required |
| `instance_profile_name` | Shared EC2 instance profile | required |
| `frontend_target_group_arn`, `backend_target_group_arn` | ALB target groups | required |
| `ami_id` | Optional AMI override | `null` |
| `frontend`, `backend` | Object: `instance_type`, `min_size`, `max_size`, `desired_capacity`, `root_volume_size` | `t3.micro`, 2, 4, 2, 20 |
| `health_check_grace_period` | Seconds | `300` |
| `instance_refresh_min_healthy_percentage` | Percent | `50` |
| `wait_for_capacity_timeout` | Terraform wait after ASG creation | `10m` |

Capacity must satisfy `2 <= min_size <= desired_capacity <= max_size` so each tier spans two Availability Zones.

## Outputs

`frontend_asg_name`, `frontend_asg_arn`, `backend_asg_name`, `backend_asg_arn`, `frontend_launch_template_id`, `backend_launch_template_id`.

## Limitations

- **Health-check paths live only in the ALB module.** They are not configured here and none has been verified against an application.
- **Bootstrap is a placeholder** (`templates/*.sh.tftpl`): it writes `/var/log/bootstrap.log` and records the tier, with TODOs for installing the web server and runtime, deploying artifacts, and shipping logs. Application bootstrap and runtime health verification are pending.
- **Expected failure until the application exists.** With ELB health checks, instances that serve nothing on the health-check path are marked unhealthy and replaced, and a real apply would wait up to `wait_for_capacity_timeout` for healthy capacity.
- The unpinned AMI lookup means a new Amazon Linux 2023 release triggers a rolling replacement; set `ami_id` to pin.
- One instance profile (and IAM role) is shared by both tiers; it currently grants only `CloudWatchAgentServerPolicy`. There is no SSH and no Systems Manager access, so diagnosis relies on logs.
- The root volume uses the account default EBS key, not a customer-managed KMS key.
- Instances need outbound access through NAT for any future package or artifact download; a single NAT is an availability risk.
- The AMI lookup requires AWS at plan time; `terraform validate` does not.
