## Shared tags and names for all load balancer resources.
locals {
  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
  }

  public_alb_name   = "${var.project_name}-${var.environment}-public-alb"
  internal_alb_name = "${var.project_name}-${var.environment}-internal-alb"
}

## Internet-facing ALB in the public subnets. Traffic is limited by the public ALB security group.
## Invalid HTTP headers are dropped to reduce request-smuggling exposure.
resource "aws_lb" "public" {
  name                       = local.public_alb_name
  load_balancer_type         = "application"
  internal                   = false
  subnets                    = var.public_subnet_ids
  security_groups            = [var.public_alb_security_group_id]
  drop_invalid_header_fields = true
  enable_deletion_protection = var.public_alb_deletion_protection

  dynamic "access_logs" {
    for_each = var.access_logs_bucket_name == null ? [] : [1]

    content {
      bucket  = var.access_logs_bucket_name
      prefix  = var.access_logs_prefix
      enabled = true
    }
  }

  tags = merge(local.common_tags, {
    Name = local.public_alb_name
    Tier = "public"
  })

  ## ALB names are limited to 32 characters.
  lifecycle {
    precondition {
      condition     = length(local.public_alb_name) <= 32
      error_message = "The public ALB name exceeds 32 characters; shorten project_name or environment."
    }
  }
}

## Internal ALB in the private application subnets. It has no route from the internet.
resource "aws_lb" "internal" {
  name                       = local.internal_alb_name
  load_balancer_type         = "application"
  internal                   = true
  subnets                    = var.private_app_subnet_ids
  security_groups            = [var.internal_alb_security_group_id]
  drop_invalid_header_fields = true
  enable_deletion_protection = var.internal_alb_deletion_protection

  dynamic "access_logs" {
    for_each = var.access_logs_bucket_name == null ? [] : [1]

    content {
      bucket  = var.access_logs_bucket_name
      prefix  = var.access_logs_prefix
      enabled = true
    }
  }

  tags = merge(local.common_tags, {
    Name = local.internal_alb_name
    Tier = "internal"
  })

  lifecycle {
    precondition {
      condition     = length(local.internal_alb_name) <= 32
      error_message = "The internal ALB name exceeds 32 characters; shorten project_name or environment."
    }
  }
}

## Frontend target group. name_prefix plus create_before_destroy lets settings that
## force replacement (such as the port) change without a naming conflict.
resource "aws_lb_target_group" "frontend" {
  name_prefix = "fe-"
  vpc_id      = var.vpc_id
  target_type = "instance"
  protocol    = "HTTP"
  port        = var.frontend_port

  health_check {
    protocol            = "HTTP"
    path                = var.frontend_health_check_path
    port                = "traffic-port"
    interval            = var.health_check_interval
    timeout             = var.health_check_timeout
    healthy_threshold   = var.healthy_threshold
    unhealthy_threshold = var.unhealthy_threshold
    matcher             = var.health_check_matcher
  }

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-${var.environment}-frontend-tg"
    Tier = "frontend"
  })

  lifecycle {
    create_before_destroy = true

    precondition {
      condition     = var.health_check_timeout < var.health_check_interval
      error_message = "health_check_timeout must be lower than health_check_interval."
    }
  }
}

## Backend target group for the API tier.
resource "aws_lb_target_group" "backend" {
  name_prefix = "be-"
  vpc_id      = var.vpc_id
  target_type = "instance"
  protocol    = "HTTP"
  port        = var.backend_port

  health_check {
    protocol            = "HTTP"
    path                = var.backend_health_check_path
    port                = "traffic-port"
    interval            = var.health_check_interval
    timeout             = var.health_check_timeout
    healthy_threshold   = var.healthy_threshold
    unhealthy_threshold = var.unhealthy_threshold
    matcher             = var.health_check_matcher
  }

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-${var.environment}-backend-tg"
    Tier = "backend"
  })

  lifecycle {
    create_before_destroy = true

    precondition {
      condition     = var.health_check_timeout < var.health_check_interval
      error_message = "health_check_timeout must be lower than health_check_interval."
    }
  }
}

## Public HTTP listener. Plain HTTP only until a regional certificate and HTTPS listener exist.
## With origin verification enabled, the default action is a 403 and only requests carrying the
## secret header are forwarded (see the listener rule below).
resource "aws_lb_listener" "public_http" {
  load_balancer_arn = aws_lb.public.arn
  port              = 80
  protocol          = "HTTP"

  dynamic "default_action" {
    for_each = var.enable_origin_verification ? [] : [1]

    content {
      type             = "forward"
      target_group_arn = aws_lb_target_group.frontend.arn
    }
  }

  dynamic "default_action" {
    for_each = var.enable_origin_verification ? [1] : []

    content {
      type = "fixed-response"

      fixed_response {
        content_type = "text/plain"
        message_body = "Forbidden"
        status_code  = "403"
      }
    }
  }

  tags = local.common_tags
}

## Forward only requests that carry the CloudFront origin verification header.
resource "aws_lb_listener_rule" "origin_verified" {
  count = var.enable_origin_verification ? 1 : 0

  listener_arn = aws_lb_listener.public_http.arn
  priority     = 10

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.frontend.arn
  }

  condition {
    http_header {
      http_header_name = var.origin_verify_header_name
      values           = [var.origin_verify_header_value]
    }
  }

  tags = local.common_tags

  lifecycle {
    precondition {
      condition     = var.origin_verify_header_value != null
      error_message = "origin_verify_header_value is required when enable_origin_verification is true."
    }
  }
}

## Internal HTTP listener on 80, the port the internal ALB security group allows from frontend instances.
## It forwards to the backend target group on the backend port.
resource "aws_lb_listener" "internal_http" {
  load_balancer_arn = aws_lb.internal.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.backend.arn
  }

  tags = local.common_tags
}
