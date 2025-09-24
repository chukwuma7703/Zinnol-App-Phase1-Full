#!/bin/bash

# =============================================================================
# ZINNOL BACKEND - QUICK PRODUCTION DEPLOYMENT SCRIPT
# =============================================================================
# This script helps deploy Zinnol backend to production quickly and safely
# Run with: ./deploy-quick.sh [environment]

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT=${1:-production}
APP_NAME="zinnol-backend"
PM2_INSTANCES=${PM2_INSTANCES:-4}
NODE_VERSION="22"

print_header() {
    echo -e "${BLUE}================================${NC}"
    echo -e "${BLUE}  Zinnol Backend Deployment${NC}"
    echo -e "${BLUE}  Environment: $ENVIRONMENT${NC}"
    echo -e "${BLUE}================================${NC}"
}

print_status() {
    echo -e "${YELLOW}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_prerequisites() {
    print_status "Checking prerequisites..."
    
    # Check Node.js version
    if ! command -v node &> /dev/null; then
        print_error "Node.js not found. Please install Node.js $NODE_VERSION"
        exit 1
    fi
    
    NODE_CURRENT=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_CURRENT" -lt "20" ]; then
        print_error "Node.js version $NODE_CURRENT found. Please upgrade to Node.js $NODE_VERSION or higher"
        exit 1
    fi
    
    # Check PM2
    if ! command -v pm2 &> /dev/null; then
        print_status "Installing PM2..."
        npm install -g pm2
    fi
    
    # Check MongoDB connection
    if ! command -v mongosh &> /dev/null && ! command -v mongo &> /dev/null; then
        print_error "MongoDB client not found. Please install MongoDB tools"
        exit 1
    fi
    
    # Check Redis connection
    if ! command -v redis-cli &> /dev/null; then
        print_error "Redis CLI not found. Please install Redis tools"
        exit 1
    fi
    
    print_success "Prerequisites check passed"
}

setup_environment() {
    print_status "Setting up environment configuration..."
    
    if [ ! -f ".env.$ENVIRONMENT" ]; then
        if [ -f ".env.${ENVIRONMENT}.template" ]; then
            print_status "Creating .env.$ENVIRONMENT from template..."
            cp ".env.${ENVIRONMENT}.template" ".env.$ENVIRONMENT"
            print_error "Please edit .env.$ENVIRONMENT with your production values before continuing"
            exit 1
        else
            print_error ".env.$ENVIRONMENT not found. Please create it with your configuration"
            exit 1
        fi
    fi
    
    # Backup current environment file
    cp ".env.$ENVIRONMENT" ".env.$ENVIRONMENT.backup.$(date +%Y%m%d_%H%M%S)"
    
    # Set NODE_ENV
    export NODE_ENV=$ENVIRONMENT
    
    print_success "Environment configuration ready"
}

install_dependencies() {
    print_status "Installing dependencies..."
    
    # Clean install for production
    if [ "$ENVIRONMENT" = "production" ]; then
        npm ci --only=production --no-audit --no-fund
    else
        npm ci --no-audit --no-fund
    fi
    
    print_success "Dependencies installed"
}

run_tests() {
    print_status "Running tests..."
    
    # Run smoke tests for quick validation
    if npm run test:smoke; then
        print_success "Smoke tests passed"
    else
        print_error "Smoke tests failed. Deployment aborted."
        exit 1
    fi
    
    # Run additional tests if not in production
    if [ "$ENVIRONMENT" != "production" ]; then
        if npm run test:unit; then
            print_success "Unit tests passed"
        else
            print_error "Unit tests failed. Deployment aborted."
            exit 1
        fi
    fi
}

check_database() {
    print_status "Checking database connection..."
    
    # Source environment variables
    set -a
    source ".env.$ENVIRONMENT"
    set +a
    
    # Test MongoDB connection
    if [ -n "$MONGO_URI" ]; then
        if timeout 10s node -e "
            import mongoose from 'mongoose';
            mongoose.connect('$MONGO_URI')
                .then(() => { console.log('MongoDB connected'); process.exit(0); })
                .catch(err => { console.error('MongoDB error:', err.message); process.exit(1); });
        "; then
            print_success "MongoDB connection successful"
        else
            print_error "MongoDB connection failed"
            exit 1
        fi
    fi
    
    # Test Redis connection
    if [ -n "$REDIS_URL" ]; then
        if redis-cli -u "$REDIS_URL" ping > /dev/null 2>&1; then
            print_success "Redis connection successful"
        else
            print_error "Redis connection failed"
            exit 1
        fi
    fi
}

run_migrations() {
    print_status "Running database migrations..."
    
    # Run migrations if they exist
    if [ -f "migrations/migrate.js" ]; then
        node migrations/migrate.js
        print_success "Database migrations completed"
    else
        print_status "No migrations found, skipping..."
    fi
}

build_application() {
    print_status "Building application..."
    
    # Run any build steps if needed
    if [ -f "build.js" ]; then
        node build.js
    fi
    
    # Create necessary directories
    mkdir -p logs uploads temp
    
    print_success "Application build completed"
}

