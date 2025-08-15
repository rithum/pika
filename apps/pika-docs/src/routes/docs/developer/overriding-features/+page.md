---
title: Overriding Features
description: Imported from docs/developer/overriding-features.md
outline: [2, 3]
---

The Overriding Features system allows individual chat apps to customize site-level feature configurations, providing fine-grained control over how features behave in different contexts while maintaining consistent defaults across the application.

## Overview

The feature override system provides:

- **Hierarchical Configuration**: Site-level defaults with chat app-specific overrides
- **Granular Control**: Individual chat apps can customize feature behavior
- **Access Control**: Fine-tuned user access rules per chat app
- **Fallback Logic**: Graceful handling when overrides are not specified
- **Consistent Governance**: All features must be enabled at site level before chat apps can use them

## How It Works

### 1. Three-Level Architecture

The system operates with three configuration levels:

1. **Site Level** (`pika-config.ts`): Global feature enablement and defaults for all chat apps
2. **Chat App Level**: Individual chat app overrides (can only restrict site-level settings)
3. **Admin Override Level**: Administrative overrides (can completely replace chat app settings)

### 2. Resolution Logic

When determining feature availability for a user:

```js
// Simplified resolution flow
function resolveFeatureAccess(siteFeature, chatAppFeature, adminOverrideFeature, user) {
    // 1. If site level is disabled, feature is off for everyone
    if (!siteFeature || !siteFeature.enabled) {
        return false;
    }

    // 2. Admin override takes precedence over chat app configuration
    const effectiveFeature = adminOverrideFeature || chatAppFeature;

    // 3. If effective feature has its own rules, use those
    if (effectiveFeature && hasCustomRules(effectiveFeature)) {
        return checkAccess(user, effectiveFeature);
    }

    // 4. Fall back to site level rules
    return checkAccess(user, siteFeature);
}
```

### 3. Override Principles

- **Site Level Controls Availability**: All features must be enabled at site level first
- **Chat Apps Can Only Restrict**: Chat apps can disable or add restrictions to enabled features
- **Admin Overrides Replace Chat App**: Admin overrides completely replace chat app settings (when present)
- **Cannot Enable Disabled Features**: Neither chat apps nor admin overrides can enable features disabled at site level
- **Complete Override Required**: When overriding a feature, ALL settings for that feature must be provided
- **No Merging**: Overrides do NOT merge with lower levels - they completely replace them
- **Graceful Fallback**: Missing overrides fall back to the next level (Admin → Chat App → Site)

## Site-Level Feature Configuration

Before any chat app can use a feature, it must be configured at the site level in `pika-config.ts`:

```js
export const pikaConfig: PikaConfig = {
    // ... other configuration
    siteFeatures: {
        // All features must be configured here first
        traces: {
            featureId: 'traces',
            enabled: true,
            userTypes: ['internal-user'],
            detailedTraces: {
                enabled: true,
                userTypes: ['internal-user']
            }
        },
        verifyResponse: {
            featureId: 'verifyResponse',
            enabled: true,
            autoRepromptThreshold: 'C',
            userTypes: ['internal-user', 'external-user']
        },
        fileUpload: {
            featureId: 'fileUpload',
            enabled: true,
            mimeTypesAllowed: ['image/*', 'application/pdf', 'text/plain', '.docx']
        },
        suggestions: {
            featureId: 'suggestions',
            enabled: true,
            suggestions: [], // Empty means chat apps define their own
            maxToShow: 5,
            randomize: false,
            randomizeAfter: 0
        },
        promptInputFieldLabel: {
            featureId: 'promptInputFieldLabel',
            enabled: true,
            promptInputFieldLabel: 'Ready to chat'
        },
        uiCustomization: {
            featureId: 'uiCustomization',
            enabled: true,
            showUserRegionInLeftNav: false,
            showChatHistoryInStandaloneMode: true
        },
        chatDisclaimerNotice: {
            featureId: 'chatDisclaimerNotice',
            enabled: true,
            notice: 'This AI-powered chat is here to help, but it may not always be accurate.'
        },
        logout: {
            featureId: 'logout',
            enabled: true,
            userTypes: ['internal-user', 'external-user']
        }
    }
};
```

## Critical: Complete Override Requirement

**When a chat app overrides a feature, it must provide ALL configuration settings for that feature.**

### No Merging Behavior

Overrides at each level **completely replace** settings from lower levels - they do NOT merge:

