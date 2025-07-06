# Overriding Features

The Overriding Features system allows individual chat apps to customize site-level feature configurations, providing fine-grained control over how features behave in different contexts while maintaining consistent defaults across the application.

## Overview

The feature override system provides:

- **Hierarchical Configuration**: Site-level defaults with chat app-specific overrides
- **Granular Control**: Individual chat apps can customize feature behavior
- **Access Control**: Fine-tuned user access rules per chat app
- **Fallback Logic**: Graceful handling when overrides are not specified
- **Security First**: Chat apps can only make features more restrictive, not less

## How It Works

### 1. Two-Level Architecture

The system operates with two configuration levels:

1. **Site Level** (`pika-config.ts`): Global defaults for all chat apps
2. **Chat App Level**: Individual chat app overrides

### 2. Resolution Logic

When determining feature availability for a user:

```typescript
// Simplified resolution flow
function resolveFeatureAccess(siteFeature, chatAppFeature, user) {
    // 1. If site level is disabled, feature is off for everyone
    if (!siteFeature.enabled) {
        return false;
    }

    // 2. If chat app has its own rules, use those (but only to restrict)
    if (chatAppFeature && hasCustomRules(chatAppFeature)) {
        return checkAccess(user, chatAppFeature);
    }

    // 3. Fall back to site level rules
    return checkAccess(user, siteFeature);
}
```

### 3. Override Principles

- **Site Level Controls Availability**: If a feature is disabled at the site level, chat apps cannot enable it
- **Chat Apps Can Only Restrict**: Chat apps can only disable enabled features, cannot enabled a feature not turned on at site level
- **Independent Rule Sets**: Chat apps can define their own access rules (userTypes, userRoles)
- **Graceful Fallback**: Missing overrides fall back to site-level configuration

## Supported Features

The following features support chat app-level overrides:

### 1. Traces Feature

```typescript
// Site level configuration
siteFeatures: {
    traces: {
        enabled: true,
        userTypes: ['internal-user'],
        detailedTraces: {
            enabled: true,
            userTypes: ['internal-user']
        }
    }
}

// Chat app override
features: {
    traces: {
        featureId: 'traces',
        enabled: true,
        userTypes: ['internal-user'],
        userRoles: ['developer'], // Additional restriction
        detailedTraces: {
            enabled: true,
            userTypes: ['internal-user'],
            userRoles: ['pika:content-admin'] // More restrictive
        }
    }
}
```

### 2. Verify Response Feature

```typescript
// Site level configuration
siteFeatures: {
    verifyResponse: {
        enabled: true,
        autoRepromptThreshold: 'c', // Accurate with unstated assumptions
        userTypes: ['internal-user', 'external-user']
    }
}

// Chat app override
features: {
    verifyResponse: {
        featureId: 'verifyResponse',
        enabled: true,
        autoRepromptThreshold: 'F', // More lenient (inaccurate with possibly made up content)
        userTypes: ['internal-user'] // More restrictive
    }
}
```

### 3. Chat Disclaimer Notice Feature

```typescript
// Site level configuration
siteFeatures: {
    chatDisclaimerNotice: {
        notice: "Default disclaimer for all chat apps."
    }
}

// Chat app override
features: {
    chatDisclaimerNotice: {
        featureId: 'chatDisclaimerNotice',
        notice: "Custom disclaimer specific to this chat app."
    }
}
```

## Configuration Patterns

### 1. Access Rules Override

Chat apps can define their own access rules:

```typescript
// Site level: Available to all internal users
siteFeatures: {
    traces: {
        enabled: true,
        userTypes: ['internal-user']
    }
}

// Chat app: Restrict to specific roles
features: {
    traces: {
        featureId: 'traces',
        enabled: true,
        userTypes: ['internal-user'],
        userRoles: ['developer', 'support-admin'],
        applyRulesAs: 'and' // Must be internal user AND have specific role
    }
}
```

### 2. Feature Disabling

Chat apps can disable features that are enabled at the site level:

```typescript
// Site level: Traces enabled globally
siteFeatures: {
    traces: {
        enabled: true,
        userTypes: ['internal-user']
    }
}

// Chat app: Disable traces for this specific app
features: {
    traces: {
        featureId: 'traces',
        enabled: false // Disable even though site level is enabled
    }
}
```

### 3. Parameter Customization

Some features allow parameter customization:

```typescript
// Site level: Conservative auto-reprompt threshold
siteFeatures: {
    verifyResponse: {
        enabled: true,
        autoRepromptThreshold: 'C' // Accurate with unstated assumptions
    }
}

// Chat app: More aggressive quality control
features: {
    verifyResponse: {
        featureId: 'verifyResponse',
        enabled: true,
        autoRepromptThreshold: 'B' // Accurate with stated assumptions
    }
}
```

