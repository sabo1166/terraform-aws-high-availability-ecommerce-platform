# Automation Module

A safe, log-only automation foundation: a Lambda function subscribed to the alarm SNS topic, plus an optional read-only target group health monitor.

Status: statically validated only. The function has not been deployed or invoked.

## Why log-only

No operational automation is defined in this repository, so no remediation is invented. The function records each alarm notification in CloudWatch Logs and does nothing else. It uses the IAM module's Lambda role, which only has `AWSLambdaBasicExecutionRole` (CloudWatch Logs), and the handler calls no AWS APIs. Real automation (for example scaling or restarts) needs a defined requirement and a separately scoped IAM policy.

## Health monitor (optional, `enable_health_monitor`)

A second, independent Lambda in `health_monitor.tf`, with source in the repository's root `lambda/health-monitor/health_monitor.py` (the alarm logger above is unchanged).

- **Purpose:** on an EventBridge schedule (default `rate(5 minutes)`), call `elbv2:DescribeTargetHealth` for each target group in `health_monitor_target_group_arns` and log healthy, unhealthy, and other target counts. Status log levels: `INFO` all healthy, `WARNING` degraded, `ERROR` no registered targets or no healthy targets.
- **Read-only:** it restarts, replaces, and modifies nothing. A unit test checks the source only calls `describe_target_health`.
- **Configuration:** the `TARGET_GROUPS` environment variable (JSON map of label to ARN, set by Terraform from `jsonencode(var.health_monitor_target_group_arns)`). ARNs are validated both in Terraform and in the handler. In `environments/dev` the ARNs come from the ALB module outputs, so no identifier is invented.
- **Errors:** an API failure is logged (`error_type`, `error_code`), the remaining groups are still checked, and the invocation then raises so the Lambda `Errors` metric records it. Async retries are disabled (`maximum_retry_attempts = 0`); the next schedule runs the check again. Unhealthy targets are logged, not raised.
- **Permissions:** a dedicated role (the shared IAM-module Lambda role is not used). Its inline policy allows `logs:CreateLogStream` and `logs:PutLogEvents` on its own log group only, plus `elasticloadbalancing:DescribeTargetHealth` on `*` (the API has no resource-level permissions). No EC2, Auto Scaling, IAM, or write permissions.
- **Packaging:** `archive_file` zips the single file `lambda/health-monitor/health_monitor.py` (path `../../lambda/health-monitor/` relative to this module) into `build/health_monitor.zip` (gitignored); handler `health_monitor.handler`, runtime `python3.12`. The zip was not generated or inspected locally (plan-time data source).
- **Inputs:** `enable_health_monitor` (default `false` in the module, `true` in dev), `health_monitor_target_group_arns`, `health_monitor_schedule_expression`. **Outputs:** `health_monitor_function_name`, `health_monitor_log_group_name`.
- **Local tests** (mocked AWS responses, standard library only): `python -B -m unittest discover -s tests/lambda -v`
- **Limitations:** it reports target health only; it does not probe the application, create alarms, or notify (the monitoring module's `UnHealthyHostCount` alarms do that). Until an application serves the ALB health-check path it will log errors every run. It has not been deployed, and real `DescribeTargetHealth` responses were not exercised; the code relies on the documented response shape. The unit tests ran on Python 3.13, not the Lambda 3.12 runtime. It is regional and assumes the target groups are in the function's region.

## Handler behavior (`src/alarm_logger.py`)

- Validates the SNS event (`Records` must be a list) and each record's `Sns.Message`.
- Accepts only CloudWatch alarm state-change messages: JSON object with a non-empty `AlarmName` and `NewStateValue` of `OK`, `ALARM`, or `INSUFFICIENT_DATA`.
- Writes one structured JSON log line per alarm (`alarm_name`, `new_state`, `old_state`, `reason` truncated to 500 characters, `state_change_time`, `region`): `WARNING` level for `ALARM`, `INFO` otherwise, plus a batch summary line.
- Malformed records are logged as rejected and counted; the function does not raise, because retries cannot fix bad input. It returns `{"processed": n, "rejected": m}`.
- Calls no AWS APIs and has no environment variables or secrets.

## Testing

Standard-library unit tests, no AWS access or dependencies:

```powershell
python -B -m unittest discover -s modules/automation/tests -v
```

Terraform checks (use an isolated copy, since `init` creates `.terraform/`):
`terraform fmt -check -recursive modules/automation`, then `terraform init -backend=false` and `terraform validate`.

## Deployment and validation

1. Deploy through `environments/dev` only after human approval of a reviewed `terraform plan`; the module is not deployed by default tooling here.
2. Terraform zips `src/alarm_logger.py` into `build/alarm_logger.zip` (gitignored) at plan time; the zip contains only that file at its root, matching `handler = "alarm_logger.handler"`. The tests directory is not packaged.
3. After a deployment, verify by publishing a sample alarm message to the topic (or using `aws cloudwatch set-alarm-state` on a test alarm) and checking the function's log group for the JSON lines. This has not been done.

## Resources

- `data.archive_file.alarm_logger`: zips `src/alarm_logger.py` into `build/` (gitignored). This module therefore declares the `hashicorp/archive` provider in `versions.tf`.
- `aws_cloudwatch_log_group.alarm_logger`: bounded retention (default 30 days).
- `aws_lambda_function.alarm_logger`: Python 3.12, 128 MB, 10 s timeout.
- `aws_lambda_permission.sns`: only the alarm topic can invoke the function.
- `aws_sns_topic_subscription.alarm_logger`: subscribes the function to the topic.

## Inputs

| Name | Description | Default |
| --- | --- | --- |
| `project_name`, `environment` | Naming and tags | required |
| `lambda_role_arn` | IAM module Lambda role | required |
| `alarm_topic_arn` | Monitoring module SNS topic | required |
| `log_retention_days` | Log retention | `30` |

## Outputs

`lambda_function_name`, `lambda_function_arn`, `lambda_log_group_name`.

## Limitations

- The generated zip was not inspected: `archive_file` is a data source read at plan time, and `terraform console` shows it as "known after apply" without a plan. The packaging is verified only by reading the configuration (single `source_file`, handler name matches the module and function).
- Unit tests ran on Python 3.13 locally; the deployed runtime is Python 3.12 and has not been tested.
- Log-only: no remediation. The `lambda/automation` directory remains empty.
- The shared Lambda role is `AWSLambdaBasicExecutionRole`, which allows log writes to any log group in the account; a dedicated role would be tighter.
- Logged alarm messages include resource names and metric values.
- The Python runtime version was chosen as a supported default and has not been tested.
