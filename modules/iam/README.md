# IAM Module

Creates least-privilege IAM roles for EC2 instances and Lambda functions.

## Resources

| Resource | Trusted principal | Managed policy |
| --- | --- | --- |
| EC2 role + instance profile | `ec2.amazonaws.com` | `CloudWatchAgentServerPolicy` |
| Lambda execution role | `lambda.amazonaws.com` | `service-role/AWSLambdaBasicExecutionRole` |

## Security decisions

- Trust policies name a single AWS service principal each; no wildcard or account principals.
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
| `ec2_role_arn` | ARN of the EC2 IAM role. |
| `lambda_role_arn` | ARN of the Lambda execution role. |
