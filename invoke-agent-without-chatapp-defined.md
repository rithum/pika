# Invoke Agent Without Chat App Feature Plan

## Overview

This feature enables programmatic invocation of agents directly via the converse lambda function URL without requiring a chat app context. This allows developers to define agents and tools using pika-serverless or CloudFormation custom resources and invoke them directly for headless AI interactions.

## Current Architecture Analysis

### How It Works Today

The converse lambda function currently requires:

1. **`chatAppId`** - Required parameter (line 220-223 in `converse/index.ts`)
2. **`agentId`** - Required parameter (line 215-218)
3. **Chat Session Management** - All interactions are tied to chat sessions via `ensureChatSession()`
4. **UI Features** - Chat app provides feature configurations like file upload, suggestions, etc.

### Key Dependencies Identified

1. **`ensureChatSession` function** - Requires both `agentId` and `chatAppId` parameters
2. **Chat app feature configuration** - Features like `verifyResponse`, `instructionAugmentation`, etc.
3. **Session management** - All messages are stored in chat sessions linked to chat apps
4. **UI-specific logic** - Suggestions, file upload settings, etc.

### Core Agent Invocation Logic

The actual agent invocation happens in `invokeAgentToGetAnswer()` which requires:

- Chat session (for context and message storage)
- Agent and tools data
- Feature configurations
- User authentication

## Proposed Solution

### Option 1: Agent-Only Mode (Recommended)

Create a new mode that bypasses chat app requirements entirely:

#### New Request Type: `DirectAgentInvokeRequest`

```typescript
export interface DirectAgentInvokeRequest {
    mode: 'direct-agent-invoke';
    message: string;
    agentId: string;
    userId: string;
    sessionId?: string; // Optional - create ephemeral if not provided
    features?: Partial<ChatAppOverridableFeaturesForConverseFn>; // Optional minimal features
    files?: ChatMessageFile[]; // Optional file support
}
```

#### Implementation Changes

1. **Modify converse handler** to detect direct invocation mode
2. **Create virtual/ephemeral chat session** when `chatAppId` is not provided
3. **Use minimal default features** when chat app features are not available
4. **Bypass UI-specific validations** for direct mode

### Option 2: Virtual Chat App (Alternative)

Create a virtual/default chat app concept for agent-only invocations:

#### Virtual Chat App Creation

```typescript
const createVirtualChatApp = (agentId: string): ChatApp => ({
    chatAppId: `virtual-${agentId}`,
    title: 'Direct Agent Invocation',
    description: 'Virtual chat app for direct agent invocation',
    agentId,
    enabled: true,
    modesSupported: ['programmatic'],
    userTypes: ['internal-user'],
    features: {
        // Minimal default features
        verifyResponse: { enabled: false }
    }
});
```

## Detailed Implementation Plan

### Phase 1: Core Infrastructure Changes

#### 1.1 Update Request Types

**File**: `packages/shared/src/types/chatbot/chatbot-types.ts`

- Add `DirectAgentInvokeRequest` interface
- Modify `ConverseRequest` to be a union type or add mode discrimination

#### 1.2 Modify Converse Handler

**File**: `services/pika/src/lambda/converse/index.ts`

- Add detection for direct invocation mode
- Make `chatAppId` conditionally required based on mode
- Create ephemeral session handling

```typescript
// Around line 220-223, replace:
if (!converseRequest.chatAppId) {
    console.error('Missing chatAppId in request');
    throw new HttpStatusError('chatAppId is required', 400);
}

// With:
const isDirectMode = 'mode' in converseRequest && converseRequest.mode === 'direct-agent-invoke';
if (!isDirectMode && !converseRequest.chatAppId) {
    console.error('Missing chatAppId in request');
    throw new HttpStatusError('chatAppId is required for chat app mode', 400);
}
```

#### 1.3 Update Chat Session Logic

**File**: `services/pika/src/lib/chat-apis.ts`

- Modify `ensureChatSession` signature to accept optional `chatAppId`
- Add mode detection and synthetic `chatAppId` generation
- Update function signature and implementation:

```typescript
export async function ensureChatSession(
    user: ChatUser<RecordOrUndef>,
    requestData: BaseRequestData & { mode?: ConverseRequestMode },
    agentId: string,
    chatAppId: string | undefined, // NOW OPTIONAL
    simpleUser: SimpleAuthenticatedUser<RecordOrUndef>
): Promise<[ChatSession<RecordOrUndef>, boolean]> {
    // Determine mode and effective chatAppId
    const mode = requestData.mode || (chatAppId ? 'chat-app' : 'direct-agent-invoke');
    const effectiveChatAppId = mode === 'direct-agent-invoke' ? `direct-agent-${agentId}` : chatAppId!;

    // Rest of function uses effectiveChatAppId instead of chatAppId
    // ...
}
```

### Phase 2: Virtual Session Management

#### 2.1 Synthetic ChatAppId Strategy

For direct-agent-invoke sessions:

- Generate synthetic `chatAppId` using pattern: `direct-agent-${agentId}`
- Keep `chatAppId` field required in database (maintains existing constraints)
- Frontend filtering by actual chatAppId naturally excludes direct sessions
- Admin functions can access all sessions including direct ones

**Key Implementation Changes:**

```typescript
// In ensureChatSession - determine effective chatAppId
const effectiveChatAppId = mode === 'direct-agent-invoke' ? `direct-agent-${agentId}` : chatAppId!;

// Use effectiveChatAppId for session creation
chatSession = await createChatSession({
    userId: user.userId,
    chatAppId: effectiveChatAppId, // Synthetic for direct mode
    agentId
    // ... rest of session data
});
```

