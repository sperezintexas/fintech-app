#!/bin/bash
# Get VPC info and generate eb create command
# Run this to get the exact command for your AWS account

REGION="${AWS_REGION:-us-east-1}"
VPC_ID="${1:-}"

echo "=========================================="
echo "AWS VPC Info for Elastic Beanstalk"
echo "=========================================="
echo ""

# If VPC ID provided, use it; otherwise find one
if [ -z "$VPC_ID" ]; then
    # Try to get default VPC first
    VPC_ID=$(aws ec2 describe-vpcs --region "$REGION" \
        --filters "Name=isDefault,Values=true" \
        --query 'Vpcs[0].VpcId' --output text 2>/dev/null)
    
    if [ "$VPC_ID" == "None" ] || [ -z "$VPC_ID" ]; then
        # Get any VPC
        VPC_ID=$(aws ec2 describe-vpcs --region "$REGION" \
            --query 'Vpcs[0].VpcId' --output text 2>/dev/null)
    fi
fi

if [ "$VPC_ID" == "None" ] || [ -z "$VPC_ID" ]; then
    echo "❌ No VPC found. Create one first:"
    echo "   aws ec2 create-default-vpc --region $REGION"
    exit 1
fi

echo "VPC ID: $VPC_ID"
echo ""

# Get subnets for this VPC
echo "Subnets in this VPC:"
aws ec2 describe-subnets --region "$REGION" \
    --filters "Name=vpc-id,Values=$VPC_ID" \
    --query 'Subnets[*].[SubnetId,AvailabilityZone,CidrBlock,MapPublicIpOnLaunch]' \
    --output table

# Get first public subnet (or any subnet)
SUBNET_ID=$(aws ec2 describe-subnets --region "$REGION" \
    --filters "Name=vpc-id,Values=$VPC_ID" "Name=map-public-ip-on-launch,Values=true" \
    --query 'Subnets[0].SubnetId' --output text 2>/dev/null)

if [ "$SUBNET_ID" == "None" ] || [ -z "$SUBNET_ID" ]; then
    SUBNET_ID=$(aws ec2 describe-subnets --region "$REGION" \
        --filters "Name=vpc-id,Values=$VPC_ID" \
        --query 'Subnets[0].SubnetId' --output text 2>/dev/null)
fi

if [ "$SUBNET_ID" == "None" ] || [ -z "$SUBNET_ID" ]; then
    echo ""
    echo "❌ No subnets found in VPC. This VPC needs subnets."
    exit 1
fi

echo ""
echo "=========================================="
echo "COPY AND RUN THIS COMMAND:"
echo "=========================================="
echo ""
echo "# First terminate any failed environment:"
echo "eb terminate myinvestments-prod --force"
echo ""
echo "# Then create with explicit VPC settings:"
echo "eb create myinvestments-prod --single --instance-type t3.micro \\"
echo "  --vpc.id $VPC_ID \\"
echo "  --vpc.publicip \\"
echo "  --vpc.ec2subnets $SUBNET_ID"
echo ""
echo "=========================================="
