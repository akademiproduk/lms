FROM node:22-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY tsconfig.json ./
COPY src ./src
RUN npm install --no-save typescript @types/node @types/express @types/jsonwebtoken @types/cors @types/pg && npx tsc -p tsconfig.json

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev && addgroup -S akademi && adduser -S akademi -G akademi
COPY --from=build /app/dist ./dist
USER akademi
EXPOSE 3201
CMD ["node", "dist/index.js"]
