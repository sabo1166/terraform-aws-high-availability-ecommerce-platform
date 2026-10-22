## Shared tags for all IAM resources.
locals {
  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

## EC2 trust policy: only the EC2 service may assume this role.
## No account-wide or wildcard principals are allowed.
data "aws_iam_policy_document" "ec2_assume_role" {
  statement {
    sid     = "AllowEC2ServiceAssumeRole"
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ec2" {
  name_prefix        = "${var.project_name}-${var.environment}-ec2-"
  description        = "Role assumed by application EC2 instances."
  assume_role_policy = data.aws_iam_policy_document.ec2_assume_role.json

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-${var.environment}-ec2-role"
  })
}

## The AWS-managed CloudWatch agent policy is scoped to metrics, logs, and
## agent configuration; it grants no access to application data or AWS control planes.
## Systems Manager is not used by this project, so AmazonSSMManagedInstanceCore is intentionally not attached.
resource "aws_iam_role_policy_attachment" "ec2_cloudwatch_agent" {
  role       = aws_iam_role.ec2.name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy"
}

## EC2 instances receive the role through an instance profile.
resource "aws_iam_instance_profile" "ec2" {
  name_prefix = "${var.project_name}-${var.environment}-ec2-"
  role        = aws_iam_role.ec2.name

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-${var.environment}-ec2-profile"
  })
}

## Lambda trust policy: only the Lambda service may assume this role.
data "aws_iam_policy_document" "lambda_assume_role" {
  statement {
    sid     = "AllowLambdaServiceAssumeRole"
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda" {
  name_prefix        = "${var.project_name}-${var.environment}-lambda-"
  description        = "Execution role for Lambda functions."
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-${var.environment}-lambda-role"
  })
}

## Basic execution only allows writing to CloudWatch Logs.
## Automation permissions (EC2, Auto Scaling, etc.) are deliberately not granted yet
## and must be added later as narrowly scoped policies.
resource "aws_iam_role_policy_attachment" "lambda_basic_execution" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}
