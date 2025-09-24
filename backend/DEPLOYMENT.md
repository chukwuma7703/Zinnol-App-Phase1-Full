# Zinnol Backend Deployment Guide

## 🚀 Production Deployment Checklist

### Prerequisites
- Node.js 22.x or higher
- MongoDB 6.0 or higher
- Redis 7.0 or higher (optional but recommended)
- SSL certificate for HTTPS
- Domain name configured

### 1. Environment Setup

#### Required Environment Variables
```bash
# Server
NODE_ENV=production
PORT=4000
API_VERSION=v1

# Database
MONGO_URI=mongodb://username:password@host:port/database
REDIS_URL=redis://username:password@host:port

# Security
JWT_SECRET=<strong-random-string>
JWT_EXPIRE=7d
BCRYPT_ROUNDS=12

# Frontend
FRONTEND_URL=https://your-domain.com
ALLOWED_ORIGINS=https://your-domain.com,https://www.your-domain.com

# Email
SENDGRID_API_KEY=<your-sendgrid-key>
EMAIL_FROM=noreply@your-domain.com

# Monitoring (optional but recommended)
SENTRY_DSN=<your-sentry-dsn>
NEW_RELIC_LICENSE_KEY=<your-new-relic-key>
```

### 2. Pre-Deployment Steps

```bash
# 1. Install dependencies
npm ci --production

# 2. Run tests
npm test

# 3. Run security audit
npm audit

# 4. Build any assets if needed
npm run build

# 5. Run database migrations
npm run migrate:up

# 6. Verify configuration
node scripts/verify-config.js
```

### 3. Deployment Options

#### Option A: PM2 (Recommended for VPS)

```bash
# Install PM2 globally
npm install -g pm2

# Start application
pm2 start ecosystem.config.js --env production

# Save PM2 configuration
pm2 save

# Setup PM2 to start on system boot
pm2 startup
```

**ecosystem.config.js:**
```javascript
module.exports = {
  apps: [{
    name: 'zinnol-backend',
    script: './server.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 4000
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_file: './logs/pm2-combined.log',
    time: true,
    max_memory_restart: '1G',
    autorestart: true,
    watch: false,
  }]
};
```

#### Option B: Docker

```dockerfile
FROM node:22-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm ci --production

# Copy application files
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Change ownership
RUN chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 4000

CMD ["node", "server.js"]
```

Build and run:
```bash
docker build -t zinnol-backend .
docker run -d \
  --name zinnol-backend \
  -p 4000:4000 \
  --env-file .env.production \
  --restart unless-stopped \
  zinnol-backend
```

#### Option C: Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: zinnol-backend
spec:
  replicas: 3
  selector:
    matchLabels:
      app: zinnol-backend
  template:
    metadata:
      labels:
        app: zinnol-backend
    spec:
      containers:
      - name: backend
        image: zinnol/backend:latest
        ports:
        - containerPort: 4000
        env:
        - name: NODE_ENV
          value: "production"
        envFrom:
        - secretRef:
            name: zinnol-secrets
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /healthz
            port: 4000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /readyz
            port: 4000
          initialDelaySeconds: 5
          periodSeconds: 5
```

### 4. Nginx Configuration

```nginx
upstream zinnol_backend {
    least_conn;
    server 127.0.0.1:4000 max_fails=3 fail_timeout=30s;
    # Add more servers for load balancing
    # server 127.0.0.1:4001 max_fails=3 fail_timeout=30s;
}

