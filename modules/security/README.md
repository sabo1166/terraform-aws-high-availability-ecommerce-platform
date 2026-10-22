# Security Module

Creates security groups for the public ALB, frontend EC2 instances,
internal ALB, backend EC2 instances, and RDS MySQL.

## Traffic flow

- Internet -> Public ALB: TCP 80 and 443
- Public ALB -> Frontend: TCP 80
- Frontend -> Internal ALB: TCP 80
- Internal ALB -> Backend: TCP 3000
- Backend -> RDS MySQL: TCP 3306

Application and database ingress rules reference security groups rather
than opening their ports to public CIDR ranges.

## Follow-up hardening

- Restrict direct access to the public ALB origin to CloudFront.
- Configure HTTPS listeners and certificates.
- Review egress rules and use VPC endpoints where appropriate.