```js
// WRONG: This override will LOSE the autoRepromptThreshold setting
// Site level
siteFeatures: {
    verifyResponse: {
        featureId: 'verifyResponse',
        enabled: true,
        autoRepromptThreshold: 'C',
        userTypes: ['internal-user', 'external-user']
    }
}

// Chat app override (INCOMPLETE - will lose autoRepromptThreshold!)
features: {
    verifyResponse: {
        featureId: 'verifyResponse',
        enabled: true,
        userTypes: ['internal-user']  // Missing autoRepromptThreshold!
    }
}
// Result: { enabled: true, userTypes: ['internal-user'], autoRepromptThreshold: undefined }
```

```js
// CORRECT: Complete override with all required settings
features: {
    verifyResponse: {
        featureId: 'verifyResponse',
        enabled: true,
        autoRepromptThreshold: 'C',  // Must explicitly include this
        userTypes: ['internal-user']  // The restriction we wanted
    }
}
// Result: { enabled: true, userTypes: ['internal-user'], autoRepromptThreshold: 'C' }
```

```js
// WRONG: Admin override will LOSE chat app settings
// Site level
siteFeatures: {
    verifyResponse: {
        enabled: true,
        autoRepromptThreshold: 'C',
        userTypes: ['internal-user', 'external-user']
    }
}

// Chat app level
features: {
    verifyResponse: {
        enabled: true,
        autoRepromptThreshold: 'B', // More strict
        userTypes: ['external-user'] // More restrictive
    }
}

// Admin override (INCOMPLETE - will lose autoRepromptThreshold!)
override: {
    features: {
        verifyResponse: {
            featureId: 'verifyResponse',
            enabled: true,
            userTypes: ['internal-user', 'external-user'] // Missing autoRepromptThreshold!
        }
    }
}
// Result: { enabled: true, userTypes: ['internal-user', 'external-user'], autoRepromptThreshold: undefined }
```

```js
// CORRECT: Complete admin override
override: {
    features: {
        verifyResponse: {
            featureId: 'verifyResponse',
            enabled: true,
            autoRepromptThreshold: 'F', // Admin chooses different threshold
            userTypes: ['internal-user', 'external-user'] // Admin allows broader access
        }
    }
}
// Result: { enabled: true, userTypes: ['internal-user', 'external-user'], autoRepromptThreshold: 'F' }
```

### Why This Design?

- **Predictable**: No surprising merging logic to debug
- **Explicit**: Chat apps have complete control over their configuration
- **Safe**: Prevents accidental inheritance of unwanted site-level settings

## Admin Override Capabilities

Administrative users with the `pika:site-admin` role can create overrides that completely replace chat app feature configurations. Admin overrides are managed through the Site Admin interface.

### Admin Override Rules

- **Complete Replacement**: Admin overrides completely replace chat app feature settings
- **Site-Level Gating**: Admin overrides cannot enable features disabled at the site level
- **Complete Configuration Required**: When overriding, ALL feature settings must be provided
- **Take Precedence**: Admin overrides take precedence over chat app settings when present

### Admin Override Example

```js
// Original chat app configuration
const chatApp: ChatApp = {
    chatAppId: 'customer-support',
    features: {
        verifyResponse: {
            featureId: 'verifyResponse',
            enabled: true,
            autoRepromptThreshold: 'C',
            userTypes: ['external-user']
        }
    }
};

// Admin creates override through Site Admin interface
// This gets stored as chatApp.override.features.verifyResponse
const adminOverride = {
    verifyResponse: {
        featureId: 'verifyResponse',
        enabled: true,
        autoRepromptThreshold: 'F', // More lenient than chat app
        userTypes: ['internal-user', 'external-user'] // Broader access than chat app
        // Complete override - admin must provide all settings
    }
};

// Result: Admin override completely replaces chat app settings
// Final config: { enabled: true, autoRepromptThreshold: 'F', userTypes: ['internal-user', 'external-user'] }
```

## Chat App Override Capabilities

The following features support chat app-level overrides:

### Features with Access Control (Can Override User Rules)

#### 1. Traces Feature

```js
// Site level configuration
siteFeatures: {
    traces: {
        featureId: 'traces',
        enabled: true,
        userTypes: ['internal-user'],
        detailedTraces: {
            enabled: true,
            userTypes: ['internal-user']
        }
    }
}

// Chat app override - can add more restrictions (MUST include all settings)
features: {
    traces: {
        featureId: 'traces',
        enabled: true,
        userTypes: ['internal-user'], // Keep from site level
        userRoles: ['developer'], // Additional restriction
        detailedTraces: {
            enabled: true,
            userTypes: ['internal-user'], // Keep from site level
            userRoles: ['pika:content-admin'] // More restrictive
        }
        // Complete configuration - must define both basic and detailed trace rules
    }
}
```

#### 2. Verify Response Feature

