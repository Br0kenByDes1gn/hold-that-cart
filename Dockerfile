# syntax=docker/dockerfile:1

# Pin the pnpm version from package.json (`packageManager`). Installing it
# explicitly avoids depending on corepack, which is being removed from Node.
FROM node:22-bookworm-slim AS base
RUN npm install --global pnpm@10.32.1
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
# Product PNGs and icons.json are generated (gitignored) from assets/.
RUN pnpm run assets:normalize && pnpm run build

FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile

FROM base AS runtime
ENV NODE_ENV=production \
    PORT=3001
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
COPY --from=build /app/package.json ./package.json
# logger.ts writes log.txt into the working directory at startup.
RUN chown -R node:node /app
USER node
EXPOSE 3001
CMD ["node", "dist-server/index.js"]
