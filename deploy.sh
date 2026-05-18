#!/bin/bash
# 抖音数据看板 · 公司版 - 服务器部署脚本
# 在 Ubuntu 服务器上执行

set -e

echo "======================================"
echo "  抖音数据看板 · 公司版 - 部署脚本"
echo "======================================"

# 1. 更新系统
echo "[1/7] 更新系统包..."
sudo apt-get update -y
sudo apt-get upgrade -y

# 2. 安装 Node.js (v22 LTS)
echo "[2/7] 安装 Node.js..."
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v
npm -v

# 3. 安装 PM2
echo "[3/7] 安装 PM2..."
sudo npm install -g pm2
pm2 --version

# 4. 安装 Git
echo "[4/7] 安装 Git..."
sudo apt-get install -y git

# 5. 克隆代码（或从本地上传）
echo "[5/7] 准备代码目录..."
mkdir -p ~/douyin-dashboard-company
cd ~/douyin-dashboard-company

# 代码需要从本地复制过来，这里预留
# 实际部署时，用 rsync/scp 从本地传过来

# 6. 安装依赖并构建
echo "[6/7] 安装依赖并构建..."
cd nextjs-app
npm install
npm run build

# 7. PM2 启动
echo "[7/7] PM2 启动..."
pm2 start npm --name "douyin-dashboard-company" -- start
pm2 save
pm2 startup

echo "======================================"
echo "  部署完成！"
echo "  访问: http://$(curl -s ifconfig.me):3000"
echo "======================================"