server {
    listen 80;
    server_name api.your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.your-domain.com;

    ssl_certificate /path/to/ssl/cert.pem;
    ssl_certificate_key /path/to/ssl/key.pem;
    
    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Logging
    access_log /var/log/nginx/zinnol-access.log;
    error_log /var/log/nginx/zinnol-error.log;

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

    # WebSocket support
    location /socket.io/ {
        proxy_pass http://zinnol_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Static files
    location /uploads {
        alias /path/to/uploads;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req zone=api burst=20 nodelay;
}
```

### 5. Database Setup

#### MongoDB
```javascript
// Create indexes
use zinnol_production;

// Users collection
db.users.createIndex({ email: 1 }, { unique: true });
db.users.createIndex({ role: 1 });
db.users.createIndex({ school: 1 });

// Students collection
db.students.createIndex({ admissionNumber: 1, school: 1 }, { unique: true });
db.students.createIndex({ school: 1, class: 1 });

// Results collection
db.results.createIndex({ student: 1, session: 1, term: 1 });
db.results.createIndex({ school: 1, class: 1 });

// Enable sharding for large collections
sh.enableSharding("zinnol_production");
sh.shardCollection("zinnol_production.results", { school: 1, _id: 1 });
```

#### Redis
```bash
# redis.conf
maxmemory 2gb
maxmemory-policy allkeys-lru
save 900 1
save 300 10
save 60 10000
```

### 6. Monitoring Setup

#### Health Checks
- `/healthz` - Basic health check
- `/readyz` - Readiness check (database connectivity)
- `/metrics` - Prometheus metrics

#### Logging
Configure centralized logging:
```bash
# Install Filebeat for log shipping
curl -L -O https://artifacts.elastic.co/downloads/beats/filebeat/filebeat-8.0.0-linux-x86_64.tar.gz
tar xzvf filebeat-8.0.0-linux-x86_64.tar.gz

# Configure filebeat.yml
filebeat.inputs:
- type: log
  enabled: true
  paths:
    - /app/logs/*.log
  json.keys_under_root: true
  json.add_error_key: true

output.elasticsearch:
  hosts: ["elasticsearch:9200"]
```

### 7. Security Hardening

```bash
# 1. Set up firewall
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable

# 2. Install fail2ban
apt-get install fail2ban

# 3. Configure fail2ban for API
cat > /etc/fail2ban/jail.local << EOF
[zinnol-api]
enabled = true
port = http,https
filter = zinnol-api
logpath = /var/log/nginx/zinnol-access.log
maxretry = 10
findtime = 60
bantime = 3600
EOF

# 4. Set up SSL auto-renewal
certbot renew --dry-run
crontab -e
# Add: 0 0 * * * certbot renew --quiet
```

### 8. Backup Strategy

```bash
# MongoDB backup script
#!/bin/bash
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/mongodb"
mkdir -p $BACKUP_DIR

mongodump \
  --uri="$MONGO_URI" \
  --out="$BACKUP_DIR/backup_$TIMESTAMP" \
  --gzip

# Keep only last 7 days
find $BACKUP_DIR -type d -mtime +7 -exec rm -rf {} +

# Upload to S3
aws s3 sync $BACKUP_DIR s3://zinnol-backups/mongodb/
```

### 9. Performance Optimization

#### Node.js Optimization
```bash
# Set Node.js production flags
export NODE_ENV=production
export NODE_OPTIONS="--max-old-space-size=4096"
export UV_THREADPOOL_SIZE=128
```

#### MongoDB Optimization
```javascript
// Connection pool settings
const mongoOptions = {
  maxPoolSize: 100,
  minPoolSize: 10,
  maxIdleTimeMS: 10000,
  serverSelectionTimeoutMS: 5000,
};
```

### 10. Post-Deployment Verification

```bash
# 1. Check service status
curl https://api.your-domain.com/healthz

# 2. Verify database connectivity
curl https://api.your-domain.com/readyz

# 3. Test API endpoints
curl -X POST https://api.your-domain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password"}'

# 4. Check logs
tail -f /var/log/nginx/zinnol-access.log
pm2 logs zinnol-backend

# 5. Monitor metrics
curl https://api.your-domain.com/metrics
```

### 11. Rollback Plan

```bash
# 1. Keep previous version tagged
git tag -a v1.0.0 -m "Production release v1.0.0"

# 2. Quick rollback script
#!/bin/bash
PREVIOUS_VERSION=$1
git checkout $PREVIOUS_VERSION
npm ci --production
pm2 reload zinnol-backend
```

### 12. Scaling Considerations

#### Horizontal Scaling
- Use PM2 cluster mode or multiple Docker containers
- Implement Redis for session storage
- Use MongoDB replica sets
- Configure load balancer (Nginx, HAProxy, or cloud LB)

#### Vertical Scaling
- Monitor CPU and memory usage
- Adjust Node.js memory limits
- Optimize database queries
- Implement caching strategies

### 13. Disaster Recovery

1. **Regular Backups**: Daily automated backups to S3
2. **Multi-region Setup**: Deploy to multiple regions
3. **Database Replication**: MongoDB replica sets
4. **Monitoring**: 24/7 monitoring with alerts
5. **Incident Response**: Documented procedures

### 14. Maintenance Mode

```javascript
// middleware/maintenance.js
export const maintenanceMode = (req, res, next) => {
  if (process.env.MAINTENANCE_MODE === 'true') {
    return res.status(503).json({
      success: false,
      message: 'Service temporarily unavailable for maintenance',
      retryAfter: 3600,
    });
  }
  next();
};
```

### 15. CI/CD Pipeline

```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '22'
      - run: npm ci
      - run: npm test
      - run: npm audit

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Deploy to server
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.HOST }}
          username: ${{ secrets.USERNAME }}
          key: ${{ secrets.SSH_KEY }}
          script: |
            cd /app/zinnol-backend
            git pull origin main
            npm ci --production
            npm run migrate:up
            pm2 reload zinnol-backend
```

## 📞 Support

For deployment support, contact:
- Email: devops@zinnol.com
- Slack: #backend-deployment
- Documentation: https://docs.zinnol.com/deployment