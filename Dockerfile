# Multi-stage build for AI Predict Pro Dashboard
FROM node:22-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
# Copy source code
COPY . .

# Explicitly copy .env.production to ensure it's included
COPY .env.production .



# Build the application
RUN npm run build

# Production stage with nginx
FROM nginx:alpine

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets from builder stage
# Copy built assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy inject-keys.sh
COPY inject-keys.sh .
RUN chmod +x inject-keys.sh

# Expose port 8080 (Cloud Run default)
EXPOSE 8080

# Update nginx to listen on PORT environment variable (Cloud Run requirement)
# AND run the injection script
CMD ["/bin/sh", "-c", "./inject-keys.sh && sed -i \"s/listen 8080/listen ${PORT:-8080}/\" /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
