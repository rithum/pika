# Customization — Extension Points & Theme

This directory contains sync-protected customization files. All files here are **protected from `pika sync`** — your changes survive framework updates.

Two categories of customization live here: **extension-point hooks** (function overrides) and **theme configuration** (visual branding).

---

## Extension Points (v0.27.0)

Extension points are exported functions you can override to add deployment-specific behavior without editing synced framework files. Each has a no-op default — pika works correctly without any overrides.

| File | Export | Default | Purpose |
|------|--------|---------|---------|
| `site-admin.ts` | `isUserAllowedAdminAccess(user)` | delegates to `isUserSiteAdmin()` | Gate admin routes on custom criteria (e.g., provider check) |
| `additional-session-sources.ts` | `getAdditionalSessionSources(user, chatAppId)` | `[]` | Add 0..N custom session sources to the sidebar, each with its own loader, sidebar slots, and read-only predicate |
| `session-read-only.ts` | `isSessionReadOnly(session, user)` | `false` | Mark additional session types as read-only (cross-cutting; per-source rules go on the source descriptor) |
| `request-user-id-resolver.ts` | `resolveRequestUserId(requestedUserId, sessionUserId, ctx)` | `undefined` | Override the user id used by the message routes (e.g., honor a separate cookie for legacy actions) |
| `session-entity-extraction.ts` | `getSessionEntityValue(session)` | `session.entityId` | Extract entity/account ID from a session |
| `session-account-context.ts` | `transformSessionAccountContext(session, user)` | session unchanged | **Deprecated, no longer called.** Move per-session logic into `scopeSessionsToAccount` |
| `session-account-context.ts` | `scopeSessionsToAccount(sessions, user, chatAppId, viewingAnotherUser)` | sessions unchanged | Filter the session list a user sees |
| `session-account-context.ts` | `scopePinnedResultsToAccount(results, user, chatAppId)` | results unchanged | Filter pinned-session search results |
| `server-hooks.ts` | `transformCustomUserData(data, ctx)` | data unchanged | Transform customUserData before it reaches the converse Lambda |
| `server-hooks.ts` | `onAuthProviderCallback(event, provider)` | no-op | Run logic on OAuth provider callbacks |
| `server-hooks.ts` | `onBeforeAuth(event, pathName, user)` | `{ clearSession: false }` | Clear the session conditionally before auth proceeds |
| `chat-user-auth.ts` | `shouldBypassChatUserRoleMerge(user)` | `false` | Use token roles as source-of-truth; skip DDB role merge |
| `chat-user-auth.ts` | `rolesForChatUserRecord(roles)` | roles unchanged | Choose the roles persisted on the stored ChatUser record |
| `chat-user-auth.ts` | `mergeStoredRolesIntoSession(sessionRoles, storedRoles)` | `storedRoles \|\| sessionRoles` | Choose the roles the session carries after a periodic refresh |
| `chat-user-auth.ts` | `mergeChatUserCustomData(user, chatUser)` | `chatUser.customData \|\| user.customData` | Choose the customData the session carries after a periodic refresh |
| `chat-user-auth.ts` | `resolveChatUserAccountWriteBack(user, chatUser)` | `undefined` | Return customData to write back to the stored ChatUser record |
| `admin/site-admin-extensions.ts` | `customAdminPages` | `[]` | Append consumer pages to the Site Admin nav; each NavItem's `pageComponent` renders at its `/admin/<slug>` url |
| `message-visibility.ts` | `shouldRenderMessage(message)` | `true` | Hide messages from the rendered transcript (e.g. app-composed user turns) without removing them from the session |
| `chat-html-allowed-tags.ts` | `allowedCustomTags`, `allowedCustomAttrs` | `[]`, `{}` | Allow-list custom elements (and per-tag attributes) to survive the chat/trace HTML sanitizer, or lift a default ban such as `img`; on* handlers are always stripped |
| `trace-content-access.ts` | `mayReceiveTraceContent(user, tracesFeatureEnabled)` | `true` | Withhold trace content (system prompt, tool inputs and outputs) from some users: the trace route returns 403, message reads drop inline traces, and the live stream carries only label-only step frames. It doesn't cover `detailedTraces`, which stays a UI-only setting |

### Local development files

These files back the local-development overrides described in `apps/pika-chat/readme-dev.md`. All of them are refused inside ECS or Lambda.

| File | Export | Purpose |
|------|--------|---------|
| `local-api-route.ts` | `resolveApiRoute(isLocal, deployedBaseUrl, path, localBaseUrl?)` | Send chat API calls to a loopback `LOCAL_CHAT_API_BASE_URL`, unsigned; deployed calls stay SigV4-signed |
| `local-converse-route.ts` | `resolveLocalConverseRoute(isLocal, configuredUrl, localOverride?)` | Send converse calls to `LOCAL_CONVERSE_FUNCTION_URL` (loopback or a Lambda function URL) |
| `local-mock-auth-provider.ts` | default export `LocalMockAuthProvider` | Auth provider used when `PIKA_LOCAL_MOCK_AUTH=true` in local dev |
| `local-mock-user.ts` | `localMockUser(env)` | Build the mock user from `PIKA_LOCAL_MOCK_*` |

### How to override

1. Open the relevant file in this directory.
2. Replace the default function body with your implementation.
3. The framework will call your override automatically.

