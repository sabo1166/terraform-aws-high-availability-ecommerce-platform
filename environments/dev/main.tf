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

  ## The same secret goes to CloudFront (sent as a header) and to the ALB (the listener rule matches it),
  ## so direct requests to the public ALB are not forwarded. A supplied value wins over the generated one.
  origin_verify_header_value = coalesce(var.origin_verify_header_value, one(random_password.origin_verify[*].result))
}

## Generated origin verification secret, used only when var.origin_verify_header_value is null. Letters
## and digits only, so it is a valid header value for both CloudFront and the ALB. It is stored in the
## (encrypted, private) Terraform state like the other sensitive values. To rotate it, replace this
## resource (terraform apply -replace='random_password.origin_verify[0]'); CloudFront and the ALB then
## update together in the same apply.
resource "random_password" "origin_verify" {
  count = var.origin_verify_header_value == null ? 1 : 0

  length  = 48
  special = false
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
  origin_verify_header_value     = local.origin_verify_header_value
  frontend_health_check_path     = var.frontend_health_check_path
  backend_health_check_path      = var.backend_health_check_path

  depends_on = [module.logging]
}

## Create the frontend and backend Auto Scaling Groups behind the ALB target groups.
module "compute" {
  source = "../../modules/compute"

  project_name                   = var.project_name
  environment                    = var.environment
  private_app_subnet_ids         = module.network.private_app_subnet_ids
  frontend_security_group_id     = module.security.frontend_security_group_id
  backend_security_group_id      = module.security.backend_security_group_id
  frontend_instance_profile_name = module.iam.frontend_instance_profile_name
  backend_instance_profile_name  = module.iam.backend_instance_profile_name
  frontend_target_group_arn      = module.alb.frontend_target_group_arn
  backend_target_group_arn       = module.alb.backend_target_group_arn
  frontend                       = var.frontend
  backend                        = var.backend
  wait_for_capacity_timeout      = var.asg_wait_for_capacity_timeout

  ## Non-secret settings for the deployment scripts. Secrets are referenced by ARN only and read at deploy time.
  frontend_app_config = {
    INTERNAL_ALB_DNS = module.alb.internal_alb_dns_name
  }
  backend_app_config = {
    DB_HOST            = module.database.db_address
    DB_PORT            = tostring(module.database.db_port)
    DB_NAME            = module.database.db_name
    DB_USER            = module.database.master_username
    DB_SECRET_ARN      = module.database.master_user_secret_arn
    JWT_SECRET_ARN     = module.delivery.jwt_secret_arn
    CORS_ORIGINS       = "https://${var.domain_name}"
    ARTIFACT_BUCKET    = module.delivery.artifact_bucket_name
    CODEDEPLOY_APP     = module.delivery.codedeploy_app_name
    AWS_DEFAULT_REGION = var.aws_region
  }
}

## Create the artifact bucket, CodeDeploy application and deployment groups, instance read access, the JWT secret
## container, and (when github_repository is set) the GitHub OIDC deploy role. No application is deployed.
module "delivery" {
  source = "../../modules/delivery"

  project_name               = var.project_name
  environment                = var.environment
  frontend_asg_name          = module.compute.frontend_asg_name
  backend_asg_name           = module.compute.backend_asg_name
  frontend_target_group_name = module.alb.frontend_target_group_name
  backend_target_group_name  = module.alb.backend_target_group_name
  frontend_role_name         = module.iam.frontend_role_name
  backend_role_name          = module.iam.backend_role_name
  db_master_user_secret_arn  = module.database.master_user_secret_arn
  unhealthy_host_alarm_names = module.monitoring.unhealthy_host_alarm_names
  deployment_config_name     = var.deployment_config_name
  enable_alarm_gating        = var.enable_deployment_alarm_gating
  github_repository          = var.github_repository
  github_environment         = var.github_environment
  github_oidc_provider_arn   = var.github_oidc_provider_arn
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
  origin_verify_header_value = local.origin_verify_header_value
}

## Point the domain names at CloudFront.
module "dns" {
  source = "../../modules/dns"

  hosted_zone_id            = var.route53_hosted_zone_id
  domain_names              = local.domain_names
  cloudfront_domain_name    = module.cloudfront.distribution_domain_name
  cloudfront_hosted_zone_id = module.cloudfront.distribution_hosted_zone_id
}
