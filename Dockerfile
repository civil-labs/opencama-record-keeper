# syntax=docker/dockerfile:1
# Record Keeper: the production build, served by nginx as a non-root user
# (docs/packaging/spec.md). A deployment mounts its own config.json over
# /usr/share/nginx/html/config.json; without one, the build's config.json
# points at the civil-os local stack.

# The Node version in mise.toml.
FROM node:22.23.4-alpine3.24 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY . .
# Tests and lint run in CI before the image is built, not here.
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.30.6-alpine3.24
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
# The base image runs as UID 101; its user and CMD are kept.
EXPOSE 8080
