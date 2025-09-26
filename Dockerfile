FROM node:18-alpine

WORKDIR /app

# Copy backend package files
COPY backend/package*.json backend/

# Install dependencies
WORKDIR /app/backend
RUN npm install

# Copy backend source
COPY backend/ .

# Expose port
EXPOSE 5001

# Start the app
CMD ["npm", "start"]
