## Shared tags and per-tier settings.
locals {
  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
  }

  ## Frontend and backend differ only in these values, so both tiers share the resources below.
  tiers = {
    frontend = {
      sizing             = var.frontend
      security_group_id  = var.frontend_security_group_id
      target_group_arn   = var.frontend_target_group_arn
      bootstrap_template = "${path.module}/templates/frontend_bootstrap.sh.tftpl"
    }
    backend = {
      sizing             = var.backend
      security_group_id  = var.backend_security_group_id
      target_group_arn   = var.backend_target_group_arn
      bootstrap_template = "${path.module}/templates/backend_bootstrap.sh.tftpl"
    }
  }

  ami_id = coalesce(var.ami_id, one(data.aws_ssm_parameter.al2023[*].insecure_value))
}

## Latest Amazon Linux 2023 AMI from the public AWS parameter, used only when ami_id is not set.
## The AMI ID is not a secret, so insecure_value avoids marking the launch template sensitive.
data "aws_ssm_parameter" "al2023" {
  count = var.ami_id == null ? 1 : 0

  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64"
}

## One launch template per tier.
resource "aws_launch_template" "this" {
  for_each = local.tiers

  name_prefix   = "${var.project_name}-${var.environment}-${each.key}-"
  description   = "Launch template for ${each.key} instances."
  image_id      = local.ami_id
  instance_type = each.value.sizing.instance_type

  iam_instance_profile {
    name = var.instance_profile_name
  }

  ## Require IMDSv2 so credential theft through SSRF cannot use the legacy metadata service.
  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
  }

  ## Instances live in private subnets and never receive a public IP address.
  network_interfaces {
    associate_public_ip_address = false
    security_groups             = [each.value.security_group_id]
    delete_on_termination       = true
  }

  ## Encrypt the root volume with the account's default EBS key.
  block_device_mappings {
    device_name = "/dev/xvda"

    ebs {
      volume_type           = "gp3"
      volume_size           = each.value.sizing.root_volume_size
      encrypted             = true
      delete_on_termination = true
    }
  }

  ## Placeholder bootstrap only: it logs the tier and installs no application. See the template TODOs.
  user_data = base64encode(templatefile(each.value.bootstrap_template, {
    tier        = each.key
    environment = var.environment
  }))

  ## Provider default_tags do not reach instances launched by Auto Scaling, so tag them here.
  tag_specifications {
    resource_type = "instance"

    tags = merge(local.common_tags, {
      Name = "${var.project_name}-${var.environment}-${each.key}"
      Tier = each.key
    })
  }

  tag_specifications {
    resource_type = "volume"

    tags = merge(local.common_tags, {
      Name = "${var.project_name}-${var.environment}-${each.key}"
      Tier = each.key
    })
  }

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-${var.environment}-${each.key}-lt"
    Tier = each.key
  })

  lifecycle {
    create_before_destroy = true
  }
}

## One Auto Scaling Group per tier, spread across the private application subnets.
## ELB health checks replace instances that fail the target group check, so a bootstrap
## that does not serve the configured health-check path will cause instances to be replaced.
resource "aws_autoscaling_group" "this" {
  for_each = local.tiers

  name_prefix               = "${var.project_name}-${var.environment}-${each.key}-"
  vpc_zone_identifier       = var.private_app_subnet_ids
  min_size                  = each.value.sizing.min_size
  max_size                  = each.value.sizing.max_size
  desired_capacity          = each.value.sizing.desired_capacity
  health_check_type         = "ELB"
  health_check_grace_period = var.health_check_grace_period
  target_group_arns         = [each.value.target_group_arn]
  wait_for_capacity_timeout = var.wait_for_capacity_timeout

  launch_template {
    id      = aws_launch_template.this[each.key].id
    version = aws_launch_template.this[each.key].latest_version
  }

  ## A new launch template version (including a new AMI) triggers a rolling replacement.
  instance_refresh {
    strategy = "Rolling"

    preferences {
      min_healthy_percentage = var.instance_refresh_min_healthy_percentage
    }
  }

  dynamic "tag" {
    for_each = merge(local.common_tags, {
      Name = "${var.project_name}-${var.environment}-${each.key}"
      Tier = each.key
    })

    content {
      key                 = tag.key
      value               = tag.value
      propagate_at_launch = true
    }
  }

  lifecycle {
    create_before_destroy = true
  }
}