```js
// Site level configuration
siteFeatures: {
    verifyResponse: {
        featureId: 'verifyResponse',
        enabled: true,
        autoRepromptThreshold: 'C', // Accurate with unstated assumptions
        userTypes: ['internal-user', 'external-user']
    }
}

// Chat app override - can be more restrictive (MUST include all settings)
features: {
    verifyResponse: {
        featureId: 'verifyResponse',
        enabled: true,
        autoRepromptThreshold: 'F', // More lenient threshold
        userTypes: ['internal-user'] // More restrictive access
        // Complete configuration - includes all properties from site level
    }
}
```

#### 3. Logout Feature

```js
// Site level configuration
siteFeatures: {
    logout: {
        featureId: 'logout',
        enabled: true,
        userTypes: ['internal-user', 'external-user']
    }
}

// Chat app override
features: {
    logout: {
        featureId: 'logout',
        enabled: true,
        userTypes: ['internal-user'], // More restrictive
        menuItemTitle: 'Sign Out',
        dialogTitle: 'Confirm Sign Out',
        dialogDescription: 'Are you sure you want to sign out of this application?'
    }
}
```

### Features with Simple Configuration (Can Override Settings)

#### 4. File Upload Feature

```js
// Site level configuration
siteFeatures: {
    fileUpload: {
        featureId: 'fileUpload',
        enabled: true,
        mimeTypesAllowed: ['image/*', 'application/pdf', 'text/plain', '.docx']
    }
}

// Chat app override - can be more restrictive
features: {
    fileUpload: {
        featureId: 'fileUpload',
        enabled: true,
        mimeTypesAllowed: ['image/*'] // More restrictive than site
    }
}
```

#### 5. Suggestions Feature

```js
// Site level configuration
siteFeatures: {
    suggestions: {
        featureId: 'suggestions',
        enabled: true,
        suggestions: [], // Empty means chat apps define their own
        maxToShow: 5,
        randomize: false,
        randomizeAfter: 0
    }
}

// Chat app override - custom suggestions
features: {
    suggestions: {
        featureId: 'suggestions',
        enabled: true,
        suggestions: ['How can I track my order?', 'What are your return policies?'],
        maxToShow: 3, // More restrictive
        randomize: true
    }
}
```

#### 6. UI Customization Feature

```js
// Site level configuration
siteFeatures: {
    uiCustomization: {
        featureId: 'uiCustomization',
        enabled: true,
        showUserRegionInLeftNav: false,
        showChatHistoryInStandaloneMode: true
    }
}

// Chat app override
features: {
    uiCustomization: {
        featureId: 'uiCustomization',
        enabled: true,
        showUserRegionInLeftNav: true, // Different from site
        showChatHistoryInStandaloneMode: false // Different from site
    }
}
```

### Features with Text Configuration

#### 7. Prompt Input Field Label Feature

```js
// Site level configuration
siteFeatures: {
    promptInputFieldLabel: {
        featureId: 'promptInputFieldLabel',
        enabled: true,
        promptInputFieldLabel: 'Ready to chat'
    }
}

// Chat app override - custom label
features: {
    promptInputFieldLabel: {
        featureId: 'promptInputFieldLabel',
        enabled: true,
        promptInputFieldLabel: 'Ask me about our products...'
    }
}
```

#### 8. Chat Disclaimer Notice Feature

```js
// Site level configuration
siteFeatures: {
    chatDisclaimerNotice: {
        featureId: 'chatDisclaimerNotice',
        enabled: true,
        notice: "This AI-powered chat is here to help, but it may not always be accurate."
    }
}

// Chat app override - custom disclaimer
features: {
    chatDisclaimerNotice: {
        featureId: 'chatDisclaimerNotice',
        enabled: true,
        notice: "This customer service chat is powered by AI. For account-specific issues, please contact human support."
    }
}
```

#### 9. User Data Override Feature

```js
// Site level configuration (enable the feature)
siteFeatures: {
    userDataOverrides: {
        enabled: true
    }
}

// Chat app override - can only disable this feature per app
features: {
    userDataOverride: {
        featureId: 'userDataOverride',
        enabled: false // Disable for this chat app
    }
}
```

Notes:

- Chat apps can only disable this feature. Site-level enablement and options are defined in `pika-config.ts`.
- When overriding a feature, you must provide a complete configuration for that feature. For `userDataOverride`, the only setting is `enabled`.
- See site-level options in the Customization Guide (User Data Override Configuration).

## Configuration Patterns

### 1. Access Rules Override

Chat apps can define more restrictive access rules:

