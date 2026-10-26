# syntax=docker/dockerfile:1
# Build context is the repository root (see compose.yaml): the web app depends on the workspace packages.

FROM node:24-alpine AS build
RUN corepack enable && corepack prepare pnpm@12.15.0 --activate
WORKDIR /repo
COPY . .
RUN --mount=type=cache,id=quizpulse-pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @quizpulse/web...
RUN pnpm --filter @quizpulse/web build

FROM nginx:1.29-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
