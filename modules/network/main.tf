## Discover available Availability Zones in the selected AWS region.
data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  ## Select the requested Availability Zones deterministically.
  availability_zones = slice(
    data.aws_availability_zones.available.names,
    0,
    var.az_count
  )

  ## Reuse consistent tags across all network resources.
  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
  }

  ## Map private application subnets to NAT Gateway routes.
  nat_gateway_ids = var.enable_nat_gateway ? (
    var.single_nat_gateway ? [aws_nat_gateway.this[0].id] : aws_nat_gateway.this[*].id
  ) : []
}

## Create an isolated VPC with DNS support enabled.
resource "aws_vpc" "this" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-${var.environment}-vpc"
  })
}

## Attach an Internet Gateway for public load-balancer subnets.
resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-${var.environment}-igw"
  })
}

## Create public subnets for internet-facing load balancers.
resource "aws_subnet" "public" {
  count = var.az_count

  vpc_id                  = aws_vpc.this.id
  cidr_block              = var.public_subnet_cidrs[count.index]
  availability_zone       = local.availability_zones[count.index]
  map_public_ip_on_launch = true

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-${var.environment}-public-${count.index + 1}"
    Tier = "public"
  })
}

## Create private application subnets for EC2 Auto Scaling Groups.
resource "aws_subnet" "private_app" {
  count = var.az_count

  vpc_id                  = aws_vpc.this.id
  cidr_block              = var.private_app_subnet_cidrs[count.index]
  availability_zone       = local.availability_zones[count.index]
  map_public_ip_on_launch = false

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-${var.environment}-app-${count.index + 1}"
    Tier = "private-app"
  })
}

## Create isolated private subnets for the RDS database.
resource "aws_subnet" "private_db" {
  count = var.az_count

  vpc_id                  = aws_vpc.this.id
  cidr_block              = var.private_db_subnet_cidrs[count.index]
  availability_zone       = local.availability_zones[count.index]
  map_public_ip_on_launch = false

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-${var.environment}-db-${count.index + 1}"
    Tier = "private-db"
  })
}

## Route public subnet traffic to the Internet Gateway.
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.this.id
  }

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-${var.environment}-public-rt"
  })
}

resource "aws_route_table_association" "public" {
  count = var.az_count

  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

## Create NAT Gateways only when private instances require outbound internet access.
resource "aws_eip" "nat" {
  count = var.enable_nat_gateway ? (var.single_nat_gateway ? 1 : var.az_count) : 0

  domain = "vpc"

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-${var.environment}-nat-eip-${count.index + 1}"
  })

  depends_on = [aws_internet_gateway.this]
}

resource "aws_nat_gateway" "this" {
  count = var.enable_nat_gateway ? (var.single_nat_gateway ? 1 : var.az_count) : 0

  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[var.single_nat_gateway ? 0 : count.index].id

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-${var.environment}-nat-${count.index + 1}"
  })

  depends_on = [aws_internet_gateway.this]
}

## Give private application subnets outbound routes without exposing their instances publicly.
resource "aws_route_table" "private_app" {
  count = var.az_count

  vpc_id = aws_vpc.this.id

  dynamic "route" {
    for_each = var.enable_nat_gateway ? [1] : []

    content {
      cidr_block     = "0.0.0.0/0"
      nat_gateway_id = local.nat_gateway_ids[var.single_nat_gateway ? 0 : count.index]
    }
  }

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-${var.environment}-app-rt-${count.index + 1}"
  })
}

resource "aws_route_table_association" "private_app" {
  count = var.az_count

  subnet_id      = aws_subnet.private_app[count.index].id
  route_table_id = aws_route_table.private_app[count.index].id
}

## Keep database subnets isolated from direct internet routes.
resource "aws_route_table" "private_db" {
  vpc_id = aws_vpc.this.id

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-${var.environment}-db-rt"
  })
}

resource "aws_route_table_association" "private_db" {
  count = var.az_count

  subnet_id      = aws_subnet.private_db[count.index].id
  route_table_id = aws_route_table.private_db.id
}
