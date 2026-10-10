# رع شات API — Node 22 + Prisma (PostgreSQL)
# ملحوظة: postinstall بتاع الباكدج بيشغّل `prisma generate` فلازم الـ schema تكون موجودة قبل npm ci
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci
COPY tsconfig*.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json prisma.config.ts ./
COPY prisma ./prisma
# بنسيب postinstall يشتغل: بينزّل محرك الـ migrate (prisma migrate deploy) ويولّد الـ client
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
RUN mkdir -p /app/uploads && chown -R node:node /app
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --start-period=30s --retries=5 \
  CMD wget -qO- http://127.0.0.1:4000/health || exit 1
# migrate deploy ثم تشغيل السيرفر
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
