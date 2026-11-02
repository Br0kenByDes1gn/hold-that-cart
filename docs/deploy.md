# Deployment (Azure Container Apps + GHCR + Postgres B1ms)

This repo deploys on **tag push** `v*.*.*` via GitHub Actions. The image goes to a **public** GitHub Container Registry package; Azure pulls it anonymously. The app serves the built SPA from Hono on `:3001`.

## Architecture

- **Compute:** Azure Container Apps (external HTTPS ingress, `minReplicas` 0 by default, `maxReplicas` 1)
- **Database:** Azure Database for PostgreSQL Flexible Server `Standard_B1ms` (PG 16, 32 GB, 7-day backup, TLS required)
- **Registry:** `ghcr.io/<owner>/hold-that-cart` (public)
- **Secrets:** `DATABASE_URL` and `MODEL_API_KEY` are secure Bicep parameters, stored as Container App secrets and injected as env vars. Rotate them by re-running the Bicep deployment (or `az containerapp secret set`). Key Vault is optional hardening later, not part of the template.
- **Domain:** `https://holdthatcart.lol` (apex) via a free managed certificate

## 1) Register `holdthatcart.lol`

1. Buy `holdthatcart.lol` at your registrar (Cloudflare Registrar recommended).
2. Keep DNS **DNS-only/grey cloud** for the records we create. If you proxy through Cloudflare, DigiCert cannot issue/renew the managed certificate.

## 2) Create the Azure resources (Bicep)

```bash
# set these
RG=rg-hold-that-cart
LOC=westeurope
PGPASS='change-me-to-a-long-random-password'
MODEL_KEY='your-meta-muse-key'

# create resource group
az group create -n $RG -l $LOC

# deploy infrastructure (bootstrap placeholder image)
az deployment group create \
  -g $RG \
  -f infra/main.bicep \
  -p @infra/main.parameters.json \
  -p postgresAdminPassword="$PGPASS" \
  -p modelApiKey="$MODEL_KEY"
```

The deployment outputs `fqdn`, `staticIp`, `containerAppName`, `environmentName`. Save them.

## 3) Configure GitHub OIDC (federated credentials)

Create an Entra ID app registration, give it a federated credential for the **production** environment, and let it deploy into the resource group:

```bash
RG=rg-hold-that-cart
REPO=Br0kenByDes1gn/hold-that-cart

APP_ID=$(az ad app create --display-name "hold-that-cart-deploy" --query appId -o tsv)
az ad sp create --id "$APP_ID" > /dev/null

az ad app federated-credential create --id "$APP_ID" --parameters "{
  \"name\": \"github-production\",
  \"issuer\": \"https://token.actions.githubusercontent.com\",
  \"subject\": \"repo:$REPO:environment:production\",
  \"audiences\": [\"api://AzureADTokenExchange\"]
}"

az role assignment create --assignee "$APP_ID" --role Contributor \
  --scope "/subscriptions/$(az account show --query id -o tsv)/resourceGroups/$RG"

echo "AZURE_CLIENT_ID=$APP_ID"
az account show --query tenantId -o tsv   # AZURE_TENANT_ID
az account show --query id -o tsv         # AZURE_SUBSCRIPTION_ID
```

In the repo:
- **Settings → Environments → production:** add required reviewers if you want a manual gate before deploys.
- **Settings → Secrets and variables → Actions → Secrets:** `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`
- **Settings → Secrets and variables → Actions → Variables:** `RESOURCE_GROUP` = `rg-hold-that-cart`, `CONTAINER_APP` = `holdthatcart-app` (or the name from the deployment outputs), optional `SMOKE_URL` = `https://holdthatcart.lol`

The workflow uses `permissions: { contents: read, packages: write, id-token: write }` and `GITHUB_TOKEN` to push to GHCR.

## 4) Make the GHCR package public

Because the repo is public, the container package is usually public by default. If it isn't:

1. Push an image once (`publish_only` run in step 5).
2. Open `https://github.com/orgs/Br0kenByDes1gn/packages/container/hold-that-cart`.
3. **Package settings → Danger Zone → Change visibility → Public**. Once public it cannot be made private again.
4. Ensure **Manage Actions access** includes this repository (it inherits from the repo).

## 5) First deploy

**Bootstrap the image first** (no Azure needed yet): after the workflow exists on `main`, run **Actions → Deploy → Run workflow**, branch `main`, `tag: v0.1.0`, `publish_only: true`. That builds the current `main` and pushes it as `ghcr.io/br0kenbydes1gn/hold-that-cart:v0.1.0`. Then make the package public (step 4).

**Then deploy by tag** (the normal path — deploy on every `v*.*.*` push):

```bash
git tag v0.1.0
git push origin v0.1.0
```

The workflow runs `verify` (typecheck + unit + e2e) → `publish` (build/push image) → `deploy` (`az containerapp update` + single-revision mode) → `smoke` (waits for `/api/health` to report the tag, seeds demo, checks `/api/briefing`). Set the repo variable `SMOKE_URL=https://holdthatcart.lol` to have the smoke job check the custom domain as well.