## Implementation Details

### 1. Feature Resolution Function

The `resolveFeatureRules` function handles the override logic:

```typescript
export function resolveFeatureRules(siteFeature: AccessRules, appFeature?: AccessRules): AccessRules {
    // Site level controls whether feature can be used at all
    if (!siteFeature.enabled) {
        return {
            enabled: false,
            userTypes: siteFeature.userTypes,
            userRoles: siteFeature.userRoles,
            applyRulesAs: siteFeature.applyRulesAs ?? 'and'
        };
    }

    // Check if app provides its own rules
    if (appFeature && hasCustomRules(appFeature)) {
        return {
            enabled: appFeature.enabled !== false,
            userTypes: appFeature.userTypes,
            userRoles: appFeature.userRoles,
            applyRulesAs: appFeature.applyRulesAs ?? 'and'
        };
    }

    // Use site level rules
    return siteFeature;
}
```

### 2. Access Control Logic

The `checkUserAccessToFeature` function evaluates user permissions:

```typescript
export function checkUserAccessToFeature(user: AuthenticatedUser, feature: AccessRules): boolean {
    // If disabled, no access
    if (!feature.enabled) {
        return false;
    }

    // If no rules specified, allow all users
    if (!feature.userTypes && !feature.userRoles) {
        return true;
    }

    // Check user type and role access
    const userTypeMatches = feature.userTypes ? feature.userTypes.includes(user.userType) : true;
    const userRoleMatches = feature.userRoles ? user.roles?.some((role) => feature.userRoles.includes(role)) : true;

    // Apply combination logic
    return feature.applyRulesAs === 'or' ? userTypeMatches || userRoleMatches : userTypeMatches && userRoleMatches;
}
```

### 3. Feature Processing

Features are processed in the `getOverridableFeatures` function:

```typescript
export function getOverridableFeatures(chatApp: ChatApp, user: AuthenticatedUser): ChatAppOverridableFeatures {
    const result: ChatAppOverridableFeatures = {
        verifyResponse: { enabled: false },
        traces: { enabled: false, detailedTraces: false },
        chatDisclaimerNotice: undefined
    };

    // Process verify response feature
    const siteVerifyRule = siteFeatures?.verifyResponse || { enabled: false };
    const appVerifyRule = chatApp.features?.verifyResponse;
    const resolvedVerifyRules = resolveFeatureRules(siteVerifyRule, appVerifyRule);

    result.verifyResponse.enabled = checkUserAccessToFeature(user, resolvedVerifyRules);
    result.verifyResponse.autoRepromptThreshold = appVerifyRule?.autoRepromptThreshold ?? siteVerifyRule.autoRepromptThreshold;

    // Process traces feature
    const siteTracesRule = siteFeatures?.traces || { enabled: false };
    const appTracesRule = chatApp.features?.traces;
    const resolvedTracesRules = resolveFeatureRules(siteTracesRule, appTracesRule);

    result.traces.enabled = checkUserAccessToFeature(user, resolvedTracesRules);

    // Process disclaimer notice (no access control)
    result.chatDisclaimerNotice = siteFeatures?.chatDisclaimerNotice?.notice ?? chatApp.features?.chatDisclaimerNotice?.notice;

    return result;
}
```

## Best Practices

### 1. Start with Site-Level Defaults

```typescript
// Define sensible defaults at the site level
siteFeatures: {
    traces: {
        enabled: true,
        userTypes: ['internal-user'],
        detailedTraces: {
            enabled: true,
            userTypes: ['internal-user'],
            userRoles: ['pika:content-admin']
        }
    },
    verifyResponse: {
        enabled: true,
        autoRepromptThreshold: 'C', // Accurate with unstated assumptions
        userTypes: ['internal-user', 'external-user']
    }
}
```

### 2. Use Chat App Overrides Sparingly

Only override when necessary:

```typescript
// Good: Specific need for different behavior
features: {
    verifyResponse: {
        featureId: 'verifyResponse',
        enabled: true,
        autoRepromptThreshold: 'F', // Less strict for this app
        userTypes: ['external-user'] // Customer-facing app
    }
}

// Avoid: Unnecessary overrides that duplicate site settings
features: {
    verifyResponse: {
        featureId: 'verifyResponse',
        enabled: true,
        // Same threshold as site level - unnecessary override
        autoRepromptThreshold: 'C'
    }
}
```

### 3. Document Override Rationale

