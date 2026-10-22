## Declared explicitly because the root module passes an aliased (us-east-1) provider to this module.
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.100"
    }
  }
}
