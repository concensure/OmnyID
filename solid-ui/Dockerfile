# Stage 1 — build the SolidJS app
FROM node:24-alpine AS build
# GAP-046: allow the API base URL to be set at Docker build time.
# Defaults to empty (same-origin) which is correct for the production Caddy setup.
ARG VITE_API_BASE=""
ENV VITE_API_BASE=$VITE_API_BASE
ARG VITE_WEDDING_AUTOMATIC_SHORTLIST_ENABLED="true"
ENV VITE_WEDDING_AUTOMATIC_SHORTLIST_ENABLED=$VITE_WEDDING_AUTOMATIC_SHORTLIST_ENABLED
ARG VITE_WEDDING_VENDOR_RANKING_POLICY_V2="false"
ENV VITE_WEDDING_VENDOR_RANKING_POLICY_V2=$VITE_WEDDING_VENDOR_RANKING_POLICY_V2
ARG VITE_PLANNING_CONSTRAINT_CAPTURE_ENABLED="false"
ENV VITE_PLANNING_CONSTRAINT_CAPTURE_ENABLED=$VITE_PLANNING_CONSTRAINT_CAPTURE_ENABLED
ARG VITE_PLANNING_CONSTRAINT_EVALUATION_ENABLED="false"
ENV VITE_PLANNING_CONSTRAINT_EVALUATION_ENABLED=$VITE_PLANNING_CONSTRAINT_EVALUATION_ENABLED
ARG VITE_PLANNING_COST_TRADEOFFS_ENABLED="false"
ENV VITE_PLANNING_COST_TRADEOFFS_ENABLED=$VITE_PLANNING_COST_TRADEOFFS_ENABLED
ARG VITE_PLANNING_CRITICAL_PATH_ENABLED="false"
ENV VITE_PLANNING_CRITICAL_PATH_ENABLED=$VITE_PLANNING_CRITICAL_PATH_ENABLED
ARG VITE_PLANNING_VENDOR_CHANGES_ENABLED="false"
ENV VITE_PLANNING_VENDOR_CHANGES_ENABLED=$VITE_PLANNING_VENDOR_CHANGES_ENABLED
ARG VITE_PLANNING_CONSTRAINT_INTERVENTION_ENABLED="false"
ENV VITE_PLANNING_CONSTRAINT_INTERVENTION_ENABLED=$VITE_PLANNING_CONSTRAINT_INTERVENTION_ENABLED
ARG VITE_PLANNING_UNIFIED_INTERVENTIONS_ENABLED="false"
ENV VITE_PLANNING_UNIFIED_INTERVENTIONS_ENABLED=$VITE_PLANNING_UNIFIED_INTERVENTIONS_ENABLED
WORKDIR /app
COPY typescript-sdk/package.json ../typescript-sdk/package.json
COPY typescript-sdk/package-lock.json ../typescript-sdk/package-lock.json
COPY typescript-sdk/scripts/ ../typescript-sdk/scripts/
COPY typescript-sdk/tsconfig*.json ../typescript-sdk/
COPY typescript-sdk/src/ ../typescript-sdk/src/
RUN cd ../typescript-sdk && npm ci && npm run build
COPY solid-ui/package.json ./package.json
COPY solid-ui/package-lock.json ./package-lock.json
RUN npm ci
COPY solid-ui/ .
RUN npm run build

# Stage 2 — minimal alpine image that seeds a shared volume
# This container copies the built assets to /srv/workspace (a named volume
# shared with the caddy service) and then exits cleanly.
# Caddy's "depends_on: ui (service_completed_successfully)" ensures caddy
# only starts after the assets are in place.
FROM alpine:3.20
COPY --from=build /app/dist /app/dist
CMD ["sh", "-c", "cp -r /app/dist/. /srv/workspace/ && echo 'UI assets ready at /srv/workspace'"]
