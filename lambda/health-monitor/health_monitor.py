"""Read-only monitor for ALB target group health.

Invoked on a schedule (EventBridge). For each configured target group it calls
elbv2:DescribeTargetHealth and logs how many targets are healthy, unhealthy, or
in another state. It never changes infrastructure: no restarts, replacements,
or modifications.

Configuration (environment variable):
    TARGET_GROUPS - JSON object mapping a label to a target group ARN, for
                    example {"frontend": "arn:aws:elasticloadbalancing:..."}.

If any AWS API call fails, the failure is logged and the invocation raises at
the end, so the Lambda Errors metric records it. Unhealthy targets are reported
through logs only; they are not treated as invocation errors.
"""

import json
import logging
import os
import re

logger = logging.getLogger()
logger.setLevel(logging.INFO)

TARGET_GROUP_ARN_PATTERN = re.compile(
    r"^arn:aws[a-z-]*:elasticloadbalancing:[a-z0-9-]+:\d{12}:targetgroup/[A-Za-z0-9-]+/[0-9a-f]+$"
)
MAX_TARGET_GROUPS = 20


class ConfigurationError(Exception):
    """The Lambda environment configuration is invalid."""


def log_event(level, message, **fields):
    """Emit one structured (JSON) log line."""
    logger.log(level, json.dumps({"message": message, **fields}, default=str))


def get_client():
    """Create the ELBv2 client (imported lazily so unit tests need no boto3)."""
    import boto3

    return boto3.client("elbv2")


def load_target_groups(raw):
    """Validate the TARGET_GROUPS setting and return a {label: arn} dict."""
    if not raw:
        raise ConfigurationError("TARGET_GROUPS is not set")

    try:
        groups = json.loads(raw)
    except json.JSONDecodeError as error:
        raise ConfigurationError(f"TARGET_GROUPS is not valid JSON: {error.msg}") from error

    if not isinstance(groups, dict) or not groups:
        raise ConfigurationError("TARGET_GROUPS must be a non-empty JSON object")
    if len(groups) > MAX_TARGET_GROUPS:
        raise ConfigurationError(f"TARGET_GROUPS has more than {MAX_TARGET_GROUPS} entries")

    for label, arn in groups.items():
        if not isinstance(label, str) or not label:
            raise ConfigurationError("target group labels must be non-empty strings")
        if not isinstance(arn, str) or not TARGET_GROUP_ARN_PATTERN.match(arn):
            raise ConfigurationError(f"invalid target group ARN for '{label}'")

    return groups


def summarize_target_health(descriptions):
    """Count targets by state from DescribeTargetHealth descriptions."""
    states = {}
    for description in descriptions:
        state = description.get("TargetHealth", {}).get("State", "unknown")
        states[state] = states.get(state, 0) + 1

    total = sum(states.values())
    healthy = states.get("healthy", 0)
    unhealthy = states.get("unhealthy", 0)
    return {
        "total": total,
        "healthy": healthy,
        "unhealthy": unhealthy,
        "other": total - healthy - unhealthy,
        "states": states,
    }


def error_code(error):
    """Return the AWS error code from a client exception, if present."""
    response = getattr(error, "response", None)
    if isinstance(response, dict):
        return response.get("Error", {}).get("Code")
    return None


def check_target_group(client, label, arn):
    """Return a health summary for one target group; log the outcome."""
    response = client.describe_target_health(TargetGroupArn=arn)
    summary = summarize_target_health(response.get("TargetHealthDescriptions", []))

    if summary["total"] == 0:
        level, status = logging.ERROR, "no registered targets"
    elif summary["healthy"] == 0:
        level, status = logging.ERROR, "no healthy targets"
    elif summary["unhealthy"] > 0 or summary["other"] > 0:
        level, status = logging.WARNING, "degraded"
    else:
        level, status = logging.INFO, "all targets healthy"

    log_event(level, "target group health", target_group=label, status=status, **summary)
    return {"status": status, **summary}


def handler(event, context):
    """Check every configured target group and return a per-group summary."""
    try:
        groups = load_target_groups(os.environ.get("TARGET_GROUPS"))
    except ConfigurationError as error:
        log_event(logging.ERROR, "invalid configuration", error=str(error))
        raise

    client = get_client()
    results = {}
    failures = 0

    for label, arn in groups.items():
        try:
            results[label] = check_target_group(client, label, arn)
        except Exception as error:  # noqa: BLE001 - report every API failure, keep checking the rest
            failures += 1
            results[label] = {"status": "error"}
            log_event(
                logging.ERROR,
                "describe_target_health failed",
                target_group=label,
                error_type=type(error).__name__,
                error_code=error_code(error),
            )

    log_event(logging.INFO, "health check complete", checked=len(groups), failures=failures)

    if failures:
        raise RuntimeError(f"{failures} of {len(groups)} target group checks failed")

    return {"results": results}
