// Hold That Cart — Azure infrastructure.
//
// One resource group holds everything the demo needs: a Container Apps
// environment (scale to zero), a small Postgres Flexible Server, and the
// container app itself. Deploy once by hand; the tag workflow only swaps the
// image afterwards.
//
//   az deployment group create \
//     -g rg-hold-that-cart -f infra/main.bicep \
//     -p @infra/main.parameters.json \
//     -p postgresAdminPassword="$PGPASS" modelApiKey="$MODEL_API_KEY"

@description('Azure region for every resource.')
param location string = resourceGroup().location

@description('Short lowercase prefix for resource names.')
@minLength(3)
@maxLength(20)
param namePrefix string = 'holdthatcart'

@description('Container image. Placeholder until the first tagged deploy replaces it.')
param image string = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

@description('Revision label exposed on /api/health (set by the deploy workflow).')
param appVersion string = 'bootstrap'

@description('Minimum replicas. 0 = scale to zero (cold start); 1 for demo week.')
@minValue(0)
@maxValue(10)
param minReplicas int = 0

@description('Maximum replicas. Keep at 1 until the schema is managed by migrations.')
@minValue(1)
@maxValue(10)
param maxReplicas int = 1

@description('Postgres administrator login.')
param postgresAdminLogin string = 'htcadmin'

@secure()
@description('Postgres administrator password. Never commit it.')
@minLength(12)
param postgresAdminPassword string

@description('Database name inside the Postgres server.')
param databaseName string = 'holdthatcart'

@secure()
@description('Meta Model API key. Stored as a Container App secret, not in the repo.')
param modelApiKey string

param metaBaseUrl string = 'https://api.meta.ai/v1'
param metaModel string = 'muse-spark-1.3'

var postgresName = toLower('${namePrefix}-pg-${uniqueString(resourceGroup().id)}')

resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${namePrefix}-logs'
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2022-12-01' = {
  name: postgresName
  location: location
  sku: {
    name: 'Standard_B1ms'
    tier: 'Burstable'
  }
  properties: {
    version: '16'
    administratorLogin: postgresAdminLogin
    administratorLoginPassword: postgresAdminPassword
    storage: {
      storageSizeGB: 32
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
  }
}

// Container Apps egress IPs are dynamic, so allow Azure services rather than
// pinning addresses.
resource postgresFirewall 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2022-12-01' = {
  parent: postgres
  name: 'AllowAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2022-12-01' = {
  parent: postgres
  name: databaseName
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

// Public network access is on by default for Flexible Server; the firewall rule
// below narrows it to "Azure services". The container app applies the schema at
// boot (DB_AUTO_MIGRATE), so keep maxReplicas at 1 until real migrations exist.
resource environment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${namePrefix}-env'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logs.properties.customerId
        sharedKey: logs.listKeys().primarySharedKey
      }
    }
  }
}

resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${namePrefix}-app'
  location: location
  identity: { type: 'SystemAssigned' }
  properties: {
    managedEnvironmentId: environment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 3001
        transport: 'auto'
        allowInsecure: false
        traffic: [
          {
            latestRevision: true
            weight: 100
          }
        ]
      }
      secrets: [
        { name: 'model-api-key', value: modelApiKey }
        {
          name: 'database-url'
          // Inlined (not a var) because resource properties are runtime values.
          value: 'postgresql://${postgresAdminLogin}:${uriComponent(postgresAdminPassword)}@${postgres.properties.fullyQualifiedDomainName}:5432/${databaseName}?sslmode=require'
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'app'
          image: image
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            { name: 'NODE_ENV', value: 'production' }
            { name: 'PORT', value: '3001' }
            { name: 'APP_VERSION', value: appVersion }
            { name: 'DB_DRIVER', value: 'postgres' }
            { name: 'DB_AUTO_MIGRATE', value: 'on' }
            { name: 'DEV_ENDPOINTS', value: 'off' }
            { name: 'META_BASE_URL', value: metaBaseUrl }
            { name: 'META_MODEL', value: metaModel }
            { name: 'DATABASE_URL', secretRef: 'database-url' }
            { name: 'MODEL_API_KEY', secretRef: 'model-api-key' }
          ]
          probes: [
            {
              type: 'Startup'
              httpGet: { path: '/api/health', port: 3001, scheme: 'HTTP' }
              initialDelaySeconds: 5
              periodSeconds: 5
              failureThreshold: 24
            }
            {
              type: 'Readiness'
              httpGet: { path: '/api/health', port: 3001, scheme: 'HTTP' }
              initialDelaySeconds: 5
              periodSeconds: 10
              failureThreshold: 3
            }
            {
              type: 'Liveness'
              httpGet: { path: '/api/health', port: 3001, scheme: 'HTTP' }
              initialDelaySeconds: 10
              periodSeconds: 30
              failureThreshold: 3
            }
          ]
        }
      ]
      scale: {
        minReplicas: minReplicas
        maxReplicas: maxReplicas
      }
    }
  }
}

output fqdn string = containerApp.properties.configuration.ingress.fqdn
output staticIp string = environment.properties.staticIp
output containerAppName string = containerApp.name
output environmentName string = environment.name
output resourceGroupName string = resourceGroup().name
output postgresHost string = postgres.properties.fullyQualifiedDomainName
output databaseUrlHint string = 'postgresql://${postgresAdminLogin}:***@${postgres.properties.fullyQualifiedDomainName}:5432/${databaseName}?sslmode=require'
