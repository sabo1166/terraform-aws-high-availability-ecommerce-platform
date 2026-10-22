## Shared tags for all security groups.
locals {
  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

## Public ALB: allow web traffic from the internet.
resource "aws_security_group" "public_alb" {
  name_prefix = "${var.project_name}-${var.environment}-public-alb-"
  description = "Security group for the internet-facing ALB."
  vpc_id      = var.vpc_id

  ingress {
    description = "HTTP web traffic"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS web traffic"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "Allow outbound traffic to application targets"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-${var.environment}-public-alb-sg"
  })

  lifecycle {
    create_before_destroy = true
  }
}

## Frontend EC2: only the public ALB can reach Nginx.
resource "aws_security_group" "frontend" {
  name_prefix = "${var.project_name}-${var.environment}-frontend-"
  description = "Security group for frontend EC2 instances."
  vpc_id      = var.vpc_id

  ingress {
    description     = "Nginx traffic from public ALB"
    from_port       = 80
    to_port         = 80
    protocol        = "tcp"
    security_groups = [aws_security_group.public_alb.id]
  }

  egress {
    description = "Outbound traffic for application operations"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-${var.environment}-frontend-sg"
  })

  lifecycle {
    create_before_destroy = true
  }
}

## Internal ALB: only frontend instances can call the API entry point.
resource "aws_security_group" "internal_alb" {
  name_prefix = "${var.project_name}-${var.environment}-internal-alb-"
  description = "Security group for the internal API ALB."
  vpc_id      = var.vpc_id

  ingress {
    description     = "API traffic from frontend EC2"
    from_port       = 80
    to_port         = 80
    protocol        = "tcp"
    security_groups = [aws_security_group.frontend.id]
  }

  egress {
    description = "Forward requests to backend targets"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-${var.environment}-internal-alb-sg"
  })

  lifecycle {
    create_before_destroy = true
  }
}

## Backend EC2: only the internal ALB can reach the Node.js API.
resource "aws_security_group" "backend" {
  name_prefix = "${var.project_name}-${var.environment}-backend-"
  description = "Security group for backend EC2 instances."
  vpc_id      = var.vpc_id

  ingress {
    description     = "Node.js API traffic from internal ALB"
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.internal_alb.id]
  }

  egress {
    description = "Outbound traffic for application operations"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-${var.environment}-backend-sg"
  })

  lifecycle {
    create_before_destroy = true
  }
}

## Database: only backend instances can connect to MySQL.
resource "aws_security_group" "database" {
  name_prefix = "${var.project_name}-${var.environment}-database-"
  description = "Security group for the RDS MySQL database."
  vpc_id      = var.vpc_id

  ingress {
    description     = "MySQL connections from backend EC2"
    from_port       = 3306
    to_port         = 3306
    protocol        = "tcp"
    security_groups = [aws_security_group.backend.id]
  }

  egress {
    description = "Default outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-${var.environment}-database-sg"
  })

  lifecycle {
    create_before_destroy = true
  }
}
