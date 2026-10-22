# Delivering the application to private EC2 Auto Scaling Groups: Systems Manager vs CodeDeploy

Status: **design review only. Nothing here is implemented, planned, or tested on AWS.** Facts about the current Terraform come from reading `modules/` (compute, iam, security, alb, database, monitoring); facts about AWS services are from general knowledge and should be re-checked against current AWS documentation before building.

## Starting point (from the code)

Two Auto Scaling Groups (`modules/compute`) of private instances behind ALB target groups (ELB health checks, rolling `instance_refresh` on launch-template change). One shared instance profile with only `CloudWatchAgentServerPolicy` (`modules/iam`). Placeholder bootstrap. No artifact bucket, no SSM, no CodeDeploy, no access to the database secret. NAT gateway provides outbound internet.

## Options compared

| Criterion | AWS Systems Manager (Run Command / State Manager) | AWS CodeDeploy (EC2/on-premises platform) |
| --- | --- | --- |
| What it is | Generic remote execution and configuration. You write documents/scripts and decide how to roll them out. | Purpose-built application deployment with revisions, lifecycle hooks, and Auto Scaling Group integration. |
| Rolling deploy and health gating | DIY: use `max-concurrency`/`max-errors` and your own health checks; no native ALB deregistration/registration. | Native: deploy one/half at a time, deregister from the target group, run a validation hook, re-register; handles instances launched mid-deployment. |
| Rollback | DIY (re-run the previous document version); no automatic trigger. | Automatic rollback on failed deployment or CloudWatch alarm; redeploy a previous revision on demand. |
| Deployment health checks | Whatever the script does. | `ValidateService` hook plus load balancer health and optional alarms (the existing unhealthy-host alarms can be reused). |
| IAM separation | CI needs `ssm:SendCommand` on instances (effectively remote command execution); a compromised CI credential can run arbitrary commands on the fleet. Instance role needs `AmazonSSMManagedInstanceCore`. | CI needs `s3:PutObject` to a revision prefix and `codedeploy:CreateDeployment` on one application/deployment group; it cannot run arbitrary commands, only deploy a bundle that the instance's own scripts execute. A separate service role calls EC2/ASG/ELB. |
| Artifact storage | S3 (or inline) you design. | S3 revision bucket (or GitHub); versioned bucket doubles as rollback history. |
| Secret access | Script reads Secrets Manager with the instance role. | Same: a lifecycle script reads Secrets Manager with the instance role. |
| Extra instance software | SSM Agent (preinstalled on Amazon Linux 2023). | CodeDeploy agent must be installed by user data, with network access to its installer (NAT or VPC endpoint). |
| Operational complexity | Low to start, grows with orchestration code. Bonus: Session Manager replaces SSH for break-glass access. | Moderate up front (app, two deployment groups, service role, appspec and hook scripts), then low per deployment. |
| Fit with the existing Terraform | Needs new orchestration logic; the existing `instance_refresh` does not help. | Maps directly onto the two ASGs, target groups, and CloudWatch alarms that already exist. |

A third path, **immutable rollout through the existing launch template and `instance_refresh`**, needs the fewest new services (artifact version in user data, change it, `terraform apply`). It couples every application release to a Terraform apply, which conflicts with keeping application and infrastructure pipelines separate, so it is not recommended here.

## Recommendation: CodeDeploy

Use CodeDeploy for deployments, because the requirements (health-gated rolling updates behind load balancers, automatic rollback, least-privilege CI) are exactly what it provides and what SSM would make us rebuild. Keep Session Manager as an optional, separate decision for break-glass access (it adds `AmazonSSMManagedInstanceCore`); it is not needed for deployments.

Trade-offs accepted: the CodeDeploy agent must be installed and kept running (its installer comes from a public regional S3 bucket, so the instances need NAT or VPC endpoint access); deployment scripts live with the application.

## Exact Terraform changes required (not implemented)

