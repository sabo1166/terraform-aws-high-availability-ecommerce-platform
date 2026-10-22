# Health Monitor Lambda

Read-only, scheduled check of ALB target group health. Source: `health_monitor.py`.

Terraform packaging, IAM, schedule, configuration, and limitations are documented in `modules/automation/README.md` (section "Health monitor"). Tests: `tests/lambda/test_health_monitor.py` (`python -B -m unittest discover -s tests/lambda -v`).

Not deployed or run against AWS; unit tests use mocked responses only.
