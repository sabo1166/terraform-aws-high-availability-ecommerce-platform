## The archive provider packages the Lambda source; no other module needs it.
terraform {
  required_providers {
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.7"
    }
  }
}
