# syntax=docker/dockerfile:1
# Build context is the repository root (see compose.yaml): the API depends on the workspace packages and contracts.

FROM node:24-alpine AS build
RUN corepack enable && corepack prepare pnpm@12.15.0 --activate
WORKDIR /repo
COPY . .
RUN --mount=type=cache,id=quizpulse-pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @quizpulse/api...
RUN pnpm --filter @quizpulse/api build
# The workspace packages export TypeScript sources, which Node cannot load from node_modules at runtime:
# compile them and point their `exports` at the output before the production tree is assembled.
RUN set -e; \
    for pkg in protocol game-engine; do \
        (cd "packages/$pkg" && /repo/apps/api/node_modules/.bin/swc src -d dist --strip-leading-paths \
            --config-file /repo/apps/api/.swcrc); \
        node -e "const f='packages/$pkg/package.json';const p=JSON.parse(require('fs').readFileSync(f,'utf8'));p.exports={'.':'./dist/index.js'};require('fs').writeFileSync(f,JSON.stringify(p,null,2))"; \
    done
RUN pnpm --filter @quizpulse/api deploy --prod /out

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/package.json ./package.json
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/apps/api/seed ./seed
COPY --from=build /repo/contracts/openapi.yaml ./contracts/openapi.yaml
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