1. **Artifact bucket** (new module, for example `modules/delivery`): private S3 bucket, versioning on (rollback history), public access blocked, TLS-only policy, SSE, lifecycle to expire old non-current versions. Prefixes `frontend/` and `backend/`.
2. **Split the shared EC2 role** in `modules/iam` into `frontend` and `backend` roles and instance profiles (outputs per tier), and change `modules/compute` to take one profile per tier. Both: `CloudWatchAgentServerPolicy`. Frontend: `s3:GetObject` on `artifacts/frontend/*` only. Backend: `s3:GetObject` on `artifacts/backend/*` only, plus `secretsmanager:GetSecretValue` on exactly the RDS-managed secret ARN (and the app secret below), plus `kms:Decrypt` if a customer-managed key is added. Both: read access to the CodeDeploy agent's regional bucket for the install script. The frontend must not read any database secret.
3. **CodeDeploy** (in the delivery module): `aws_codedeploy_app` (Server platform); a service role trusted by `codedeploy.amazonaws.com` with the AWS-managed `AWSCodeDeployRole`; two `aws_codedeploy_deployment_group` resources attached to `frontend_asg_name` and `backend_asg_name` (existing compute outputs), with `load_balancer_info.target_group_info` set to the existing target groups, `deployment_config_name` such as `CodeDeployDefault.HalfAtATime` (OneAtATime for the first rollouts), `auto_rollback_configuration` for `DEPLOYMENT_FAILURE` and `DEPLOYMENT_STOP_ON_ALARM`, and `alarm_configuration` using the existing unhealthy-host alarms from `modules/monitoring` (export their names).
4. **`modules/compute` user data:** install Nginx (frontend) or Node.js 22 (backend), the CodeDeploy agent, and the CloudWatch agent; keep logging to `/var/log/bootstrap.log`. No application code in user data. Review whether the ASG needs `lifecycle { ignore_changes }` for attributes CodeDeploy modifies (only for blue/green; in-place does not).
5. **Application secret** (JWT secret): an `aws_secretsmanager_secret` without a value in Terraform (value set out of band, or generated by a rotation-safe process), so no secret enters state; backend role reads it.
6. **ALB:** done: `environments/dev` now passes `frontend_health_check_path` and `backend_health_check_path` (default `/healthz`) to the ALB module.
7. **CI identity:** a dedicated IAM user for application deployment (its access keys held as secrets of a protected Environment, consistent with the access-key authentication now used by the workflows; a GitHub OIDC role would be the more secure alternative), allowed `s3:PutObject` to the two artifact prefixes and `codedeploy:CreateDeployment`, `GetDeployment`, `GetDeploymentConfig`, `GetApplicationRevision`, `RegisterApplicationRevision` on the two deployment groups only. This identity is separate from the plan and apply users described in `docs/runbooks/ci-cd.md`.
8. **Network:** if NAT is to stay optional, add an S3 gateway endpoint and interface endpoints for CodeDeploy (`codedeploy` and `codedeploy-commands`), Secrets Manager, and CloudWatch Logs; otherwise accept NAT dependency (single NAT is an availability risk).
9. **`environments/dev`:** wire the module, add outputs (`artifact_bucket_name`, `codedeploy_app_name`, deployment group names).

Also needed outside Terraform (application repository): an `appspec.yml` per app and lifecycle scripts (stop, install files, render config and read secrets, start, `ValidateService` calling `/healthz`), and a deploy job in `application.yml` that zips the build, uploads it, runs `aws deploy create-deployment`, and waits for success, inside a protected Environment. The migration and seed step still needs a controlled run from inside the VPC.

## Rollback

Automatic: CodeDeploy rolls back to the last successful revision on a failed hook or alarm. Manual: redeploy a previous revision (the artifact bucket is versioned). Database migrations are not rolled back by CodeDeploy, so migrations must stay backward compatible with the previous release.

## Not verified

No part of this was run. Agent installation on Amazon Linux 2023, hook behavior behind these specific target groups, and IAM policy sufficiency must be tested in a throwaway environment first.
