### RapidTool-ToolTrace — Vite + npm-workspaces build, served by nginx.
### Mirrors RapidTool-Fixture's deploy. Target: tooltrace.appliedadditive.com
FROM node:20-alpine AS build
WORKDIR /app

# Copy the whole monorepo (root + packages/) so npm can resolve the workspaces
# (@rapidtool/cad-core, cad-ui, storage). .dockerignore keeps the context lean.
COPY . .

# Reproducible install of root + all workspace deps.
RUN npm ci

# tsc -b builds the workspace packages (project refs); vite bundles the app.
# Reads .env.production (NODE_ENV=production → real cookie auth, rapi backend).
RUN npm run build

### Static server
FROM nginx:stable-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY ./nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
