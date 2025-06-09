# Auth Redesign Strategy

## Current Problem

The current Auth.js implementation in `auth2.ts` mixes standard OAuth handling with complex business logic in the JWT/session callbacks. This creates maintenance issues and tight coupling between authentication and business operations.

## Custom vs Standard Components

### Standard OAuth Parts (Keep with Auth.js)
- OIDC/OAuth2 flow with PKCE
- Basic token management (access/refresh tokens)  
- Session handling via Auth.js
- Token refresh logic

### Custom Business Logic (Extract from Auth.js)
- Platform API calls (`getUserDataFromServer`)
- Chat database user replication (`getChatUser`/`createChatUser`) 
- Complex `AuthData` object construction
- User data merging and feature management
- Large access token storage in separate encrypted cookies

## Access Token Storage Strategy

**Key Finding**: Access tokens are too large for single cookie storage.

**Current Working Pattern** (from old `auth.ts`):
- User data: `AUTHENTICATED_USER_COOKIE_NAME` (encrypted)
- Access token: `AUTHENTICATED_USER_ACCESS_TOKEN_COOKIE_NAME` (encrypted, separate)
- Comment: "The access token is too big to fit on the one cookie"

**Decision**: Continue using separate encrypted cookies, don't store large tokens in Auth.js session.

## Redesign Strategy

### Phase 1: Simplify Auth.js to Core OAuth Only
**Goal**: Make Auth.js handle just the OAuth flow and basic profile data

**Changes to `auth2.ts`**:
- Strip JWT callback down to storing only basic OAuth tokens and profile
- Remove platform API calls from auth flow  
- Remove chat database operations from auth callbacks
- Remove complex `AuthData` object construction
- Let Auth.js handle token refresh automatically for its own tokens

### Phase 2: Post-Authentication Middleware in hooks.server.ts
**Goal**: Handle all custom business logic after successful OAuth completion

**New Flow in `hooks.server.ts`**:
```typescript
// After Auth.js completes OAuth
if (session?.user && !event.locals.userData) {
  // Check if we have cached user data in encrypted cookie
  const cachedUserData = decryptUserDataFromCookie(event.cookies);
  
  if (cachedUserData && !isStale(cachedUserData)) {
    // Use cached data
    event.locals.userData = cachedUserData;
    event.locals.accessToken = getAccessTokenFromCookie(event.cookies);
  } else {
    // Fetch fresh data from platform APIs
    const platformUserData = await getUserDataFromServer(session.accessToken, ...);
    const chatUser = await ensureChatUser(platformUserData);
    
    // Combine and cache
    const completeUserData = { ...platformUserData, features: chatUser.features };
    encryptUserDataToCookie(event.cookies, completeUserData);
    encryptAccessTokenToCookie(event.cookies, session.accessToken);
    
    event.locals.userData = completeUserData;
    event.locals.accessToken = session.accessToken;
  }
}
```

### Phase 3: Simplified Access Everywhere
**Benefits of using `event.locals`**:
- `+layout.server.ts`: Just return `event.locals.userData`
- Server routes: Just use `event.locals.userData` and `event.locals.accessToken`  
- Client AppState: Gets user data from layout load function
- No need for cookie utilities in individual routes

## File Structure

### New Files to Create
- `lib/server/userDataManager.ts` - Platform API integration
- `lib/server/chatUserManager.ts` - Chat DB operations  
- `lib/server/encryptedCookies.ts` - Cookie encrypt/decrypt functions

### Files to Modify
- `auth2.ts` - Simplified to core OAuth only
- `hooks.server.ts` - Add post-auth middleware that populates `event.locals`
- `+layout.server.ts` - Return `event.locals.userData` instead of complex session handling

### Files to Reference  
- `auth.ts` (old working implementation) - Cookie encryption patterns
- `hooks.server.ts.orig` - Token refresh and cookie handling patterns

## Implementation Requirements

### 1. User Data Access
After authentication, use access token to call platform APIs and save encrypted user data in cookie. Make user information accessible in client app via AppState.

### 2. Chat Database Replication  
Server-side: Ensure user exists in separate chat database and get user features.

### 3. Server-Side Token Access
Server routes need access to user's access token and information from cookies while user is logged in.

## Key Architectural Benefits

1. **Separation of Concerns**: OAuth vs Business Logic
2. **Performance**: User data cached in encrypted cookies, no repeated API calls  
3. **Maintainability**: Each component has single responsibility
4. **Flexibility**: Can swap OAuth providers without changing business logic
5. **Security**: User data encrypted at rest in cookies
6. **Simplicity**: Single point of user data management in hooks

## Cookie Strategy

**Continue proven pattern from old implementation**:
- `AUTHENTICATED_USER_COOKIE_NAME` - Encrypted user data
- `AUTHENTICATED_USER_ACCESS_TOKEN_COOKIE_NAME` - Encrypted access token (separate due to size)
- Use existing encryption utilities from old `auth.ts`

## Next Steps

1. Create new utility files (`userDataManager.ts`, `chatUserManager.ts`, `encryptedCookies.ts`)
2. Simplify `auth2.ts` to core OAuth only
3. Implement post-auth middleware in `hooks.server.ts`  
4. Update `+layout.server.ts` to use `event.locals`
5. Test and validate the new flow

## Migration Notes

- Keep Auth.js for OAuth complexity handling
- Reuse proven cookie encryption patterns  
- Maintain backward compatibility during transition
- Preserve existing security measures
