## Configure the AWS provider for the selected environment.
provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}

## CloudFront certificates and CloudFront-scoped WAF web ACLs must be created in us-east-1.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}

locals {
  ## Every name served by CloudFront; also used for the certificate and DNS records.
  domain_names = concat([var.domain_name], var.subject_alternative_names)
}

## Create the network foundation before deploying application services.
module "network" {
  source = "../../modules/network"

  project_name             = var.project_name
  environment              = var.environment
  vpc_cidr                 = var.vpc_cidr
  az_count                 = var.az_count
  public_subnet_cidrs      = var.public_subnet_cidrs
  private_app_subnet_cidrs = var.private_app_subnet_cidrs
  private_db_subnet_cidrs  = var.private_db_subnet_cidrs
  enable_nat_gateway       = var.enable_nat_gateway
  single_nat_gateway       = var.single_nat_gateway
}

## Create security groups and enforce application-tier traffic boundaries.
module "security" {
  source = "../../modules/security"

  project_name = var.project_name
  environment  = var.environment
  vpc_id       = module.network.vpc_id
}

## Create least-privilege IAM roles for EC2 instances and Lambda functions.
module "iam" {
  source = "../../modules/iam"

  project_name = var.project_name
  environment  = var.environment
}

## Create the ALB access log bucket and Athena workgroup before the ALBs write logs.
module "logging" {
  source = "../../modules/logging"

  project_name         = var.project_name
  environment          = var.environment
  alb_logs_bucket_name = var.alb_logs_bucket_name
}

## Create the public and internal ALBs. The logging module must finish first so the
## bucket policy exists when access logging is enabled.
module "alb" {
  source = "../../modules/alb"

  project_name                   = var.project_name
  environment                    = var.environment
  vpc_id                         = module.network.vpc_id
  public_subnet_ids              = module.network.public_subnet_ids
  private_app_subnet_ids         = module.network.private_app_subnet_ids
  public_alb_security_group_id   = module.security.public_alb_security_group_id
  internal_alb_security_group_id = module.security.internal_alb_security_group_id
  access_logs_bucket_name        = module.logging.alb_logs_bucket_name
  enable_origin_verification     = true
  origin_verify_header_value     = var.origin_verify_header_value

  depends_on = [module.logging]
}

## Create the frontend and backend Auto Scaling Groups behind the ALB target groups.
module "compute" {
  source = "../../modules/compute"

  project_name               = var.project_name
  environment                = var.environment
  private_app_subnet_ids     = module.network.private_app_subnet_ids
  frontend_security_group_id = module.security.frontend_security_group_id
  backend_security_group_id  = module.security.backend_security_group_id
  instance_profile_name      = module.iam.ec2_instance_profile_name
  frontend_target_group_arn  = module.alb.frontend_target_group_arn
  backend_target_group_arn   = module.alb.backend_target_group_arn
  frontend                   = var.frontend
  backend                    = var.backend
}

## Create the RDS MySQL database in the private database subnets.
module "database" {
  source = "../../modules/database"

  project_name               = var.project_name
  environment                = var.environment
  private_db_subnet_ids      = module.network.private_db_subnet_ids
  database_security_group_id = module.security.database_security_group_id
  instance_class             = var.db_instance_class
  multi_az                   = var.db_multi_az
  deletion_protection        = var.db_deletion_protection
  skip_final_snapshot        = var.db_skip_final_snapshot
}

## Create alarms and the encrypted notification topic.
module "monitoring" {
  source = "../../modules/monitoring"

  project_name                     = var.project_name
  environment                      = var.environment
  public_alb_arn_suffix            = module.alb.public_alb_arn_suffix
  internal_alb_arn_suffix          = module.alb.internal_alb_arn_suffix
  frontend_target_group_arn_suffix = module.alb.frontend_target_group_arn_suffix
  backend_target_group_arn_suffix  = module.alb.backend_target_group_arn_suffix
  frontend_asg_name                = module.compute.frontend_asg_name
  backend_asg_name                 = module.compute.backend_asg_name
  db_instance_id                   = module.database.db_instance_id
  alarm_email_addresses            = var.alarm_email_addresses
}

## Create the log-only alarm automation foundation.
module "automation" {
  source = "../../modules/automation"

  project_name    = var.project_name
  environment     = var.environment
  lambda_role_arn = module.iam.lambda_role_arn
  alarm_topic_arn = module.monitoring.alarm_topic_arn

  enable_health_monitor              = var.enable_health_monitor
  health_monitor_schedule_expression = var.health_monitor_schedule_expression
  health_monitor_target_group_arns = {
    frontend = module.alb.frontend_target_group_arn
    backend  = module.alb.backend_target_group_arn
  }
}

## Create the validated CloudFront certificate in us-east-1.
module "acm" {
  source = "../../modules/acm"

  providers = {
    aws = aws.us_east_1
  }

  project_name              = var.project_name
  environment               = var.environment
  domain_name               = var.domain_name
  subject_alternative_names = var.subject_alternative_names
  hosted_zone_id            = var.route53_hosted_zone_id
}

## Create the CloudFront WAF web ACL in us-east-1.
module "waf" {
  source = "../../modules/waf"

  providers = {
    aws = aws.us_east_1
  }

  project_name = var.project_name
  environment  = var.environment
}

## Create the CloudFront distribution in front of the public ALB.
module "cloudfront" {
  source = "../../modules/cloudfront"

  project_name               = var.project_name
  environment                = var.environment
  origin_domain_name         = module.alb.public_alb_dns_name
  aliases                    = local.domain_names
  certificate_arn            = module.acm.certificate_arn
  web_acl_arn                = module.waf.web_acl_arn
  origin_verify_header_value = var.origin_verify_header_value
}

## Point the domain names at CloudFront.
module "dns" {
  source = "../../modules/dns"

  hosted_zone_id            = var.route53_hosted_zone_id
  domain_names              = local.domain_names
  cloudfront_domain_name    = module.cloudfront.distribution_domain_name
  cloudfront_hosted_zone_id = module.cloudfront.distribution_hosted_zone_id
}