```typescript
// In your chat app definition
const criticalSystemApp: ChatApp = {
    chatAppId: 'critical-system',
    title: 'Critical System Support',
    // ... other properties
    features: {
        verifyResponse: {
            featureId: 'verifyResponse',
            enabled: true,
            // More aggressive verification for critical systems
            autoRepromptThreshold: 'B',
            userTypes: ['internal-user'] // Internal support only
        },
        traces: {
            featureId: 'traces',
            enabled: true,
            // Only senior support can see detailed traces for critical systems
            userTypes: ['internal-user'],
            userRoles: ['senior-support', 'pika:content-admin'],
            applyRulesAs: 'and'
        }
    }
};
```

## Common Patterns

### 1. Customer vs. Internal Chat Apps

```typescript
// Customer-facing chat app
const customerApp: ChatApp = {
    // ... other properties
    features: {
        traces: {
            featureId: 'traces',
            enabled: false // Hide traces from customers
        },
        verifyResponse: {
            featureId: 'verifyResponse',
            enabled: true,
            userTypes: ['external-user']
        }
    }
};

// Internal support chat app
const internalApp: ChatApp = {
    // ... other properties
    features: {
        traces: {
            featureId: 'traces',
            enabled: true,
            userTypes: ['internal-user'],
            detailedTraces: {
                enabled: true,
                userTypes: ['internal-user'],
                userRoles: ['pika:content-admin']
            }
        }
    }
};
```

### 2. Specialized App Requirements

```typescript
// High-accuracy requirement
const legalApp: ChatApp = {
    // ... other properties
    features: {
        verifyResponse: {
            featureId: 'verifyResponse',
            enabled: true,
            autoRepromptThreshold: 'B',
            userTypes: ['internal-user'],
            userRoles: ['legal-team']
        }
    }
};

// Development/testing app
const devApp: ChatApp = {
    // ... other properties
    features: {
        traces: {
            featureId: 'traces',
            enabled: true,
            userTypes: ['internal-user'],
            userRoles: ['developer'],
            detailedTraces: {
                enabled: true,
                userTypes: ['internal-user'],
                userRoles: ['developer']
            }
        }
    }
};
```

## Troubleshooting

### Common Issues

1. **Feature not working despite override**: Check that site level is enabled
2. **Overly restrictive access**: Verify that chat app override isn't too restrictive
3. **Unexpected behavior**: Ensure override logic follows the "restrict only" principle

### Debug Steps

1. **Check site configuration**: Verify feature is enabled at site level
2. **Review chat app override**: Ensure override configuration is correct
3. **Test user permissions**: Verify user has required userType/userRoles
4. **Use traces**: Enable traces to see feature resolution in action

## Example: Complete Override Setup

```typescript
// pika-config.ts
export const pikaConfig: PikaConfig = {
    siteFeatures: {
        traces: {
            enabled: true,
            userTypes: ['internal-user'],
            detailedTraces: {
                enabled: true,
                userTypes: ['internal-user'],
                userRoles: ['pika:content-admin']
            }
        },
        verifyResponse: {
            enabled: true,
            autoRepromptThreshold: 'C',
            userTypes: ['internal-user', 'external-user']
        },
        chatDisclaimerNotice: {
            notice: 'Default AI disclaimer for all chat applications.'
        }
    }
};

// Individual chat app with overrides
const specializedApp: ChatApp = {
    chatAppId: 'specialized-support',
    title: 'Specialized Support Chat',
    // ... other properties
    features: {
        traces: {
            featureId: 'traces',
            enabled: true,
            userTypes: ['internal-user'],
            userRoles: ['specialized-support'],
            detailedTraces: {
                enabled: true,
                userTypes: ['internal-user'],
                userRoles: ['specialized-support', 'pika:content-admin'],
                applyRulesAs: 'or'
            }
        },
        verifyResponse: {
            featureId: 'verifyResponse',
            enabled: true,
            autoRepromptThreshold: 'B',
            userTypes: ['internal-user']
        },
        chatDisclaimerNotice: {
            featureId: 'chatDisclaimerNotice',
            enabled: true,
            notice: 'This specialized support chat provides expert assistance. For urgent issues, contact our emergency support line.'
        }
    }
};
```

## Related Features

- **[Traces Feature](./traces-feature.md)**: Detailed documentation on traces configuration
- **[Verify Response Feature](./verify-response-feature.md)**: Complete guide to response verification
- **[Chat Disclaimer Notice Feature](./chat-disclaimer-notice-feature.md)**: Disclaimer configuration details
- **[Customization Guide](./customization.md)**: General site feature configuration

---

**Need more help?** Check the [Troubleshooting Guide](./troubleshooting.md) or review the [Authentication Guide](./authentication.md) for user type and role configuration.
