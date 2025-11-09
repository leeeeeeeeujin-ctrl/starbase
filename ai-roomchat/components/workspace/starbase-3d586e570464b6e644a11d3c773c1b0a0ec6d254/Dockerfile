# Node.js 개발 환경용 Dockerfile
FROM node:18

WORKDIR /app

COPY ./starbase/ai-roomchat ./starbase/ai-roomchat

WORKDIR /app/starbase/ai-roomchat

RUN npm ci

EXPOSE 3000

CMD ["npm", "run", "dev"]
