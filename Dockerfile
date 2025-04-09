# Stage 1: Build the application
FROM node:18-alpine AS builder

WORKDIR /app

# Install node-fetch v3 which requires CommonJS adjustments
RUN npm install -g node-fetch@^3.0.0

# Copy package files and install dependencies
# Use npm ci for cleaner installs in CI/CD environments
COPY package*.json ./
RUN npm ci --only=production

# Copy the rest of the application source code
COPY tsconfig.json ./
COPY src/ ./src/

# Build the TypeScript application
RUN npm install --only=development
RUN npm run build

# Prune development dependencies
RUN npm prune --production

# Stage 2: Production environment
FROM node:18-alpine

WORKDIR /app

# Copy built application and production dependencies from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose the port the app runs on
EXPOSE 3000

# Define the command to run the application
CMD ["node", "dist/server.js"] 