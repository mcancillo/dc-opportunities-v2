targetScope = 'subscription'

@minLength(1)
@maxLength(64)
@description('azd environment name; used to name the resource group and derive resource names.')
param environmentName string

@minLength(1)
@description('Primary Azure region for all resources.')
param location string

@description('Object ID of the workforce Entra admin (macancil@microsoft.com) used as SQL Entra admin and app admin.')
param sqlAdminObjectId string = '152ac45e-e0f3-4c02-96bc-4fe700f205cd'

@description('UPN/display name of the workforce Entra admin for SQL Entra admin login.')
param sqlAdminLogin string = 'macancil@microsoft.com'

@description('Client ID of an existing Entra app registration for App Service Easy Auth (workforce). Leave empty to configure auth post-deploy.')
param authClientId string = ''

@description('Emails that receive cost-budget alerts.')
param alertEmails array = [
  'macancil@microsoft.com'
  'mcancillo@hotmail.com'
]

@description('Monthly cost cap in USD.')
param monthlyBudgetAmount int = 300

var resourceToken = toLower(uniqueString(subscription().id, environmentName, location))
var tags = {
  'azd-env-name': environmentName
}

// GitOps access-control config (edit these files in the repo + redeploy to change access).
var ispAllowlist = loadJsonContent('../config/isp-allowlist.json')
var accessControl = loadJsonContent('../config/access-control.json')

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: 'rg-${environmentName}'
  location: location
  tags: tags
}

module monitoring 'modules/monitoring.bicep' = {
  name: 'monitoring'
  scope: rg
  params: {
    location: location
    resourceToken: resourceToken
    tags: tags
  }
}

module network 'modules/network.bicep' = {
  name: 'network'
  scope: rg
  params: {
    location: location
    resourceToken: resourceToken
    tags: tags
  }
}

module keyvault 'modules/keyvault.bicep' = {
  name: 'keyvault'
  scope: rg
  params: {
    location: location
    resourceToken: resourceToken
    tags: tags
    privateEndpointSubnetId: network.outputs.privateEndpointSubnetId
    vnetId: network.outputs.vnetId
  }
}

module storage 'modules/storage.bicep' = {
  name: 'storage'
  scope: rg
  params: {
    location: location
    resourceToken: resourceToken
    tags: tags
    privateEndpointSubnetId: network.outputs.privateEndpointSubnetId
    vnetId: network.outputs.vnetId
  }
}

module sql 'modules/sql.bicep' = {
  name: 'sql'
  scope: rg
  params: {
    location: location
    resourceToken: resourceToken
    tags: tags
    sqlAdminObjectId: sqlAdminObjectId
    sqlAdminLogin: sqlAdminLogin
    privateEndpointSubnetId: network.outputs.privateEndpointSubnetId
    vnetId: network.outputs.vnetId
  }
}

module app 'modules/appservice.bicep' = {
  name: 'appservice'
  scope: rg
  params: {
    location: location
    resourceToken: resourceToken
    tags: tags
    appSubnetId: network.outputs.appSubnetId
    appInsightsConnectionString: monitoring.outputs.appInsightsConnectionString
    keyVaultName: keyvault.outputs.keyVaultName
    sqlServerFqdn: sql.outputs.sqlServerFqdn
    sqlDatabaseName: sql.outputs.sqlDatabaseName
    storageBlobEndpoint: storage.outputs.blobEndpoint
    authClientId: authClientId
  }
}

module rbac 'modules/rbac.bicep' = {
  name: 'rbac'
  scope: rg
  params: {
    keyVaultName: keyvault.outputs.keyVaultName
    storageAccountName: storage.outputs.storageAccountName
    principalIds: [
      app.outputs.adminPrincipalId
      app.outputs.customerPrincipalId
    ]
  }
}

module frontdoor 'modules/frontdoor.bicep' = {
  name: 'frontdoor'
  scope: rg
  params: {
    resourceToken: resourceToken
    tags: tags
    adminHostName: app.outputs.adminHostName
    customerHostName: app.outputs.customerHostName
    logAnalyticsId: monitoring.outputs.logAnalyticsId
    kpnCidrs: ispAllowlist.kpn
    ziggoCidrs: ispAllowlist.ziggo
    adminAllowedIps: accessControl.admin.allowedIps
  }
}

module budget 'modules/budget.bicep' = {
  name: 'budget'
  scope: rg
  params: {
    resourceToken: resourceToken
    monthlyBudgetAmount: monthlyBudgetAmount
    alertEmails: alertEmails
  }
}

output AZURE_LOCATION string = location
output AZURE_TENANT_ID string = tenant().tenantId
output SERVICE_ADMIN_NAME string = app.outputs.adminName
output SERVICE_CUSTOMER_NAME string = app.outputs.customerName
output ADMIN_URI string = 'https://${frontdoor.outputs.adminEndpointHostName}'
output CUSTOMER_URI string = 'https://${frontdoor.outputs.customerEndpointHostName}'
output SQL_SERVER_FQDN string = sql.outputs.sqlServerFqdn
output SQL_DATABASE_NAME string = sql.outputs.sqlDatabaseName
