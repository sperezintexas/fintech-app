#!/bin/bash
# Fix VPC issues for AWS Elastic Beanstalk deployment
# Run this if you get "No default VPC" errors

set -e

REGION="${AWS_REGION:-us-east-1}"

echo "=========================================="
echo "AWS VPC Fix Script"
echo "=========================================="
echo ""

# Check for existing VPCs
echo "Checking existing VPCs in $REGION..."
VPCS=$(aws ec2 describe-vpcs --region "$REGION" --query 'Vpcs[*].[VpcId,IsDefault,CidrBlock,Tags[?Key==`Name`].Value|[0]]' --output text)

if [ -z "$VPCS" ]; then
    echo "No VPCs found. Creating default VPC..."
    aws ec2 create-default-vpc --region "$REGION"
    echo "✓ Default VPC created!"
else
    echo "Existing VPCs:"
    echo "$VPCS"
    echo ""
    
    # Check for default VPC
    DEFAULT_VPC=$(aws ec2 describe-vpcs --region "$REGION" --filters "Name=isDefault,Values=true" --query 'Vpcs[0].VpcId' --output text)
    
    if [ "$DEFAULT_VPC" == "None" ] || [ -z "$DEFAULT_VPC" ]; then
        echo "No default VPC found. Creating one..."
        aws ec2 create-default-vpc --region "$REGION" 2>/dev/null || {
            echo ""
            echo "Could not create default VPC (may already exist in another state)."
            echo ""
            echo "Let's use an existing VPC instead."
            echo ""
            
            # Get first available VPC
            VPC_ID=$(aws ec2 describe-vpcs --region "$REGION" --query 'Vpcs[0].VpcId' --output text)
            
            if [ "$VPC_ID" != "None" ] && [ -n "$VPC_ID" ]; then
                echo "Found VPC: $VPC_ID"
                
                # Get a public subnet
                SUBNET_ID=$(aws ec2 describe-subnets --region "$REGION" \
                    --filters "Name=vpc-id,Values=$VPC_ID" "Name=map-public-ip-on-launch,Values=true" \
                    --query 'Subnets[0].SubnetId' --output text)
                
                if [ "$SUBNET_ID" == "None" ] || [ -z "$SUBNET_ID" ]; then
                    # Get any subnet
                    SUBNET_ID=$(aws ec2 describe-subnets --region "$REGION" \
                        --filters "Name=vpc-id,Values=$VPC_ID" \
                        --query 'Subnets[0].SubnetId' --output text)
                fi
                
                echo "Found Subnet: $SUBNET_ID"
                echo ""
                echo "=========================================="
                echo "UPDATE YOUR .ebextensions/04-vpc.config:"
                echo "=========================================="
                echo ""
                echo "option_settings:"
                echo "  aws:ec2:vpc:"
                echo "    VPCId: $VPC_ID"
                echo "    Subnets: $SUBNET_ID"
                echo "    AssociatePublicIpAddress: true"
                echo ""
                echo "Or run eb create with VPC options:"
                echo ""
                echo "eb create myinvestments-prod --single --instance-type t3.micro \\"
                echo "  --vpc.id $VPC_ID \\"
                echo "  --vpc.publicip \\"
                echo "  --vpc.ec2subnets $SUBNET_ID"
                echo ""
            fi
        }
        echo "✓ Default VPC created!"
    else
        echo "✓ Default VPC exists: $DEFAULT_VPC"
    fi
fi

echo ""
echo "=========================================="
echo "Next Steps"
echo "=========================================="
echo ""
echo "1. Terminate the failed environment:"
echo "   eb terminate myinvestments-prod --force"
echo ""
echo "2. Recreate:"
echo "   eb create myinvestments-prod --single --instance-type t3.micro"
echo ""
