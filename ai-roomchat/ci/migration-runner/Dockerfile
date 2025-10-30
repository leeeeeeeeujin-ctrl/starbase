FROM node:20-slim

WORKDIR /app

# Copy only the migration runner and SQL files to keep the image small
COPY ./ai-roomchat/scripts ./scripts
COPY ./ai-roomchat/sql ./sql
COPY ./ai-roomchat/package.json ./package.json
COPY ./ai-roomchat/package-lock.json ./package-lock.json

# Install only runtime dependency (pg) to keep image slim and deterministic
RUN npm install --no-audit --no-fund pg@^8.10.0

ENV NODE_ENV=production

ENTRYPOINT ["node", "./scripts/apply-migrations.js"]
