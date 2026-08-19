FROM node:24-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:24-alpine 
WORKDIR /app
COPY package*.json ./
ENV NODE_ENV=production
RUN npm ci --only=production
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/redis/lua ./src/redis/lua
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD [ "node" ,"/app/dist/index.js" ]
# CMD ["node" , "dist/index.js"] this path would also work because my workdir is /app

