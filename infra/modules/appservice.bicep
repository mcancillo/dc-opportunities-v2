@description('Azure region.')
param location string

@description('Unique token for resource names.')
param resourceToken string

@description('Common tags.')
param tags object

@description('App Service regional VNet integration subnet ID.')
param appSubnetId string

@description('Application Insights connection string.')
param appInsightsConnectionString string

@description('Key Vault name for references.')
param keyVaultName string

@description('SQL server FQDN (private).')
param sqlServerFqdn string

@description('SQL database name.')
param sqlDatabaseName string

@description('Storage blob endpoint (private).')
param storageBlobEndpoint string

@description('Entra app registration client ID for Easy Auth. Empty = configure auth post-deploy.')
param authClientId string

var configureAuth = !empty(authClientId)

var commonAppSettings = [
  {
    name: 'SCM_DO_BUILD_DURING_DEPLOYMENT'
    value: 'true'
  }
  {
    name: 'NODE_ENV'
    value: 'production'
  }
  {
    name: 'WEBSITE_RUN_FROM_PACKAGE'
    value: '0'
  }
  {
    name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
    value: appInsightsConnectionString
  }
  {
    name: 'ApplicationInsightsAgent_EXTENSION_VERSION'
    value: '~3'
  }
  {
    name: 'KEY_VAULT_NAME'
    value: keyVaultName
  }
  {
    name: 'SQL_SERVER_FQDN'
    value: sqlServerFqdn
  }
  {
    name: 'SQL_DATABASE_NAME'
    value: sqlDatabaseName
  }
  {
    name: 'STORAGE_BLOB_ENDPOINT'
    value: storageBlobEndpoint
  }
]

// Only Azure Front Door is allowed to reach the apps directly.
var frontDoorOnlyRestrictions = [
  {
    name: 'Allow-FrontDoor'
    priority: 100
    action: 'Allow'
    tag: 'ServiceTag'
    ipAddress: 'AzureFrontDoor.Backend'
  }
  {
    name: 'Deny-All'
    priority: 2147483647
    action: 'Deny'
    ipAddress: 'Any'
  }
]

resource plan 'Microsoft.Web/serverfarms@2024-04-01' = {
  name: 'plan-${resourceToken}'
  location: location
  tags: tags
  kind: 'linux'
  sku: {
    name: 'B2'
    tier: 'Basic'
    capacity: 1
  }
  properties: {
    reserved: true
  }
}

resource adminApp 'Microsoft.Web/sites@2024-04-01' = {
  name: 'app-admin-${resourceToken}'
  location: location
  tags: union(tags, { 'azd-service-name': 'admin' })
  kind: 'app,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    clientAffinityEnabled: false
    virtualNetworkSubnetId: appSubnetId
    publicNetworkAccess: 'Enabled'
    siteConfig: {
      linuxFxVersion: 'NODE|20-lts'
      alwaysOn: true
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      scmMinTlsVersion: '1.2'
      http20Enabled: true
      vnetRouteAllEnabled: true
      healthCheckPath: '/health'
      ipSecurityRestrictions: frontDoorOnlyRestrictions
      scmIpSecurityRestrictionsUseMain: true
      appSettings: union(commonAppSettings, [
        {
          name: 'APP_ROLE'
          value: 'admin'
        }
      ])
    }
  }
}

resource customerApp 'Microsoft.Web/sites@2024-04-01' = {
  name: 'app-customer-${resourceToken}'
  location: location
  tags: union(tags, { 'azd-service-name': 'customer' })
  kind: 'app,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    clientAffinityEnabled: false
    virtualNetworkSubnetId: appSubnetId
    publicNetworkAccess: 'Enabled'
    siteConfig: {
      linuxFxVersion: 'NODE|20-lts'
      alwaysOn: true
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      scmMinTlsVersion: '1.2'
      http20Enabled: true
      vnetRouteAllEnabled: true
      healthCheckPath: '/health'
      ipSecurityRestrictions: frontDoorOnlyRestrictions
      scmIpSecurityRestrictionsUseMain: true
      appSettings: union(commonAppSettings, [
        {
          name: 'APP_ROLE'
          value: 'customer'
        }
      ])
    }
  }
}

resource adminFtp 'Microsoft.Web/sites/basicPublishingCredentialsPolicies@2024-04-01' = {
  parent: adminApp
  name: 'ftp'
  properties: {
    allow: false
  }
}

resource customerFtp 'Microsoft.Web/sites/basicPublishingCredentialsPolicies@2024-04-01' = {
  parent: customerApp
  name: 'ftp'
  properties: {
    allow: false
  }
}

resource adminAuth 'Microsoft.Web/sites/config@2024-04-01' = if (configureAuth) {
  parent: adminApp
  name: 'authsettingsV2'
  properties: {
    platform: {
      enabled: true
    }
    globalValidation: {
      requireAuthentication: true
      unauthenticatedClientAction: 'RedirectToLoginPage'
      redirectToProvider: 'azureactivedirectory'
      excludedPaths: [
        '/health'
      ]
    }
    identityProviders: {
      azureActiveDirectory: {
        enabled: true
        registration: {
          openIdIssuer: 'https://login.microsoftonline.com/${tenant().tenantId}/v2.0'
          clientId: authClientId
        }
        validation: {
          defaultAuthorizationPolicy: {
            allowedApplications: []
          }
        }
      }
    }
    login: {
      tokenStore: {
        enabled: true
      }
    }
  }
}

resource customerAuth 'Microsoft.Web/sites/config@2024-04-01' = if (configureAuth) {
  parent: customerApp
  name: 'authsettingsV2'
  properties: {
    platform: {
      enabled: true
    }
    globalValidation: {
      requireAuthentication: true
      unauthenticatedClientAction: 'RedirectToLoginPage'
      redirectToProvider: 'azureactivedirectory'
      excludedPaths: [
        '/health'
      ]
    }
    identityProviders: {
      azureActiveDirectory: {
        enabled: true
        registration: {
          openIdIssuer: 'https://login.microsoftonline.com/${tenant().tenantId}/v2.0'
          clientId: authClientId
        }
        validation: {
          defaultAuthorizationPolicy: {
            allowedApplications: []
          }
        }
      }
    }
    login: {
      tokenStore: {
        enabled: true
      }
    }
  }
}

output adminName string = adminApp.name
output customerName string = customerApp.name
output adminHostName string = adminApp.properties.defaultHostName
output customerHostName string = customerApp.properties.defaultHostName
output adminPrincipalId string = adminApp.identity.principalId
output customerPrincipalId string = customerApp.identity.principalId
