"""Local unit tests for the alarm logger. Standard library only; no AWS access."""

import json
import logging
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

import alarm_logger  # noqa: E402


def sns_record(message):
    return {"EventSource": "aws:sns", "Sns": {"Message": message}}


def alarm_message(**overrides):
    body = {
        "AlarmName": "ha-ecommerce-dev-public-alb-5xx",
        "NewStateValue": "ALARM",
        "OldStateValue": "OK",
        "NewStateReason": "Threshold crossed",
        "StateChangeTime": "2026-01-01T00:00:00.000+0000",
        "Region": "US East (N. Virginia)",
    }
    body.update(overrides)
    return json.dumps(body)


class ParseAlarmMessageTests(unittest.TestCase):
    def test_valid_message(self):
        summary = alarm_logger.parse_alarm_message(alarm_message())
        self.assertEqual(summary["alarm_name"], "ha-ecommerce-dev-public-alb-5xx")
        self.assertEqual(summary["new_state"], "ALARM")
        self.assertEqual(summary["old_state"], "OK")

    def test_reason_is_truncated(self):
        summary = alarm_logger.parse_alarm_message(
            alarm_message(NewStateReason="x" * 5000)
        )
        self.assertEqual(len(summary["reason"]), alarm_logger.MAX_REASON_LENGTH)

    def test_rejects_invalid_input(self):
        bad_inputs = [
            None,
            "",
            "   ",
            "not json",
            "[]",
            json.dumps({"NewStateValue": "ALARM"}),
            json.dumps({"AlarmName": "a", "NewStateValue": "BROKEN"}),
            json.dumps({"AlarmName": "", "NewStateValue": "OK"}),
        ]
        for raw in bad_inputs:
            with self.subTest(raw=raw):
                with self.assertRaises(ValueError):
                    alarm_logger.parse_alarm_message(raw)


class HandlerTests(unittest.TestCase):
    def test_processes_valid_records(self):
        event = {"Records": [sns_record(alarm_message()), sns_record(alarm_message(NewStateValue="OK"))]}
        with self.assertLogs(level=logging.INFO) as logs:
            result = alarm_logger.handler(event, None)
        self.assertEqual(result, {"processed": 2, "rejected": 0})
        for line in logs.output:
            json.loads(line.split(":", 2)[2])  # every log line is JSON

    def test_alarm_state_logs_at_warning(self):
        with self.assertLogs(level=logging.INFO) as logs:
            alarm_logger.handler({"Records": [sns_record(alarm_message())]}, None)
        self.assertTrue(any(line.startswith("WARNING") for line in logs.output))

    def test_malformed_record_is_rejected_not_raised(self):
        event = {"Records": [sns_record("garbage"), {"Sns": {}}, "oops", sns_record(alarm_message())]}
        with self.assertLogs(level=logging.INFO):
            result = alarm_logger.handler(event, None)
        self.assertEqual(result, {"processed": 1, "rejected": 3})

    def test_invalid_event_shapes(self):
        for event in (None, "x", [], {}, {"Records": "nope"}):
            with self.subTest(event=event):
                with self.assertLogs(level=logging.ERROR):
                    result = alarm_logger.handler(event, None)
                self.assertEqual(result["processed"], 0)
                self.assertEqual(result["error"], "invalid event")

    def test_empty_records_list(self):
        with self.assertLogs(level=logging.INFO):
            result = alarm_logger.handler({"Records": []}, None)
        self.assertEqual(result, {"processed": 0, "rejected": 0})


if __name__ == "__main__":
    unittest.main()
