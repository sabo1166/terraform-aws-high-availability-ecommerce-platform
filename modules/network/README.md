# Network Module

Creates the VPC, public subnets, private application subnets, private database
subnets, Internet Gateway, route tables, and optional NAT Gateway resources.

## Security notes

- Public subnets are intended for internet-facing load balancers.
- Application EC2 instances use private subnets.
- Database subnets have no direct Internet Gateway or NAT default route.
- A single NAT Gateway reduces cost but does not provide resilient egress
  if its Availability Zone becomes unavailable.

No AWS resources are created merely by writing these files.