Redeploy an existing tag without a new commit: **Actions → Deploy → Run workflow** with that tag.

## 6) Custom domain (holdthatcart.lol, apex)

This is a one-time step; DNS + managed certificate issuance are not idempotent per deploy.

### Prerequisites
- Domain `holdthatcart.lol` registered (Cloudflare Registrar recommended). Keep DNS **DNS-only/grey cloud** while issuing/renewing the certificate.
- Container App is up and healthy (`/api/health` returns `ok`).
- If your DNS zone has CAA records, add `0 issue "digicert.com"`.

### Get values
```bash
RG=rg-hold-that-cart
APP=holdthatcart-app
ENV=holdthatcart-env
HOST=holdthatcart.lol

az containerapp env show -n $ENV -g $RG -o tsv --query "properties.staticIp"
az containerapp show -n $APP -g $RG -o tsv --query "properties.customDomainVerificationId"
```

### Add DNS records
Create these at your DNS provider:

| Type | Host/Name | Value | Notes |
|---|---|---|---|
| A | `@` | `<staticIp>` from above | Apex. DNS-only/grey cloud if using Cloudflare. |
| TXT | `asuid` | `<customDomainVerificationId>` from above | Proves ownership for HTTP validation. |

Propagate and verify:
```bash
dig +short A holdthatcart.lol
dig +short TXT asuid.holdthatcart.lol
```

### Bind hostname
For apex domains, use HTTP validation (CNAME validation only works for subdomains). Set `minReplicas: 1` to be safe during first issuance:
```bash
az containerapp update -g $RG -n $APP --min-replicas 1

az containerapp hostname add  --hostname $HOST -g $RG -n $APP
az containerapp hostname bind --hostname $HOST -g $RG -n $APP --environment $ENV --validation-method HTTP
```

Check progress:
```bash
az containerapp hostname list -g $RG -n $APP -o table
```
Once status is `Secured`, the free managed cert is issued and auto-renews. You can drop replicas back to `0`:
```bash
az containerapp update -g $RG -n $APP --min-replicas 0
```

### Verify
```bash
curl -I https://holdthatcart.lol/api/health
curl -s https://holdthatcart.lol/api/health  # {"ok":true,"version":"v0.1.0"}
```

Notes:
- Don't serve both `www.holdthatcart.lol` and `holdthatcart.lol` as real origins (different origins = different `localStorage` device IDs → different pantries). If you want `www`, redirect it to the apex via Cloudflare Redirect Rules.
- If the Container Apps environment is recreated, `staticIp` changes and the A record must be updated.
- The production app redirects `http://` → `https://` and sets `Strict-Transport-Security`.

## Verify the image locally

`docker build` + a local Postgres is enough to prove the production path before touching Azure:

```bash
docker build -t hold-that-cart:local .

docker run -d --name htc-pg -e POSTGRES_PASSWORD=testpass \
  -e POSTGRES_DB=holdthatcart -p 55432:5432 postgres:16

docker run -d --name htc-app -p 3104:3001 \
  -e NODE_ENV=production -e DB_DRIVER=postgres -e APP_VERSION=local \
  -e DATABASE_URL='postgresql://postgres:testpass@host.docker.internal:55432/holdthatcart?sslmode=disable' \
  hold-that-cart:local

curl -s localhost:3104/api/health          # {"ok":true,"version":"local"}
curl -s -o /dev/null -w '%{http_code}\n' localhost:3104/api/dev/pantry-schedule  # 404
```

The container creates the schema on boot, serves the PWA, and writes `log.txt` as the non-root `node` user. Drop `?sslmode=disable` in Azure — Bicep uses `sslmode=require`.

## Rollback

Either redeploy an older tag via `workflow_dispatch` with `tag: v0.0.9`, or shift traffic to a previous revision:

```bash
az containerapp revision list -g $RG -n $APP -o table
az containerapp ingress traffic set -g $RG -n $APP --revision-weight <old-revision>=100
```

Revisions are immutable.

## Tear down

```bash
az group delete -n $RG --yes --no-wait
```

## Troubleshooting

- **DB won't connect:** the URL must include `sslmode=require`; Bicep adds it. `getDb()` forces `ssl: "require"` for Postgres.
- **Schema errors on first boot:** the app runs idempotent DDL automatically. If you already have objects, keep `DB_AUTO_MIGRATE=on` or set `off` and manage manually.
- **Image pull fails:** the package must be public (or you'd need a registry credential). This repo is public.
- **E2E fails in CI:** `playwright install --with-deps chromium` is included; the webServer still builds locally in Playwright config, which matches the workflow.
- **Cold start:** `minReplicas: 0` means first request can take a few seconds — expected.
- **HTTP → HTTPS redirect:** production Hono middleware does 301 redirects using `x-forwarded-proto`.
