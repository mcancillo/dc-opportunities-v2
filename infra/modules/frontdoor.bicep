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

@description('KPN IP CIDR ranges permitted to reach the website (from config/isp-allowlist.json).')
param kpnCidrs array

@description('Ziggo IP CIDR ranges permitted to reach the website (from config/isp-allowlist.json).')
param ziggoCidrs array

@description('Odido IP CIDR ranges permitted to reach the website (from config/isp-allowlist.json).')
param odidoCidrs array

@description('Explicit CIDRs allowed to reach the ADMIN endpoint. When set, admin is locked to these only; when empty, admin falls back to the ISP allowlist.')
param adminAllowedIps array = []

@description('When true, the customer endpoint is publicly accessible (rate-limited only); access is governed by the application login instead of the ISP allowlist.')
param customerPublic bool = false

@description('When true, the admin endpoint is publicly accessible (rate-limited only); access is governed by the application login instead of the ISP/IP allowlist.')
param adminPublic bool = false

var profileName = 'afd-${resourceToken}'

// --- Reusable WAF custom-rule building blocks (allowlist model) ---
// Requests matching an Allow rule skip the remaining custom rules; anything that
// falls through is caught by the final catch-all Block rule.
var rateLimitRule = {
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

var allowKpnRule = {
  name: 'AllowKPN'
  priority: 200
  enabledState: 'Enabled'
  ruleType: 'MatchRule'
  matchConditions: [
    {
      matchVariable: 'RemoteAddr'
      operator: 'IPMatch'
      negateCondition: false
      matchValue: kpnCidrs
    }
  ]
  action: 'Allow'
}

var allowZiggoRule = {
  name: 'AllowZiggo'
  priority: 210
  enabledState: 'Enabled'
  ruleType: 'MatchRule'
  matchConditions: [
    {
      matchVariable: 'RemoteAddr'
      operator: 'IPMatch'
      negateCondition: false
      matchValue: ziggoCidrs
    }
  ]
  action: 'Allow'
}

var allowOdidoRule = {
  name: 'AllowOdido'
  priority: 220
  enabledState: 'Enabled'
  ruleType: 'MatchRule'
  matchConditions: [
    {
      matchVariable: 'RemoteAddr'
      operator: 'IPMatch'
      negateCondition: false
      matchValue: odidoCidrs
    }
  ]
  action: 'Allow'
}

var allowAdminRule = {
  name: 'AllowAdminIps'
  priority: 150
  enabledState: 'Enabled'
  ruleType: 'MatchRule'
  matchConditions: [
    {
      matchVariable: 'RemoteAddr'
      operator: 'IPMatch'
      negateCondition: false
      matchValue: adminAllowedIps
    }
  ]
  action: 'Allow'
}

var blockAllRule = {
  name: 'BlockNonAllowed'
  priority: 65000
  enabledState: 'Enabled'
  ruleType: 'MatchRule'
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

// Public/customer endpoint: when customerPublic is true it is reachable from the
// whole internet (rate-limited only) and access is enforced by the app login;
// otherwise it is restricted to the Ziggo + KPN + Odido consumer ISP ranges.
var customerWafRules = customerPublic ? [
  rateLimitRule
] : [
  rateLimitRule
  allowKpnRule
  allowZiggoRule
  allowOdidoRule
  blockAllRule
]

// Admin endpoint: public (login-governed) when adminPublic is true; else locked to
// explicit admin CIDRs when configured, otherwise the ISP allowlist.
var adminWafRules = adminPublic ? [
  rateLimitRule
] : empty(adminAllowedIps) ? [
  rateLimitRule
  allowKpnRule
  allowZiggoRule
  allowOdidoRule
  blockAllRule
] : [
  rateLimitRule
  allowAdminRule
  blockAllRule
]

resource profile 'Microsoft.Cdn/profiles@2024-02-01' = {
  name: profileName
  location: 'global'
  tags: tags
  sku: {
    name: 'Standard_AzureFrontDoor'
  }
}

// WAF policy for the public/customer endpoint (ISP allowlist).
resource customerWafPolicy 'Microsoft.Network/FrontDoorWebApplicationFirewallPolicies@2024-02-01' = {
  name: 'wafcust${resourceToken}'
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
      rules: customerWafRules
    }
  }
}

// WAF policy for the admin endpoint (admin allowlist, or ISP fallback).
resource adminWafPolicy 'Microsoft.Network/FrontDoorWebApplicationFirewallPolicies@2024-02-01' = {
  name: 'wafadmin${resourceToken}'
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
      rules: adminWafRules
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

// Associate each WAF policy with its endpoint.
resource customerSecurityPolicy 'Microsoft.Cdn/profiles/securityPolicies@2024-02-01' = {
  parent: profile
  name: 'waf-customer-association'
  properties: {
    parameters: {
      type: 'WebApplicationFirewall'
      wafPolicy: {
        id: customerWafPolicy.id
      }
      associations: [
        {
          domains: [
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

resource adminSecurityPolicy 'Microsoft.Cdn/profiles/securityPolicies@2024-02-01' = {
  parent: profile
  name: 'waf-admin-association'
  properties: {
    parameters: {
      type: 'WebApplicationFirewall'
      wafPolicy: {
        id: adminWafPolicy.id
      }
      associations: [
        {
          domains: [
            {
              id: adminEndpoint.id
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
