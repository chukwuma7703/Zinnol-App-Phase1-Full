#!/bin/bash

# Zinnol Backend Quick Start Script
# Gets you up and running in development mode quickly

echo "🚀 Zinnol Backend Quick Start"
echo "=============================="

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}Creating .env file from template...${NC}"
    cat > .env << EOF
# Development Environment
NODE_ENV=development
PORT=4000

# Database
MONGO_URI=mongodb://localhost:27017/zinnol-dev

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=dev-secret-key-change-in-production
JWT_EXPIRE=7d
JWT_REFRESH_EXPIRE=30d

# Email (Optional for dev)
EMAIL_FROM=dev@zinnol.local
SENDGRID_API_KEY=

# AI Services (Optional for dev)
AI_PROVIDER=gemini
GEMINI_API_KEY=
OPENAI_API_KEY=

# Frontend
FRONTEND_URL=http://localhost:3000

# Monitoring (Optional for dev)
SENTRY_DSN=
EOF
    echo -e "${GREEN}✅ .env file created${NC}"
fi

# Install dependencies
echo -e "${BLUE}Installing dependencies...${NC}"
npm install

# Check MongoDB
echo -e "${BLUE}Checking MongoDB...${NC}"
if mongosh --eval "db.version()" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ MongoDB is running${NC}"
else
    echo -e "${YELLOW}⚠️  MongoDB is not running. Please start MongoDB first.${NC}"
    echo "   On macOS: brew services start mongodb-community"
    echo "   On Linux: sudo systemctl start mongod"
    exit 1
fi

# Check Redis
echo -e "${BLUE}Checking Redis...${NC}"
if redis-cli ping > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Redis is running${NC}"
else
    echo -e "${YELLOW}⚠️  Redis is not running. Starting Redis...${NC}"
    if command -v redis-server &> /dev/null; then
        redis-server --daemonize yes
        echo -e "${GREEN}✅ Redis started${NC}"
    else
        echo -e "${YELLOW}Redis is not installed. Please install Redis first.${NC}"
        echo "   On macOS: brew install redis"
        echo "   On Linux: sudo apt-get install redis-server"
        exit 1
    fi
fi

# Create necessary directories
echo -e "${BLUE}Creating directories...${NC}"
mkdir -p logs uploads temp

# Start the server
echo -e "${GREEN}=============================="
echo -e "🎉 Starting Zinnol Backend!"
echo -e "==============================${NC}"
echo ""
echo -e "${BLUE}Server will start at: ${GREEN}http://localhost:4000${NC}"
echo -e "${BLUE}API Docs available at: ${GREEN}http://localhost:4000/api-docs${NC}"
echo -e "${BLUE}Health check at: ${GREEN}http://localhost:4000/health${NC}"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop the server${NC}"
echo ""

# Start with nodemon for development
npm run dev