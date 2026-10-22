# Proposal: HTTPS from CloudFront to the public ALB

Status: **proposal only, not implemented.** It depends on a confirmed domain and certificate strategy. Nothing here has been planned, applied, or tested on AWS.

## Current state (verified in code)

- `modules/cloudfront/main.tf:41`: `origin_protocol_policy = "http-only"`; the origin is the ALB's `*.elb.amazonaws.com` name.
- `modules/alb/main.tf`: only a port 80 listener. With origin verification enabled, requests without the secret header get a 403.
- `modules/security/main.tf:16-30`: the public ALB group allows `0.0.0.0/0` on ports 80 and 443 (443 has no listener).
- Viewer traffic is HTTPS (CloudFront, TLS 1.2 minimum). The CloudFront-to-ALB leg, including the secret header, is unencrypted HTTP over the internet.

## Proposed design

1. **Origin hostname.** Add a dedicated name in the existing Route 53 zone, for example `origin.<your-domain>`, as an alias record to the public ALB (new input to the `dns` module). Browsers never use it.
2. **Regional ACM certificate.** Request a DNS-validated certificate for the origin hostname in the **ALB's region** (not necessarily `us-east-1`). The existing `acm` module can be instantiated a second time with the default provider and the same hosted zone. The CloudFront viewer certificate (us-east-1) stays separate.
3. **ALB HTTPS listener.** Add a port 443 listener in the `alb` module using that certificate and a current TLS policy (for example `ELBSecurityPolicy-TLS13-1-2-2021-06`), forwarding to the frontend target group. Keep the origin-verification header rule on this listener.
4. **CloudFront origin.** Set the origin domain to the origin hostname, `origin_protocol_policy = "https-only"`, `origin_ssl_protocols = ["TLSv1.2"]`, keeping the custom header. The certificate must match the origin domain name, or the connection fails.
5. **Restrict network access.** Replace the `0.0.0.0/0` rules on the public ALB group with the AWS-managed CloudFront origin-facing prefix list (`com.amazonaws.global.cloudfront.origin-facing`) on port 443 only, and remove port 80. Keep the secret header as defense in depth, since the prefix list admits every CloudFront customer.
6. **Port 80.** Remove the HTTP listener, or keep it only as a redirect to HTTPS if direct browser access to the origin name is ever wanted (it is not needed for CloudFront).

## Decisions and prerequisites needed before implementing

- A real domain and an existing Route 53 hosted zone that is authoritative for it (none is assumed in this repository).
- The origin hostname you want (the example above is only an example).
- Acceptance of the security group quota impact: the CloudFront prefix list counts as roughly 55 rules toward the per-group rule limit (default 60). It may need a quota increase or a dedicated security group, which has to be verified in the target account.
- A secret rotation approach for `origin_verify_header_value` (it is stored in Terraform state; rotating means updating CloudFront and the ALB together).
- Alternative to evaluate: CloudFront VPC origins with an internal ALB would avoid a public ALB, but it needs a different network design and provider support that has not been checked here.

## Module changes this would require

`acm` (second instance), `alb` (HTTPS listener, certificate input), `security` (prefix-list rule and variable), `cloudfront` (origin domain and protocol inputs), `dns` (origin record), and `environments/dev` wiring and variables. Existing resources would be modified in place or replaced; this has not been assessed with a plan.

## Verification once implemented

Locally: `fmt` and `validate`. On AWS (needs approval): certificate issued, listener healthy, direct access to the ALB blocked, CloudFront returns content over HTTPS to the origin. None of this has been done.
