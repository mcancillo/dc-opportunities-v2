@description('Key Vault name to grant secret access on.')
param keyVaultName string

@description('Storage account name to grant blob access on.')
param storageAccountName string

@description('Principal IDs (managed identities) to grant access to.')
param principalIds array

var keyVaultSecretsUser = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')
var storageBlobDataContributor = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe')

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
}

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: storageAccountName
}

resource kvRoleAssignments 'Microsoft.Authorization/roleAssignments@2022-04-01' = [
  for pid in principalIds: {
    name: guid(keyVault.id, pid, keyVaultSecretsUser)
    scope: keyVault
    properties: {
      principalId: pid
      roleDefinitionId: keyVaultSecretsUser
      principalType: 'ServicePrincipal'
    }
  }
]

resource storageRoleAssignments 'Microsoft.Authorization/roleAssignments@2022-04-01' = [
  for pid in principalIds: {
    name: guid(storageAccount.id, pid, storageBlobDataContributor)
    scope: storageAccount
    properties: {
      principalId: pid
      roleDefinitionId: storageBlobDataContributor
      principalType: 'ServicePrincipal'
    }
  }
]
