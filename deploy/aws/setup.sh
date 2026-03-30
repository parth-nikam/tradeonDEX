#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# DEX AI Trader — AWS EC2 Bootstrap Script
# Run this on a fresh Ubuntu 22.04 EC2 instance (t3.small or better)
# Usage: bash setup.sh
# ─────────────────────────────────────────────────────────────────────────────
set -e

echo "==> Updating system packages"
sudo apt-get update -y && sudo apt-get upgrade -y

echo "==> Installing Bun"
curl -fsSL https://bun.sh/install | bash
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"
echo 'export BUN_INSTALL="$HOME/.bun"' >> ~/.bashrc
echo 'export PATH="$BUN_INSTALL/bin:$PATH"' >> ~/.bashrc

echo "==> Installing Node.js (for PM2 + dashboard build)"
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

echo "==> Installing PM2"
sudo npm install -g pm2

echo "==> Installing Nginx"
sudo apt-get install -y nginx

echo "==> Cloning repo"
git clone https://github.com/parth-nikam/tradeonDEX.git /home/ubuntu/tradeonDEX
cd /home/ubuntu/tradeonDEX

echo "==> Installing backend dependencies"
bun install

echo "==> Installing dashboard dependencies"
npm install --prefix src/dashboard

echo "==> Done. Next steps:"
echo "  1. Copy your .env file:  scp .env ubuntu@<EC2_IP>:/home/ubuntu/tradeonDEX/.env"
echo "  2. Run DB setup:         bun run db:push && bun run seed"
echo "  3. Build dashboard:      npm run build --prefix src/dashboard"
echo "  4. Start services:       pm2 start ecosystem.config.cjs && pm2 save && pm2 startup"
echo "  5. Configure Nginx:      sudo cp deploy/aws/nginx.conf /etc/nginx/sites-available/dex-trader"
echo "                           sudo ln -s /etc/nginx/sites-available/dex-trader /etc/nginx/sites-enabled/"
echo "                           sudo nginx -t && sudo systemctl reload nginx"
