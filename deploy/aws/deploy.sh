#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# DEX AI Trader — Full deploy script
# Run from your LOCAL machine after filling in the variables below.
# Prerequisites: aws-cli configured, ssh key available
# ─────────────────────────────────────────────────────────────────────────────
set -e

# ── CONFIGURE THESE ──────────────────────────────────────────────────────────
EC2_IP=""            # Your EC2 Elastic IP (from CloudFormation output)
KEY_PATH=""          # Path to your .pem key, e.g. ~/.ssh/dex-trader.pem
ENV_FILE=".env"      # Path to your local .env file
STACK_NAME="dex-ai-trader"
KEY_PAIR_NAME="dex-trader"
INSTANCE_TYPE="c5.large"   # c5.large for production speed
# ─────────────────────────────────────────────────────────────────────────────

if [ -z "$EC2_IP" ]; then
  echo "==> Deploying CloudFormation stack..."
  aws cloudformation deploy \
    --template-file deploy/aws/cloudformation.yml \
    --stack-name "$STACK_NAME" \
    --parameter-overrides \
      KeyPairName="$KEY_PAIR_NAME" \
      InstanceType="$INSTANCE_TYPE" \
    --capabilities CAPABILITY_IAM

  EC2_IP=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --query "Stacks[0].Outputs[?OutputKey=='PublicIP'].OutputValue" \
    --output text)
  echo "==> EC2 IP: $EC2_IP"
  echo "==> Waiting 60s for instance to boot..."
  sleep 60
fi

SSH="ssh -i $KEY_PATH -o StrictHostKeyChecking=no ubuntu@$EC2_IP"

echo "==> Copying .env to server"
scp -i "$KEY_PATH" -o StrictHostKeyChecking=no "$ENV_FILE" "ubuntu@$EC2_IP:/home/ubuntu/tradeonDEX/.env"

echo "==> Running bootstrap on server"
$SSH "bash /home/ubuntu/tradeonDEX/deploy/aws/setup.sh"

echo "==> Running DB setup"
$SSH "cd /home/ubuntu/tradeonDEX && bun run db:push && bun run seed"

echo "==> Building dashboard"
$SSH "cd /home/ubuntu/tradeonDEX && VITE_API_URL=http://$EC2_IP/api npm run build --prefix src/dashboard"

echo "==> Starting PM2 services"
$SSH "cd /home/ubuntu/tradeonDEX && pm2 start ecosystem.config.cjs && pm2 save"
$SSH "pm2 startup | tail -1 | bash"

echo "==> Configuring Nginx"
$SSH "sudo sed -i 's/YOUR_DOMAIN/$EC2_IP/g' /home/ubuntu/tradeonDEX/deploy/aws/nginx.conf"
$SSH "sudo cp /home/ubuntu/tradeonDEX/deploy/aws/nginx.conf /etc/nginx/sites-available/dex-trader"
$SSH "sudo ln -sf /etc/nginx/sites-available/dex-trader /etc/nginx/sites-enabled/dex-trader"
$SSH "sudo rm -f /etc/nginx/sites-enabled/default"
$SSH "sudo nginx -t && sudo systemctl reload nginx"

echo ""
echo "════════════════════════════════════════════════════════"
echo "  DEPLOYMENT COMPLETE"
echo "════════════════════════════════════════════════════════"
echo "  Dashboard:  http://$EC2_IP"
echo "  API:        http://$EC2_IP/api"
echo "  Health:     http://$EC2_IP/health"
echo "  SSH:        ssh -i $KEY_PATH ubuntu@$EC2_IP"
echo "  PM2 logs:   ssh in, then: pm2 logs"
echo "════════════════════════════════════════════════════════"
