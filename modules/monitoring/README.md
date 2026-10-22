# Monitoring Module

Creates a KMS-encrypted SNS topic and CloudWatch alarms for the load balancers, Auto Scaling Groups, and database.

Status: statically validated only. No alarm has been evaluated on AWS, and the monitored resources have not been deployed.

## Resources

- `aws_kms_key.alarms` (rotation enabled) and alias: encrypts the topic. A customer-managed key is needed because CloudWatch alarms cannot publish to topics encrypted with the AWS-managed SNS key.
- `aws_sns_topic.alarms` and optional email subscriptions (`alarm_email_addresses`; each recipient must confirm).
- `aws_cloudwatch_metric_alarm.this` (notification only, `treat_missing_data = notBreaching`, 5-minute periods):

| Alarm | Metric |
| --- | --- |
| `public-alb-5xx` | `HTTPCode_ELB_5XX_Count` (Sum) |
| `frontend-unhealthy-hosts`, `backend-unhealthy-hosts` | `UnHealthyHostCount` (Max, at least 1) |
| `frontend-cpu-high`, `backend-cpu-high` | EC2 `CPUUtilization` by Auto Scaling Group |
| `database-cpu-high` | RDS `CPUUtilization` |
| `database-free-storage-low` | RDS `FreeStorageSpace` (Min) |

## Inputs

| Name | Description | Default |
| --- | --- | --- |
| `project_name`, `environment` | Naming and tags | required |
| `public_alb_arn_suffix`, `internal_alb_arn_suffix` | ALB metric dimensions | required |
| `frontend_target_group_arn_suffix`, `backend_target_group_arn_suffix` | Target group dimensions | required |
| `frontend_asg_name`, `backend_asg_name` | Auto Scaling Group names | required |
| `db_instance_id` | RDS identifier | required |
| `alarm_email_addresses` | Email subscribers | `[]` |
| `alb_5xx_threshold` | 5XX count per period | `10` |
| `cpu_utilization_threshold` | Percent | `80` |
| `db_free_storage_threshold_bytes` | Bytes | `2147483648` |
| `alarm_evaluation_periods` | Consecutive periods | `2` |

## Outputs

`alarm_topic_arn`, `alarm_kms_key_arn`, `alarm_names`.

## Limitations

- **Unhealthy-host alarms will fire** while the placeholder bootstrap serves no application, because the target groups have no healthy targets.
- No CloudFront, WAF, NAT Gateway, or Lambda alarms and no dashboard; CloudFront and WAF metrics live in `us-east-1`.
- Detailed (1-minute) EC2 monitoring is not enabled, and CPU alarms use the five-minute default metrics.
- Thresholds are starting values, not tuned from measurements.
- The KMS key and SNS topic add small ongoing charges; alarms are billed per alarm metric.