Example — require AzureAD provider for admin access:

```typescript
// site-admin.ts
export async function isUserAllowedAdminAccess(user: AuthenticatedUser<RecordOrUndef, RecordOrUndef>): Promise<boolean> {
    return isUserSiteAdmin(user) && user.authData?.provider === 'azuread';
}
```

### Signature stability

`test/custom/contract.test.ts` contains compile-time type assertions and runtime smoke tests for every hook. If a pika upgrade accidentally changes a hook's signature, this test fails before the breakage reaches your deployment.

---

## Theme Configuration

## Quick Start

1. **Copy the sample theme** and customize it:

```bash
cp sample-purple-theme.ts my-theme.ts
```

2. **Edit your theme file** with your brand colors:

```typescript
export const themeConfig: ThemeConfig = {
    name: 'My Company Theme',
    fontFamily: '"Inter", sans-serif',
    cssVariables: {
        light: {
            'primary': 'oklch(0.55 0.16 195)',  // Your brand color
            'primary-foreground': 'oklch(1 0 0)',
        },
        dark: {
            'primary': 'oklch(0.70 0.14 195)',
        }
    }
};
```

3. **Enable theming** in `pika-config.ts` and point to your theme:

```typescript
siteFeatures: {
    uiCustomization: {
        customTheme: {
            enabled: true,
            // Path to your theme (without .ts extension)
            themeConfigPath: 'src/lib/custom/my-theme'
        }
    }
}
```

4. **Run dev server** - changes auto-reload via HMR:

```bash
pnpm run dev
```

## Hooks

All hook files live in this directory and are protected from `pika sync`. Override the exported function in each file to customize behavior without touching synced framework files.

| File | Export | Description |
|---|---|---|
| `demo-mode-banner.ts` | `getDemoBannerComponent()` | render a top-of-page banner |
| `demo-mode-menu-item.ts` | `getDemoModeMenuItem()` | inject a menu item into the 4 user dropdowns |
| `polling-interval.ts` | `getUserRefreshIntervalMs(user)` | override the user-refresh polling cadence |
| `effective-user.ts` | `isInternalUser(user)` | override the internal-user predicate |
| `home-page-user.ts` | `resolveUserForHomeChatApps(user, event)` | transform the user passed to home-page chat-app filtering |
| `show-detailed-trace.ts` | `shouldShowDetailedTrace(user)` | gate the detailed-trace UI |
| `show-logout.ts` | `shouldShowLogout(user)` | gate the Logout menu item |

See also: `apps/pika-docs/src/content/docs/guides/customization/demo-mode-hooks.mdoc` for full docs.

## Files

- `sample-purple-theme.ts` - Sample theme to copy and customize

## Custom Assets (Icons, Images)

Place custom icons and images in:
```
apps/pika-chat/static/custom/assets/
```

This folder is protected from sync and files are served at `/custom/assets/`.

**Example - Custom header icon (single for both modes):**
```typescript
export const themeConfig: ThemeConfig = {
    chatAppHeaderIcon: '/custom/assets/my-logo.svg',
};
```

**Example - Separate icons for light/dark modes:**
```typescript
export const themeConfig: ThemeConfig = {
    chatAppHeaderIcon: {
        light: '/custom/assets/logo-dark.svg',   // Dark logo on light bg
        dark: '/custom/assets/logo-light.svg'    // Light logo on dark bg
    },
};
```

## Available Variables

### Core Semantic Colors
- `primary`, `primary-foreground` - Primary brand color
- `secondary`, `secondary-foreground` - Secondary actions
- `muted`, `muted-foreground` - Subtle backgrounds/text
- `accent`, `accent-foreground` - Highlights
- `destructive`, `destructive-foreground` - Errors/danger

### Extended Semantic Colors (Pika additions)
- `success`, `success-foreground`, `success-bg` - Success states
- `warning`, `warning-foreground`, `warning-bg` - Warning states
- `info`, `info-foreground`, `info-bg` - Informational
- `ai`, `ai-foreground`, `ai-bg` - AI/assistant actions
- `danger-bg` - Danger background

### UI Elements
- `background`, `foreground` - Page background/text
- `card`, `card-foreground` - Card elements
- `popover`, `popover-foreground` - Popovers/dropdowns
- `border`, `input`, `ring` - Borders and focus states
- `chat-app-icon` - Color of the AI icon in chat app header

### Sidebar
- `sidebar-background`, `sidebar-foreground`
- `sidebar-primary`, `sidebar-primary-foreground`
- `sidebar-accent`, `sidebar-accent-foreground`
- `sidebar-border`, `sidebar-ring`

## Color Format

Use **oklch** format for best results:

```
oklch(lightness chroma hue)
```

- **Lightness**: 0 (black) to 1 (white)
- **Chroma**: 0 (gray) to ~0.4 (vivid)
- **Hue**: 0-360 (color wheel angle)

Example: `oklch(0.55 0.16 142)` = medium-bright green

## Web Components

If you're building web components, access theme tokens:

```typescript
import { getThemeVariable, getPikaThemeTokens } from 'pika-shared/util/wc-utils';

// Single variable
const primary = getThemeVariable('primary');

// All semantic tokens
const tokens = getPikaThemeTokens();
```

## Need Help?

See `sample-purple-theme.ts` for a complete reference, or visit the documentation at https://pika.tools/guides/customization/theming
