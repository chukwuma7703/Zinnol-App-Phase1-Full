#!/bin/bash

# Zinnol Backend Production Deployment Script
# Deploys with monitoring, error tracking, and health checks

echo "🚀 Zinnol Backend Production Deployment"
echo "========================================"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
APP_NAME="zinnol-backend"
PORT=${PORT:-4000}
NODE_ENV="production"

# Function to check dependencies
check_dependencies() {
    echo -e "${BLUE}Checking dependencies...${NC}"
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        echo -e "${RED}Node.js is not installed${NC}"
        exit 1
    fi
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        echo -e "${RED}npm is not installed${NC}"
        exit 1
    fi
    
    # Check PM2
    if ! command -v pm2 &> /dev/null; then
        echo -e "${YELLOW}PM2 not found. Installing...${NC}"
        npm install -g pm2
    fi
    
    echo -e "${GREEN}✅ All dependencies satisfied${NC}"
}

# Function to setup environment
setup_environment() {
    echo -e "${BLUE}Setting up production environment...${NC}"
    
    # Create .env.production if it doesn't exist
    if [ ! -f .env.production ]; then
        echo -e "${YELLOW}Creating .env.production file...${NC}"
        cat > .env.production << EOF
# Production Environment Configuration
NODE_ENV=production
PORT=4000

# Database
MONGO_URI=mongodb://localhost:27017/zinnol-production

# Redis Cache
REDIS_URL=redis://localhost:6379

# JWT Secrets
JWT_SECRET=$(openssl rand -base64 32)
JWT_EXPIRE=7d
JWT_REFRESH_EXPIRE=30d

# Email Configuration
EMAIL_FROM=noreply@zinnol.com
SENDGRID_API_KEY=your-sendgrid-api-key

# Sentry Error Tracking
SENTRY_DSN=your-sentry-dsn

# AI Services
AI_PROVIDER=gemini
GEMINI_API_KEY=your-gemini-api-key
OPENAI_API_KEY=your-openai-api-key

# Firebase
FIREBASE_PROJECT_ID=your-firebase-project
FIREBASE_PRIVATE_KEY=your-firebase-key
FIREBASE_CLIENT_EMAIL=your-firebase-email

# Frontend URL
FRONTEND_URL=https://zinnol.com

# Rate Limiting
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX=100

# Monitoring
ENABLE_MONITORING=true
ENABLE_HEALTH_CHECKS=true
LOG_LEVEL=info
EOF
        echo -e "${YELLOW}Please update .env.production with your actual values${NC}"
        exit 1
    fi
    
    # Load environment variables
    export $(cat .env.production | grep -v '^#' | xargs)
    
    echo -e "${GREEN}✅ Environment configured${NC}"
}

# Function to install dependencies
install_dependencies() {
    echo -e "${BLUE}Installing production dependencies...${NC}"
    npm ci --only=production
    echo -e "${GREEN}✅ Dependencies installed${NC}"
}

# Function to run database migrations
run_migrations() {
    echo -e "${BLUE}Running database migrations...${NC}"
    # Add your migration commands here
    # node scripts/migrate.js
    echo -e "${GREEN}✅ Migrations complete${NC}"
}

# Function to build assets
build_assets() {
    echo -e "${BLUE}Building assets...${NC}"
    # Add build commands if needed
    echo -e "${GREEN}✅ Assets built${NC}"
}

# Function to setup PM2
setup_pm2() {
    echo -e "${BLUE}Configuring PM2...${NC}"
    
    # Create PM2 ecosystem file
    cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'zinnol-backend',
    script: './server.js',
    instances: 'max',
    exec_mode: 'cluster',
    autorestart: true,
    watch: false,
    max_memory_restart: '2G',
    env: {
      NODE_ENV: 'production',
      PORT: 4000
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_file: './logs/pm2-combined.log',
    time: true,
    merge_logs: true,
    
    // Graceful shutdown
    kill_timeout: 5000,
    listen_timeout: 3000,
    
    // Health checks
    min_uptime: '10s',
    max_restarts: 10,
    
    // Monitoring
    instance_var: 'INSTANCE_ID',
    
    // Auto-restart cron
    cron_restart: '0 3 * * *', // Restart daily at 3 AM
  }]
};
EOF
    
    echo -e "${GREEN}✅ PM2 configured${NC}"
}