```js
// Site level: Available to all internal users
siteFeatures: {
    traces: {
        featureId: 'traces',
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

```js
// Site level: Traces enabled globally
siteFeatures: {
    traces: {
        featureId: 'traces',
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

```js
// Site level: Conservative auto-reprompt threshold
siteFeatures: {
    verifyResponse: {
        featureId: 'verifyResponse',
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

## Admin UI Experience

The site admin interface provides clear feedback about feature configuration:

### Status Indicators

- **Site: Enabled** - Feature is available for use
- **Site: Disabled** - Feature is not available (chat apps cannot enable)
- **Site: Not Configured** - Feature needs to be configured at site level

### Validation Messages

- **Not configured at site level** - Add to `pika-config.ts`
- **Disabled at site level** - Cannot be enabled by chat apps
- **Chat app has this enabled but site level doesn't allow it** - Configuration conflict

### Smart Controls

- **Disabled checkboxes** when features cannot be enabled
- **Visual warnings** for invalid configurations
- **Helpful tooltips** explaining restrictions

## Best Practices

### 1. Start with Site-Level Defaults

```js
// Define sensible defaults at the site level
siteFeatures: {
    traces: {
        featureId: 'traces',
        enabled: true,
        userTypes: ['internal-user'],
        detailedTraces: {
            enabled: true,
            userTypes: ['internal-user'],
            userRoles: ['pika:content-admin']
        }
    },
    fileUpload: {
        featureId: 'fileUpload',
        enabled: true,
        mimeTypesAllowed: ['image/*', 'application/pdf'] // Conservative defaults
    }
}
```

### 2. Use Chat App Overrides Sparingly

Only override when necessary for specific use cases:

```js
// Only override when you need different behavior
features: {
    fileUpload: {
        featureId: 'fileUpload',
        enabled: true,
        mimeTypesAllowed: ['image/*'] // Customer service only needs images
        // Complete override - must include all required properties
    }
}
```

### 3. Always Provide Complete Configurations

When overriding a feature, include ALL properties that the feature supports:

```js
// BAD: Incomplete override loses site-level settings
features: {
    verifyResponse: {
        featureId: 'verifyResponse',
        enabled: true,
        userTypes: ['internal-user'] // Missing autoRepromptThreshold!
    }
}

// GOOD: Complete override preserves all necessary settings
features: {
    verifyResponse: {
        featureId: 'verifyResponse',
        enabled: true,
        autoRepromptThreshold: 'C', // Explicitly include from site level
        userTypes: ['internal-user'] // The restriction we want
    }
}
```

### 4. Use Admin Overrides for Temporary Changes

Admin overrides are perfect for:

- Emergency access control changes
- Temporary feature testing
- Customer-specific configurations
- Debugging and troubleshooting

### 5. Test Your Configuration

- Verify features work as expected after configuration changes
- Test with different user types and roles
- Use the admin interface to validate your settings
- Check that overridden features include all expected properties
- Test both chat app and admin override scenarios

## Troubleshooting

### Common Issues

1. **Feature not showing in admin UI**: Check if it's enabled in `pika-config.ts`
2. **Cannot enable feature**: Verify site-level configuration allows it
3. **Access denied for users**: Review userTypes and userRoles settings
4. **Configuration conflicts**: Use admin UI warnings to identify issues
5. **Feature settings missing after override**: Incomplete override lost lower-level settings
6. **Chat app settings ignored**: Check if admin override is present and taking precedence
7. **Admin override not working**: Verify admin has `pika:site-admin` role

### Quick Fixes

```js
// Problem: Feature disabled everywhere
siteFeatures: {
    myFeature: {
        featureId: 'myFeature',
        enabled: false //  This disables for all chat apps
    }
}

// Solution: Enable at site level
siteFeatures: {
    myFeature: {
        featureId: 'myFeature',
        enabled: true //  Now chat apps can use it
    }
}

// Problem: Incomplete override loses settings
features: {
    verifyResponse: {
        featureId: 'verifyResponse',
        enabled: true,
        userTypes: ['internal-user'] // Missing autoRepromptThreshold
    }
}

// Solution: Include all properties in override
features: {
    verifyResponse: {
        featureId: 'verifyResponse',
        enabled: true,
        autoRepromptThreshold: 'C', // Explicitly include all settings
        userTypes: ['internal-user']
    }
}

// Problem: Chat app settings being ignored
// Check if admin override exists and is taking precedence
chatApp.override?.features?.verifyResponse // If this exists, it replaces chat app settings

// Solution: Either remove admin override or update it with desired settings
// Remove admin override to restore chat app settings
delete chatApp.override.features.verifyResponse;

// OR update admin override with complete configuration
chatApp.override.features.verifyResponse = {
    featureId: 'verifyResponse',
    enabled: true,
    autoRepromptThreshold: 'C', // Complete admin override
    userTypes: ['internal-user']
};
```

This system provides a clear hierarchy (Site → Chat App → Admin Override → User) with strong governance and flexibility where needed.
