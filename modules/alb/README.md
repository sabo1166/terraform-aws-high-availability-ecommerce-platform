# ALB Module

Creates the public and internal Application Load Balancers, their target groups, and HTTP listeners.

Status: statically validated only. It is not connected to `environments/dev`, and nothing has been planned or applied.

## Resources

- `aws_lb.public`: internet-facing ALB in the public subnets, using the public ALB security group.
- `aws_lb.internal`: internal ALB in the private application subnets, using the internal ALB security group.
- `aws_lb_target_group.frontend`: HTTP, `frontend_port` (default 80), `target_type = "instance"`, name prefix `fe-`.
- `aws_lb_target_group.backend`: HTTP, `backend_port` (default 3000), `target_type = "instance"`, name prefix `be-`.
- `aws_lb_listener.public_http`: port 80 forwarding to the frontend target group (or a 403 default plus `aws_lb_listener_rule.origin_verified` when origin verification is enabled).
- `aws_lb_listener.internal_http`: port 80 forwarding to the backend target group.

Both load balancers drop invalid HTTP header fields. Cross-zone load balancing is the ALB default (enabled).

## Inputs

| Name | Description | Default |
| --- | --- | --- |
| `project_name`, `environment` | Naming and tags | required |
| `vpc_id` | VPC for the target groups | required |
| `public_subnet_ids` | Public subnets (at least 2) | required |
| `private_app_subnet_ids` | Private app subnets (at least 2) | required |
| `public_alb_security_group_id` | Public ALB security group | required |
| `internal_alb_security_group_id` | Internal ALB security group | required |
| `frontend_port` | Frontend target port (1-65535) | `80` |
| `backend_port` | Backend target port (1-65535) | `3000` |
| `frontend_health_check_path` | Must start with `/` | `/` |
| `backend_health_check_path` | Must start with `/` | `/` |
| `health_check_interval` | Seconds, 5-300 | `30` |
| `health_check_timeout` | Seconds, 2-120, lower than interval | `5` |
| `healthy_threshold` / `unhealthy_threshold` | 2-10 | `3` / `3` |
| `health_check_matcher` | Healthy HTTP codes | `200-399` |
| `public_alb_deletion_protection` | Public ALB deletion protection | `false` |
| `internal_alb_deletion_protection` | Internal ALB deletion protection | `false` |

### Optional inputs: access logs and origin verification

| Name | Description | Default |
| --- | --- | --- |
| `access_logs_bucket_name` | Enables access logs on both ALBs when set (bucket and policy from the logging module must exist first) | `null` |
| `access_logs_prefix` | Log prefix; must match the logging module's `alb_log_prefix` | `alb` |
| `enable_origin_verification` | Public ALB answers 403 unless the secret header is present | `false` |
| `origin_verify_header_name` | Header name | `X-Origin-Verify` |
| `origin_verify_header_value` | Secret header value (sensitive, stored in state); required when verification is enabled | `null` |

## Outputs

`public_alb_dns_name`, `public_alb_arn`, `public_alb_arn_suffix`, `public_alb_zone_id`, `internal_alb_dns_name`, `internal_alb_arn`, `internal_alb_arn_suffix`, `frontend_target_group_arn`, `frontend_target_group_arn_suffix`, `backend_target_group_arn`, `backend_target_group_arn_suffix`. The ARN suffixes are CloudWatch metric dimensions.

## Limitations and exclusions

- **Health-check paths are placeholders.** The default `/` has not been verified against any application endpoint; no application code exists yet. Set the real paths before relying on health checks.
- The internal listener uses port 80 because the Security module only allows frontend traffic to the internal ALB on port 80; it forwards to the backend port.
- Traffic is plain HTTP. There is no HTTPS listener, certificate, or HTTP-to-HTTPS redirect (requires the ACM module).
- The public ALB security group is open to the internet on ports 80 and 443; restricting it to CloudFront is not implemented (requires the CloudFront module).
- Access logging and the origin verification header are optional and off by default. The header check protects against direct requests but travels over plain HTTP between CloudFront and the ALB.
- No targets are registered; the Compute module must attach Auto Scaling Groups to the target groups.
- ALB names must be 32 characters or fewer (`<project>-<environment>-internal-alb`); a precondition reports violations at plan time.