# Function to setup Nginx
setup_nginx() {
    echo -e "${BLUE}Setting up Nginx configuration...${NC}"
    
    cat > nginx.conf << 'EOF'
upstream zinnol_backend {
    least_conn;
    server 127.0.0.1:4000 max_fails=3 fail_timeout=30s;
    server 127.0.0.1:4001 max_fails=3 fail_timeout=30s;
    server 127.0.0.1:4002 max_fails=3 fail_timeout=30s;
    server 127.0.0.1:4003 max_fails=3 fail_timeout=30s;
    keepalive 32;
}

server {
    listen 80;
    server_name api.zinnol.com;
    
    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.zinnol.com;
    
    # SSL Configuration
    ssl_certificate /etc/ssl/certs/zinnol.crt;
    ssl_certificate_key /etc/ssl/private/zinnol.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    
    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    
    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req zone=api burst=20 nodelay;
    
    # Gzip compression
    gzip on;
    gzip_types text/plain application/json application/javascript text/css;
    gzip_min_length 1000;
    
    # Proxy settings
    location / {
        proxy_pass http://zinnol_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        
        # Buffering
        proxy_buffering off;
        proxy_request_buffering off;
    }
    
    # Health check endpoint
    location /health {
        access_log off;
        proxy_pass http://zinnol_backend/health;
    }
    
    # Static files
    location /uploads {
        alias /var/www/zinnol/uploads;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
EOF
    
    echo -e "${GREEN}✅ Nginx configuration created${NC}"
    echo -e "${YELLOW}Copy nginx.conf to /etc/nginx/sites-available/zinnol-api${NC}"
}

# Function to start application
start_application() {
    echo -e "${BLUE}Starting application with PM2...${NC}"
    
    # Stop existing instance if running
    pm2 stop $APP_NAME 2>/dev/null || true
    pm2 delete $APP_NAME 2>/dev/null || true
    
    # Start with ecosystem file
    pm2 start ecosystem.config.js
    
    # Save PM2 configuration
    pm2 save
    
    # Setup PM2 startup script
    pm2 startup
    
    echo -e "${GREEN}✅ Application started${NC}"
}

# Function to setup monitoring
setup_monitoring() {
    echo -e "${BLUE}Setting up monitoring...${NC}"
    
    # Install PM2 monitoring modules
    pm2 install pm2-logrotate
    pm2 set pm2-logrotate:max_size 10M
    pm2 set pm2-logrotate:retain 7
    pm2 set pm2-logrotate:compress true
    
    # Setup health check cron
    (crontab -l 2>/dev/null; echo "*/5 * * * * curl -f http://localhost:4000/health || pm2 restart zinnol-backend") | crontab -
    
    echo -e "${GREEN}✅ Monitoring configured${NC}"
}

# Function to verify deployment
verify_deployment() {
    echo -e "${BLUE}Verifying deployment...${NC}"
    
    sleep 5
    
    # Check if application is running
    if pm2 list | grep -q $APP_NAME; then
        echo -e "${GREEN}✅ Application is running${NC}"
    else
        echo -e "${RED}❌ Application is not running${NC}"
        pm2 logs $APP_NAME --lines 50
        exit 1
    fi
    
    # Check health endpoint
    if curl -f http://localhost:$PORT/health > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Health check passed${NC}"
    else
        echo -e "${RED}❌ Health check failed${NC}"
        exit 1
    fi
    
    # Display status
    pm2 status
}

# Function to display post-deployment instructions
post_deployment() {
    echo -e "\n${GREEN}========================================${NC}"
    echo -e "${GREEN}🎉 Deployment Complete!${NC}"
    echo -e "${GREEN}========================================${NC}\n"
    
    echo -e "${BLUE}Application Status:${NC}"
    pm2 status
    
    echo -e "\n${BLUE}Useful Commands:${NC}"
    echo "  pm2 status          - Check application status"
    echo "  pm2 logs            - View application logs"
    echo "  pm2 monit           - Real-time monitoring"
    echo "  pm2 restart all     - Restart application"
    echo "  pm2 reload all      - Zero-downtime reload"
    
    echo -e "\n${BLUE}Monitoring URLs:${NC}"
    echo "  Health Check: http://localhost:$PORT/health"
    echo "  Metrics:      http://localhost:$PORT/metrics"
    
    echo -e "\n${YELLOW}⚠️  Important:${NC}"
    echo "  1. Update .env.production with actual values"
    echo "  2. Configure SSL certificates"
    echo "  3. Setup firewall rules"
    echo "  4. Configure backup strategy"
    echo "  5. Setup monitoring alerts"
}

# Main deployment flow
main() {
    echo -e "${BLUE}Starting deployment at $(date)${NC}\n"
    
    check_dependencies
    setup_environment
    install_dependencies
    run_migrations
    build_assets
    setup_pm2
    setup_nginx
    setup_monitoring
    start_application
    verify_deployment
    post_deployment
    
    echo -e "\n${BLUE}Deployment completed at $(date)${NC}"
}

# Run main function
main