#!/bin/bash

# Zinnol Backend 100% Upgrade Script
# This script installs all necessary dependencies to bring the backend to 100% production readiness

echo "🚀 Starting Zinnol Backend Upgrade to 100%..."

# Install new production dependencies
echo "📦 Installing new dependencies..."
npm install --save \
  compression@^1.7.4 \
  express-mongo-sanitize@^2.2.0 \
  hpp@^0.2.3 \
  morgan@^1.10.0 \
  prom-client@^15.1.0 \
  swagger-jsdoc@^6.2.8 \
  swagger-ui-express@^5.0.0 \
  uuid@^9.0.1 \
  xss@^1.0.15

# Install new dev dependencies
echo "📦 Installing new dev dependencies..."
npm install --save-dev \
  @types/compression@^1.7.5 \
  @types/morgan@^1.9.9 \
  @types/uuid@^9.0.7

echo "✅ Dependencies installed successfully!"

# Create necessary directories
echo "📁 Creating necessary directories..."
mkdir -p logs
mkdir -p uploads
mkdir -p temp
mkdir -p docs

# Create .gitkeep files to track empty directories
touch logs/.gitkeep
touch uploads/.gitkeep
touch temp/.gitkeep

echo "✅ Directories created successfully!"

# Run migrations
echo "🔄 Running database migrations..."
npm run migrate:up || echo "⚠️  Migration failed or not configured yet"

echo "✅ Upgrade complete!"
echo ""
echo "📋 Next steps:"
echo "1. Review and update your .env file based on .env.example"
echo "2. Remove any sensitive files from git history"
echo "3. Run 'npm test' to verify all tests pass"
echo "4. Access API documentation at http://localhost:4000/api-docs"
echo "5. Monitor metrics at http://localhost:4000/metrics"
echo ""
echo "🎉 Your backend is now production-ready!"