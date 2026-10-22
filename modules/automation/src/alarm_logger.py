"""Log-only handler for CloudWatch alarm notifications delivered through SNS.

It validates each notification and writes one structured JSON log line per
alarm. It takes no remediation action and calls no AWS APIs, so its execution
role needs nothing beyond CloudWatch Logs access.

Malformed records are logged and counted as rejected rather than raised: the
input cannot become valid on retry, so failing the invocation would only cause
pointless SNS redeliveries.
"""

import json
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

VALID_STATES = {"OK", "ALARM", "INSUFFICIENT_DATA"}
MAX_REASON_LENGTH = 500
MAX_RAW_LENGTH = 200


def log_event(level, message, **fields):
    """Emit one structured (JSON) log line."""
    logger.log(level, json.dumps({"message": message, **fields}, default=str))


def parse_alarm_message(raw):
    """Return a summary of a CloudWatch alarm state-change message.

    Raises ValueError if the message is not a valid alarm notification.
    """
    if not isinstance(raw, str) or not raw.strip():
        raise ValueError("SNS message is empty or not a string")

    try:
        body = json.loads(raw)
    except json.JSONDecodeError as error:
        raise ValueError(f"SNS message is not valid JSON: {error.msg}") from error

    if not isinstance(body, dict):
        raise ValueError("SNS message JSON is not an object")

    alarm_name = body.get("AlarmName")
    new_state = body.get("NewStateValue")

    if not isinstance(alarm_name, str) or not alarm_name:
        raise ValueError("AlarmName is missing or not a string")
    if new_state not in VALID_STATES:
        raise ValueError(f"NewStateValue must be one of {sorted(VALID_STATES)}")

    reason = body.get("NewStateReason")
    if isinstance(reason, str):
        reason = reason[:MAX_REASON_LENGTH]
    else:
        reason = None

    return {
        "alarm_name": alarm_name,
        "new_state": new_state,
        "old_state": body.get("OldStateValue"),
        "reason": reason,
        "state_change_time": body.get("StateChangeTime"),
        "region": body.get("Region"),
    }


def handler(event, context):
    """Process an SNS event and return counts of processed and rejected records."""
    records = event.get("Records") if isinstance(event, dict) else None
    if not isinstance(records, list):
        log_event(logging.ERROR, "invalid event: Records list is missing")
        return {"processed": 0, "rejected": 0, "error": "invalid event"}

    processed = 0
    rejected = 0

    for index, record in enumerate(records):
        try:
            raw = record["Sns"]["Message"]
            summary = parse_alarm_message(raw)
        except (KeyError, TypeError, ValueError) as error:
            rejected += 1
            log_event(
                logging.WARNING,
                "rejected notification",
                record_index=index,
                error=str(error),
            )
            continue

        processed += 1
        level = logging.WARNING if summary["new_state"] == "ALARM" else logging.INFO
        log_event(level, "alarm notification", **summary)

    log_event(logging.INFO, "batch complete", processed=processed, rejected=rejected)
    return {"processed": processed, "rejected": rejected}
