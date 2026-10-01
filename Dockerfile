FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN npm install -g pnpm@11.25.0 && pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV SQLITE_PATH=/data/topasia.sqlite
COPY --from=build /app ./
EXPOSE 3000
CMD ["sh", "-c", "node node_modules/next/dist/bin/next start -H 0.0.0.0 -p ${PORT:-3000}"]
