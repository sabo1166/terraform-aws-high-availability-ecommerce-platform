"""Local unit tests for the health monitor. Standard library only; AWS calls are mocked."""

import json
import logging
import os
import re
import sys
import unittest
from unittest import mock

sys.path.insert(
    0, os.path.join(os.path.dirname(__file__), "..", "..", "lambda", "health-monitor")
)

import health_monitor  # noqa: E402

FRONTEND_ARN = (
    "arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/fe-abc123/0123456789abcdef"
)
BACKEND_ARN = (
    "arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/be-abc123/fedcba9876543210"
)


def description(state):
    return {"TargetHealth": {"State": state}}


class FakeClientError(Exception):
    def __init__(self, code):
        super().__init__(code)
        self.response = {"Error": {"Code": code}}


class FakeClient:
    """Stands in for the boto3 ELBv2 client."""

    def __init__(self, responses):
        self.responses = responses
        self.calls = []

    def describe_target_health(self, TargetGroupArn):
        self.calls.append(TargetGroupArn)
        result = self.responses[TargetGroupArn]
        if isinstance(result, Exception):
            raise result
        return {"TargetHealthDescriptions": result}


def env(groups):
    return mock.patch.dict(os.environ, {"TARGET_GROUPS": json.dumps(groups)})


class LoadTargetGroupsTests(unittest.TestCase):
    def test_valid(self):
        groups = health_monitor.load_target_groups(json.dumps({"frontend": FRONTEND_ARN}))
        self.assertEqual(groups, {"frontend": FRONTEND_ARN})

    def test_invalid_configuration(self):
        bad = [
            None,
            "",
            "not json",
            "[]",
            "{}",
            json.dumps({"x": "not-an-arn"}),
            json.dumps({"x": 5}),
            json.dumps({"": FRONTEND_ARN}),
            json.dumps({f"g{i}": FRONTEND_ARN for i in range(21)}),
        ]
        for raw in bad:
            with self.subTest(raw=raw):
                with self.assertRaises(health_monitor.ConfigurationError):
                    health_monitor.load_target_groups(raw)


class SummarizeTests(unittest.TestCase):
    def test_counts(self):
        summary = health_monitor.summarize_target_health(
            [description("healthy"), description("healthy"), description("unhealthy"), description("initial")]
        )
        self.assertEqual(summary["total"], 4)
        self.assertEqual(summary["healthy"], 2)
        self.assertEqual(summary["unhealthy"], 1)
        self.assertEqual(summary["other"], 1)

    def test_empty_and_missing_state(self):
        self.assertEqual(health_monitor.summarize_target_health([])["total"], 0)
        self.assertEqual(health_monitor.summarize_target_health([{}])["states"], {"unknown": 1})


class HandlerTests(unittest.TestCase):
    def run_handler(self, groups, responses):
        client = FakeClient(responses)
        with env(groups), mock.patch.object(health_monitor, "get_client", return_value=client):
            with self.assertLogs(level=logging.INFO) as logs:
                try:
                    result = health_monitor.handler({}, None)
                    error = None
                except Exception as exc:  # noqa: BLE001
                    result, error = None, exc
        return result, error, logs.output, client

    def test_all_healthy(self):
        result, error, logs, client = self.run_handler(
            {"frontend": FRONTEND_ARN},
            {FRONTEND_ARN: [description("healthy"), description("healthy")]},
        )
        self.assertIsNone(error)
        self.assertEqual(result["results"]["frontend"]["status"], "all targets healthy")
        self.assertEqual(client.calls, [FRONTEND_ARN])
        self.assertTrue(any(line.startswith("INFO") for line in logs))

    def test_degraded_logs_warning(self):
        result, error, logs, _ = self.run_handler(
            {"frontend": FRONTEND_ARN},
            {FRONTEND_ARN: [description("healthy"), description("unhealthy")]},
        )
        self.assertIsNone(error)
        self.assertEqual(result["results"]["frontend"]["status"], "degraded")
        self.assertTrue(any(line.startswith("WARNING") for line in logs))

    def test_no_targets_and_no_healthy_log_error_without_raising(self):
        result, error, logs, _ = self.run_handler(
            {"frontend": FRONTEND_ARN, "backend": BACKEND_ARN},
            {FRONTEND_ARN: [], BACKEND_ARN: [description("unhealthy")]},
        )
        self.assertIsNone(error)
        self.assertEqual(result["results"]["frontend"]["status"], "no registered targets")
        self.assertEqual(result["results"]["backend"]["status"], "no healthy targets")
        self.assertTrue(any(line.startswith("ERROR") for line in logs))

    def test_api_error_is_logged_and_raised_after_checking_all(self):
        _, error, logs, client = self.run_handler(
            {"frontend": FRONTEND_ARN, "backend": BACKEND_ARN},
            {FRONTEND_ARN: FakeClientError("AccessDenied"), BACKEND_ARN: [description("healthy")]},
        )
        self.assertIsInstance(error, RuntimeError)
        self.assertEqual(client.calls, [FRONTEND_ARN, BACKEND_ARN])
        self.assertTrue(any("AccessDenied" in line for line in logs))

    def test_invalid_configuration_raises(self):
        with mock.patch.dict(os.environ, {"TARGET_GROUPS": "nope"}):
            with self.assertLogs(level=logging.ERROR):
                with self.assertRaises(health_monitor.ConfigurationError):
                    health_monitor.handler({}, None)

    def test_source_only_calls_describe_target_health(self):
        with open(health_monitor.__file__, encoding="utf-8") as source:
            calls = set(re.findall(r"client\.(\w+)\(", source.read()))
        self.assertEqual(calls, {"describe_target_health"})


if __name__ == "__main__":
    unittest.main()
