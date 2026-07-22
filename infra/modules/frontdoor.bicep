@description('Unique token for resource names.')
param resourceToken string

@description('Common tags.')
param tags object

@description('Admin App Service default host name (origin).')
param adminHostName string

@description('Customer App Service default host name (origin).')
param customerHostName string

@description('Log Analytics workspace ID for diagnostics.')
param logAnalyticsId string

var profileName = 'afd-${resourceToken}'

resource profile 'Microsoft.Cdn/profiles@2024-02-01' = {
  name: profileName
  location: 'global'
  tags: tags
  sku: {
    name: 'Standard_AzureFrontDoor'
  }
}

// Web Application Firewall policy (Standard supports custom rules).
resource wafPolicy 'Microsoft.Network/FrontDoorWebApplicationFirewallPolicies@2024-02-01' = {
  name: 'waf${resourceToken}'
  location: 'global'
  tags: tags
  sku: {
    name: 'Standard_AzureFrontDoor'
  }
  properties: {
    policySettings: {
      enabledState: 'Enabled'
      mode: 'Prevention'
    }
    customRules: {
      rules: [
        {
          name: 'RateLimitPerIp'
          priority: 100
          enabledState: 'Enabled'
          ruleType: 'RateLimitRule'
          rateLimitDurationInMinutes: 1
          rateLimitThreshold: 200
          matchConditions: [
            {
              matchVariable: 'RequestUri'
              operator: 'Any'
              negateCondition: false
              matchValue: []
            }
          ]
          action: 'Block'
        }
      ]
    }
  }
}

// ---- Admin endpoint ----
resource adminEndpoint 'Microsoft.Cdn/profiles/afdEndpoints@2024-02-01' = {
  parent: profile
  name: 'admin-${resourceToken}'
  location: 'global'
  tags: tags
  properties: {
    enabledState: 'Enabled'
  }
}

resource adminOriginGroup 'Microsoft.Cdn/profiles/originGroups@2024-02-01' = {
  parent: profile
  name: 'admin-og'
  properties: {
    loadBalancingSettings: {
      sampleSize: 4
      successfulSamplesRequired: 3
      additionalLatencyInMilliseconds: 50
    }
    healthProbeSettings: {
      probePath: '/health'
      probeRequestType: 'GET'
      probeProtocol: 'Https'
      probeIntervalInSeconds: 60
    }
  }
}

resource adminOrigin 'Microsoft.Cdn/profiles/originGroups/origins@2024-02-01' = {
  parent: adminOriginGroup
  name: 'admin-origin'
  properties: {
    hostName: adminHostName
    originHostHeader: adminHostName
    httpsPort: 443
    priority: 1
    weight: 1000
    enabledState: 'Enabled'
    enforceCertificateNameCheck: true
  }
}

resource adminRoute 'Microsoft.Cdn/profiles/afdEndpoints/routes@2024-02-01' = {
  parent: adminEndpoint
  name: 'admin-route'
  dependsOn: [
    adminOrigin
  ]
  properties: {
    originGroup: {
      id: adminOriginGroup.id
    }
    supportedProtocols: [
      'Https'
    ]
    patternsToMatch: [
      '/*'
    ]
    forwardingProtocol: 'HttpsOnly'
    httpsRedirect: 'Enabled'
    linkToDefaultDomain: 'Enabled'
  }
}

// ---- Customer endpoint ----
resource customerEndpoint 'Microsoft.Cdn/profiles/afdEndpoints@2024-02-01' = {
  parent: profile
  name: 'customer-${resourceToken}'
  location: 'global'
  tags: tags
  properties: {
    enabledState: 'Enabled'
  }
}

resource customerOriginGroup 'Microsoft.Cdn/profiles/originGroups@2024-02-01' = {
  parent: profile
  name: 'customer-og'
  properties: {
    loadBalancingSettings: {
      sampleSize: 4
      successfulSamplesRequired: 3
      additionalLatencyInMilliseconds: 50
    }
    healthProbeSettings: {
      probePath: '/health'
      probeRequestType: 'GET'
      probeProtocol: 'Https'
      probeIntervalInSeconds: 60
    }
  }
}

resource customerOrigin 'Microsoft.Cdn/profiles/originGroups/origins@2024-02-01' = {
  parent: customerOriginGroup
  name: 'customer-origin'
  properties: {
    hostName: customerHostName
    originHostHeader: customerHostName
    httpsPort: 443
    priority: 1
    weight: 1000
    enabledState: 'Enabled'
    enforceCertificateNameCheck: true
  }
}

resource customerRoute 'Microsoft.Cdn/profiles/afdEndpoints/routes@2024-02-01' = {
  parent: customerEndpoint
  name: 'customer-route'
  dependsOn: [
    customerOrigin
  ]
  properties: {
    originGroup: {
      id: customerOriginGroup.id
    }
    supportedProtocols: [
      'Https'
    ]
    patternsToMatch: [
      '/*'
    ]
    forwardingProtocol: 'HttpsOnly'
    httpsRedirect: 'Enabled'
    linkToDefaultDomain: 'Enabled'
  }
}

// Associate the WAF policy with both endpoints.
resource securityPolicy 'Microsoft.Cdn/profiles/securityPolicies@2024-02-01' = {
  parent: profile
  name: 'waf-association'
  properties: {
    parameters: {
      type: 'WebApplicationFirewall'
      wafPolicy: {
        id: wafPolicy.id
      }
      associations: [
        {
          domains: [
            {
              id: adminEndpoint.id
            }
            {
              id: customerEndpoint.id
            }
          ]
          patternsToMatch: [
            '/*'
          ]
        }
      ]
    }
  }
}

resource diagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: 'afd-diag'
  scope: profile
  properties: {
    workspaceId: logAnalyticsId
    logs: [
      {
        categoryGroup: 'allLogs'
        enabled: true
      }
    ]
    metrics: [
      {
        category: 'AllMetrics'
        enabled: true
      }
    ]
  }
}

output adminEndpointHostName string = adminEndpoint.properties.hostName
output customerEndpointHostName string = customerEndpoint.properties.hostName
output frontDoorId string = profile.properties.frontDoorId