#### 2.2 Database and Query Implications

**No Schema Changes Required:**

- `chatAppId` remains required in `ChatSession` interface
- GSI `user-chat-app-index` continues to work efficiently
- All existing queries function without modification

**Session Identification Patterns:**

- **Chat App Sessions**: `chatAppId = "weather-app"` (actual chat app ID)
- **Direct Sessions**: `chatAppId = "direct-agent-weather-agent"` (synthetic)

**Query Behavior:**

```typescript
// Frontend: Gets only actual chat app sessions
GET /api/chat/conversations/{chatAppId}
→ Uses getSessionsByUserIdAndChatAppId(userId, "weather-app")
→ Won't return direct sessions (different chatAppId)

// Admin: Gets ALL sessions including direct ones
GET /api/chat/conversations
→ Uses getUserSessionsByUserId(userId)
→ Returns both chat app and direct sessions

// Direct session filtering (if needed):
const directSessions = allSessions.filter(s =>
    s.chatAppId.startsWith('direct-agent-')
);
```

#### 2.3 Default Feature Set

Define minimal default features for direct invocations:

```typescript
const DEFAULT_DIRECT_INVOKE_FEATURES: ChatAppOverridableFeaturesForConverseFn = {
    verifyResponse: { enabled: false },
    instructionAugmentation: { enabled: false },
    tags: { tagsEnabled: [] }
};
```

### Phase 3: Enhanced Direct Invocation Support

#### 3.1 Stateless Mode

Add option for completely stateless invocations:

- No session creation/storage
- No message persistence
- Just agent invoke and return response
- Useful for simple API-style agent calls

#### 3.2 Conversation History Support

For direct mode with sessions:

- Allow passing conversation history directly in request
- Support session resumption with `sessionId`
- Enable multi-turn conversations in direct mode

### Phase 4: Documentation and Examples

#### 4.1 Update Serverless Plugin Docs

**File**: `packages/pika-serverless/README.md`
Add examples for direct agent invocation setup

#### 4.2 Create Direct Invocation Examples

Create examples showing:

- Agent-only definition with pika-serverless
- Direct lambda invocation via HTTP
- Conversation management in direct mode

## API Design

### Direct Invocation Request

```json
{
    "mode": "direct-agent-invoke",
    "message": "What's the weather in San Francisco?",
    "agentId": "weather-agent-prod",
    "userId": "api-user-123",
    "sessionId": "optional-session-id",
    "features": {
        "instructionAugmentation": { "enabled": true }
    },
    "files": []
}
```

### Response Format

Same as current chat app mode - streaming response with agent answer, traces, etc.

## Backwards Compatibility

- **Full backwards compatibility** - existing chat app mode unchanged
- **No breaking changes** to current APIs
- **Additive only** - new mode adds functionality without removing existing

## Benefits

1. **Simplifies Setup** - No need to define chat apps for simple agent invocations
2. **Programmatic Integration** - Easier to integrate with existing systems/APIs
3. **Reduced Overhead** - Minimal configuration for agent-only use cases
4. **Flexible Deployment** - Can use agents defined via pika-serverless or CDK without chat app UI

## Testing Strategy

### Unit Tests

- Test direct mode request validation
- Test ephemeral session creation
- Test feature defaults

### Integration Tests

- End-to-end direct agent invocation
- Session management in direct mode
- Backwards compatibility with chat app mode

### Manual Testing

- Define agent with pika-serverless (no chat app)
- Invoke via lambda function URL directly
- Verify response format and functionality

## Migration Path for Engineer's Use Case

1. **Current Setup**: Engineer has agent + tools defined via pika-serverless
2. **After Implementation**: Remove chat app definition from serverless.yml
3. **New Request Format**: Use `DirectAgentInvokeRequest` when calling lambda URL
4. **Benefits**: Cleaner setup, no unnecessary chat app overhead

## Implementation Timeline

1. **Phase 1** (Core Changes): 2-3 days
2. **Phase 2** (Session Management): 1-2 days
3. **Phase 3** (Enhanced Features): 2-3 days
4. **Phase 4** (Documentation): 1 day

**Total Estimated Effort**: 6-9 days

## Risk Assessment

**Low Risk** - Additive changes only, full backwards compatibility maintained.

**Potential Issues**:

- Session cleanup for ephemeral sessions
- Feature configuration edge cases
- Authentication in direct mode

**Mitigation**:

- Thorough testing of both modes
- Clear documentation of feature differences
- Gradual rollout with feature flags if needed

## Rationale: Why Synthetic ChatAppId vs Alternatives

### ✅ **Chosen Approach: Synthetic ChatAppId**

- **Pros**: No schema changes, natural frontend filtering, maintains all constraints, admin visibility
- **Cons**: Synthetic IDs may look unusual in direct inspection
- **Decision**: Clean implementation with minimal risk

### ❌ **Alternative 1: Optional ChatAppId**

- **Pros**: Most "correct" semantically
- **Cons**: Requires schema changes, breaks GSI, complex query updates, null handling everywhere
- **Decision**: Too much disruption for existing functionality

### ❌ **Alternative 2: Separate Direct Sessions Table**

- **Pros**: Complete separation of concerns
- **Cons**: Duplicate schema, complex admin queries, breaks unified session view
- **Decision**: Over-engineering for the use case

The synthetic ChatAppId approach provides the perfect balance: **minimal code changes, zero schema changes, natural behavior for all existing use cases, and clean separation for the new direct invocation feature**.
