# IAM Module

Creates least-privilege IAM roles for EC2 instances and Lambda functions.

## Resources

| Resource | Trusted principal | Managed policy |
| --- | --- | --- |
| EC2 role + instance profile (shared; no longer used by the Auto Scaling Groups, kept so nothing is deleted) | `ec2.amazonaws.com` | `CloudWatchAgentServerPolicy` |
| Frontend and backend EC2 roles + instance profiles (`aws_iam_role.tier["frontend"]`, `["backend"]`) | `ec2.amazonaws.com` | `CloudWatchAgentServerPolicy` |
| Lambda execution role | `lambda.amazonaws.com` | `service-role/AWSLambdaBasicExecutionRole` |

## Security decisions

- Trust policies name a single AWS service principal each; no wildcard or account principals.
- Application delivery permissions (S3 release read, Secrets Manager read) are not defined here: `modules/delivery` attaches them to the per-tier roles so each tier can read only its own release prefix, and only the backend can read the two secrets.
- `AmazonSSMManagedInstanceCore` is not attached because the project does not use Systems Manager. Add it only if SSM is adopted.
- No `AdministratorAccess` and no EC2, Auto Scaling, or IAM permissions. Automation permissions must be added later as narrowly scoped policies.

## Inputs

| Name | Description | Type |
| --- | --- | --- |
| `project_name` | Project identifier. | `string` |
| `environment` | Deployment environment. | `string` |

## Outputs

| Name | Description |
| --- | --- |
| `ec2_instance_profile_name` | Name of the EC2 instance profile. |
| `ec2_role_arn` | ARN of the shared EC2 IAM role (unused by the Auto Scaling Groups). |
| `frontend_instance_profile_name`, `backend_instance_profile_name` | Per-tier instance profiles. |
| `frontend_role_name`, `backend_role_name` | Per-tier role names. |
| `lambda_role_arn` | ARN of the Lambda execution role. |
