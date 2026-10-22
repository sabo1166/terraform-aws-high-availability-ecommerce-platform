# Delivery Module

Terraform foundation for delivering the application to the frontend and backend Auto Scaling Groups with AWS CodeDeploy (Phase 1 of `docs/architecture/deployment-delivery-design.md`).

Status: statically validated only. Nothing in this module has been planned, applied, or tested on AWS, and **it deploys no application**: the release bundles, `appspec.yml` files, hook scripts, and pipeline jobs come in later phases.

## Resources

| Resource | Purpose |
| --- | --- |
| `aws_s3_bucket.artifacts` and companions | Private release bucket `<project>-<env>-artifacts-<account>-<region>`: ACLs disabled, all public access blocked, versioning on, SSE-S3, bucket policy that denies non-TLS requests and uploads asking for another encryption mode, lifecycle that expires noncurrent versions and failed uploads. Current releases are kept (see `release_expiration_days`). |
| `aws_secretsmanager_secret.jwt` | Container for the JWT signing secret, **without a value**, so it never enters Terraform state. Set it once outside Terraform. |
| `aws_iam_role_policy.frontend_read_releases` | Frontend role: `s3:GetObject`/`GetObjectVersion` on `releases/frontend/*` only. |
| `aws_iam_role_policy.backend_read_releases_and_secrets` | Backend role: the same on `releases/backend/*`, plus `secretsmanager:GetSecretValue` on exactly the database secret and the JWT secret. |
| `aws_codedeploy_app.this` | CodeDeploy application (Server platform). |
| `aws_iam_role.codedeploy` | Service role trusted only by `codedeploy.amazonaws.com`, with the AWS-managed `AWSCodeDeployRole`. |
| `aws_codedeploy_deployment_group.this["frontend"\|"backend"]` | In-place rolling deployment with traffic control against the existing Auto Scaling Groups and target groups; automatic rollback on failure (and on alarm when gating is enabled). |
| `aws_iam_openid_connect_provider.github`, `aws_iam_role.github_deploy` | Optional GitHub OIDC deploy identity, created only when `github_repository` is set. |

## Security decisions

- No long-lived AWS keys: GitHub assumes `github_deploy` through OIDC. Its trust policy pins the audience (`sts.amazonaws.com`) and the subject `repo:<github_repository>:environment:<github_environment>`; the repository is public, so an unpinned subject would let any repository's workflow assume it. The Environment must exist in GitHub and should restrict its deployment branches.
- The deploy role can write only under `releases/*`, create deployments only for this application's two groups, and read deployment, target and alarm state. It has no SSM, EC2 write, IAM, Secrets Manager or Terraform state access.
- The two instance roles are separate; the frontend cannot read the backend prefix or any secret.
- No secret is created or stored here. The JWT value and the database password are read by deployment scripts at deploy time.

## Inputs

| Name | Description | Default |
| --- | --- | --- |
| `project_name`, `environment` | Naming and tags | required |
| `frontend_asg_name`, `backend_asg_name` | Auto Scaling Groups to deploy to | required |
| `frontend_target_group_name`, `backend_target_group_name` | Target group names | required |
| `frontend_role_name`, `backend_role_name` | Instance role names | required |
| `db_master_user_secret_arn` | RDS-managed secret the backend may read | required |
| `unhealthy_host_alarm_names` | Object `{frontend, backend}` of alarm names | required |
| `deployment_config_name` | `CodeDeployDefault.OneAtATime` or `HalfAtATime` | `OneAtATime` |
| `enable_alarm_gating` | Let the alarms stop and roll back deployments | `false` |
| `release_expiration_days` | Expire current releases after N days (at least 30); `null` keeps them | `null` |
| `noncurrent_version_retention_days` | Keep superseded versions | `30` |
| `jwt_secret_recovery_window_in_days` | `0` or 7-30 | `7` |
| `github_repository` | `owner/name` allowed to assume the deploy role; `null` creates no deploy identity | `null` |
| `github_environment` | GitHub Environment pinned in the trust policy | `app-deploy` |
| `github_oidc_provider_arn` | Existing provider to reuse; `null` creates one | `null` |

## Outputs

`artifact_bucket_name`, `artifact_bucket_arn`, `codedeploy_app_name`, `deployment_group_names`, `codedeploy_service_role_arn`, `jwt_secret_arn`, `github_deploy_role_arn`.

## Things to know before applying

- **Alarm gating is off on purpose.** The unhealthy-host alarms are in ALARM while no application runs, and CodeDeploy would refuse or stop deployments because of them. Turn `enable_alarm_gating` on after the first successful deployment.
- **An account can have only one GitHub OIDC provider.** If one already exists, the apply fails with an "already exists" error; pass its ARN in `github_oidc_provider_arn`.
- **Current releases never expire by default**, because an instance launched by Auto Scaling deploys the last successful revision; expiring it would break scale-out and replacement.
- **First-deployment gap (not solved here).** Until a first revision is deployed the instances still fail their health checks and are replaced, exactly as before. This module does not change `health_check_type` (see section 9 of the design document and decision 4).
- The deployment group names and bucket name use the account ID and region data sources; nothing is hardcoded.