deploy_with_pm2() {
    print_status "Deploying with PM2..."
    
    # Create PM2 ecosystem file
    cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: '$APP_NAME',
    script: 'server.js',
    instances: $PM2_INSTANCES,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: '$ENVIRONMENT',
      PORT: 4000
    },
    env_file: '.env.$ENVIRONMENT',
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_file: './logs/pm2-combined.log',
    time: true,
    max_memory_restart: '1G',
    node_args: '--max-old-space-size=1024',
    watch: false,
    ignore_watch: ['node_modules', 'logs', 'uploads', 'temp'],
    max_restarts: 10,
    min_uptime: '10s',
    kill_timeout: 5000,
    wait_ready: true,
    listen_timeout: 10000
  }]
};
EOF

    # Stop existing application
    pm2 stop $APP_NAME 2>/dev/null || true
    pm2 delete $APP_NAME 2>/dev/null || true
    
    # Start application
    pm2 start ecosystem.config.js
    
    # Save PM2 configuration
    pm2 save
    
    # Setup PM2 startup script
    pm2 startup
    
    print_success "Application deployed with PM2"
}

verify_deployment() {
    print_status "Verifying deployment..."
    
    # Wait for application to start
    sleep 10
    
    # Check PM2 status
    if pm2 list | grep -q "$APP_NAME.*online"; then
        print_success "PM2 status: Application is running"
    else
        print_error "PM2 status: Application is not running"
        pm2 logs $APP_NAME --lines 20
        exit 1
    fi
    
    # Check health endpoint
    if curl -f http://localhost:4000/healthz > /dev/null 2>&1; then
        print_success "Health check: Application is responding"
    else
        print_error "Health check: Application is not responding"
        exit 1
    fi
    
    # Check API endpoint
    if curl -f http://localhost:4000/api > /dev/null 2>&1; then
        print_success "API check: API is responding"
    else
        print_error "API check: API is not responding"
        exit 1
    fi
}

setup_monitoring() {
    print_status "Setting up monitoring..."
    
    # Install PM2 monitoring if not already installed
    if ! pm2 list | grep -q "pm2-logrotate"; then
        pm2 install pm2-logrotate
    fi
    
    # Setup log rotation
    pm2 set pm2-logrotate:max_size 10M
    pm2 set pm2-logrotate:retain 30
    pm2 set pm2-logrotate:compress true
    
    print_success "Monitoring setup completed"
}

create_backup() {
    print_status "Creating deployment backup..."
    
    BACKUP_DIR="backups/$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$BACKUP_DIR"
    
    # Backup current deployment
    cp -r . "$BACKUP_DIR/" 2>/dev/null || true
    
    # Create rollback script
    cat > "$BACKUP_DIR/rollback.sh" << EOF
#!/bin/bash
echo "Rolling back to backup from $(date +%Y%m%d_%H%M%S)..."
pm2 stop $APP_NAME
cp -r $BACKUP_DIR/* ./
pm2 start ecosystem.config.js
echo "Rollback completed"
EOF
    
    chmod +x "$BACKUP_DIR/rollback.sh"
    
    print_success "Backup created at $BACKUP_DIR"
}

print_deployment_info() {
    echo ""
    echo -e "${GREEN}================================${NC}"
    echo -e "${GREEN}  DEPLOYMENT COMPLETED!${NC}"
    echo -e "${GREEN}================================${NC}"
    echo ""
    echo -e "${BLUE}Application:${NC} $APP_NAME"
    echo -e "${BLUE}Environment:${NC} $ENVIRONMENT"
    echo -e "${BLUE}Instances:${NC} $PM2_INSTANCES"
    echo -e "${BLUE}Health Check:${NC} http://localhost:4000/healthz"
    echo -e "${BLUE}API Endpoint:${NC} http://localhost:4000/api"
    echo -e "${BLUE}Documentation:${NC} http://localhost:4000/api-docs"
    echo ""
    echo -e "${YELLOW}Useful Commands:${NC}"
    echo "  pm2 status                 - Check application status"
    echo "  pm2 logs $APP_NAME         - View application logs"
    echo "  pm2 restart $APP_NAME      - Restart application"
    echo "  pm2 reload $APP_NAME       - Zero-downtime reload"
    echo "  pm2 stop $APP_NAME         - Stop application"
    echo ""
    echo -e "${YELLOW}Monitoring:${NC}"
    echo "  pm2 monit                  - Real-time monitoring"
    echo "  tail -f logs/application.log - Application logs"
    echo "  tail -f logs/error.log     - Error logs"
    echo ""
}

# Main deployment flow
main() {
    print_header
    
    # Pre-deployment checks
    check_prerequisites
    setup_environment
    
    # Build and test
    install_dependencies
    run_tests
    check_database
    
    # Deployment
    create_backup
    run_migrations
    build_application
    deploy_with_pm2
    
    # Post-deployment
    verify_deployment
    setup_monitoring
    
    print_deployment_info
    
    print_success "Deployment completed successfully! 🚀"
}

# Error handling
trap 'print_error "Deployment failed at line $LINENO. Check the logs above."' ERR

# Run main function
main "$@"