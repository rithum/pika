# Architecture

## Concepts

### Core

### ChatSession
A single conversation thread, typically created by a user, where each message in the conversation thread alternates by turns: the user asks a question, then it's the assistant's turn who responds, etc. A ChatSession contains metadata such as sessionId, userId, agentId, agentAliasId, identityId, title, and various tracking information like costs and token usage.

### ChatMessage
A message from either the user or the assistant within a chat session. Each message contains the content, source (user or assistant), timestamp, and when coming from the assistant, may include usage statistics, execution duration, and trace information from the underlying model.

### Turn
A complete interaction cycle consisting of a user message and the corresponding assistant response. Each turn represents one question-answer exchange in the conversation flow. The turn concept helps organize the back-and-forth nature of the conversation and is used to track the state and progression of the dialogue.

### Assistant
The LLM-based bedrock agent who answers questions from the user. In this system, it's implemented using AWS Bedrock with models like Anthropic Claude. The assistant processes user messages, generates responses, and can track various metrics about its performance.

### Technical

### EnhancedResponseStream
A specialized stream used to handle the real-time streaming of assistant responses back to the user. This allows for progressive rendering of responses as they're being generated instead of waiting for the complete answer.

### SessionAttributes
Additional metadata associated with a chat session, including information about the user (firstName, lastName), their company (companyId, companyType), and other context like timezone.

### ChatMessageUsage
Tracking information about token consumption and costs associated with each message. This includes inputTokens, outputTokens, inputCost, outputCost, and totalCost, providing transparency about resource utilization.

### ModelInvocation
The process of calling the underlying large language model (like Claude) through the Bedrock service. Each invocation includes input formatting, parameter settings, and processing of the response, along with collection of usage metrics.

## File Organization

### Project Structure

```
pika/
├── services/
│   └── chatbot/
│       ├── docs/                           # Documentation
│       ├── src/
│       │   ├── api/                        # API endpoints
│       │   │   ├── chatbot/
│       │   │   │   └── index.ts
│       │   │   └── suggestions/
│       │   │       └── index.ts
│       │   ├── lib/                        # Core library functions
│       │   │   ├── bedrock-agent.ts
│       │   │   ├── server-apis.ts
│       │   │   ├── chat-ddb.ts
│       │   │   ├── utils.ts
│       │   │   └── bedrock-types.ts
│       │   └── lambda/                     # Lambda functions
│       │       ├── converse/
│       │       │   └── EnhancedResponseStream.ts
│       │       ├── weather/
│       │       └── index.ts
│       └── lib/                            # Infrastructure
│           └── stacks/
│               └── chatbot-stack.ts
└── packages/
    └── shared/
        └── src/
            └── types/                      # Shared type definitions
                └── chatbot/
                    ├── chatbot-types.ts
                    └── bedrock.ts
```

### Key Files and Their Purpose

| File | Description |
|------|-------------|
| [**chatbot-stack.ts**](../lib/stacks/chatbot-stack.ts) | AWS CDK infrastructure stack defining tables, functions, API routes, and Bedrock configuration |
| [**chatbot-types.ts**](../../../packages/shared/src/types/chatbot/chatbot-types.ts) | Core type definitions used throughout the application |
| [**bedrock.ts**](../../../packages/shared/src/types/chatbot/bedrock.ts) | Type definitions for AWS Bedrock service integration |
| [**api/chatbot/index.ts**](../src/api/chatbot/index.ts) | API endpoints for chat messages, sessions, and title updates |
| [**api/suggestions/index.ts**](../src/api/suggestions/index.ts) | API for retrieving suggested questions for the chatbot |
| [**lib/bedrock-agent.ts**](../src/lib/bedrock-agent.ts) | Functions for interacting with AWS Bedrock agent |
| [**lib/server-apis.ts**](../src/lib/server-apis.ts) | Server-side API functions for chat data operations |
| [**lib/chat-ddb.ts**](../src/lib/chat-ddb.ts) | Database operations using DynamoDB |
| [**lib/utils.ts**](../src/lib/utils.ts) | Utility functions used throughout the application |
| [**lib/bedrock-types.ts**](../src/lib/bedrock-types.ts) | Types specific to Bedrock integration |
| [**lambda/converse/EnhancedResponseStream.ts**](../src/lambda/converse/EnhancedResponseStream.ts) | Streaming functionality for real-time responses |
| [**lambda/index.ts**](../src/lambda/index.ts) | Lambda function entry point for handling routes |
| [**lambda/weather/**](../src/lambda/weather) | Weather-related Lambda functions |

# Flow of Control

## Block Diagram

```
Client Browser
┌───────────────────────────────────────────────────────────┐
│                                                           │
│  ┌─────────────┐                   ┌─────────────────┐    │
│  │     UI      │◄───────────────►  │ Response Stream │    │
│  └──────┬──────┘                   └──────────┬──────┘    │
│         │                                     │           │
└─────────┼─────────────────────────────────────┼───────────┘
          │                                     ▲
          │   API Calls                         │
          ▼                                     │
┌───────────────────────────────────────────────┼───────────┐
│                   AWS Cloud                   │           │
│                                               │           │
│  ┌─────────────────────────────────────────┐  │           │
│  │             API Gateway                 │  │           │
│  │                                         │  │           │
│  │  ┌─────────┐ ┌────────┐ ┌────────────┐  │  │           │
│  │  │  GET    │ │  GET   │ │    POST    │  │  │           │
│  │  │sessions │ │messages│ │   message  │  │  │           │
│  │  └────┬────┘ └───┬────┘ └─────┬──────┘  │  │           │
│  └───────┼──────────┼────────────┼─────────┘  │           │
│          │          │            │            │           │
│          │          │            │            │           │
│          ▼          ▼            ▼            │           │
│  ┌───────────────────────────────────────┐    │           │
│  │             DynamoDB                  │    │           │
│  │                                       │    │           │
│  │  ┌─────────┐ ┌────────┐ ┌─────────┐   │    │           │
│  │  │ Session │ │Message │ │  User   │   │    │           │
│  │  │  Table  │ │ Table  │ │  Table  │   │    │           │
│  │  └─────────┘ └────────┘ └─────────┘   │    │           │
│  └───────┬───────────┬────────┬──────────┘    │           │
│          │           │        │               │           │
│          │           │        │               │           │
│  ┌───────▼───────────▼────────▼─────────┐     │           │
│  │        Lambda Function URL           │     │           │
│  │                                      │     │           │
│  │  ┌─────────────┐ ┌───────────────┐   │     │           │
│  │  │  Converse   │ │ EnhancedStream│   │     │           │
│  │  │  Function   ├─►    Handler    ├───┼─────┘           │
│  │  └──────┬──────┘ └───────────────┘   │                 │
│  └─────────┼────────────────────────────┘                 │
│            │                                              │
│            ▼                                              │
│  ┌─────────────────────────────────┐                      │
│  │         AWS Bedrock             │                      │
│  │                                 │                      │
│  │  ┌─────────┐    ┌───────────┐   │                      │
│  │  │ Bedrock │    │   Model   │   │                      │
│  │  │  Agent  │◄──►│Invocation │   │                      │
│  │  └─────────┘    └───────────┘   │                      │
│  └─────────────────────────────────┘                      │
│                                                           │
└───────────────────────────────────────────────────────────┘
```
## Main Interaction Flow
```mermaid
sequenceDiagram
    participant Browser as Client Browser
    participant API as API Gateway
    participant Lambda as Lambda Function URL
    participant Bedrock as Bedrock Agent
    participant DDB as DynamoDB

    Note over Browser: User visits chat page
    
    %% Step 1: Getting existing sessions
    Browser->>API: GET /api/chat/conversations
    API->>DDB: Query user's chat sessions
    DDB-->>API: Return sessions list
    API-->>Browser: Display available sessions
    
    %% Step 2: Optional - Getting suggestions
    Browser->>API: GET /api/chat/suggestions
    API-->>Browser: Return list of suggested questions
    
    %% Step 3: User selects a session
    Note over Browser: User selects existing session
    Browser->>API: GET /api/chat/{sessionId}/messages
    API->>DDB: Query messages for session
    DDB-->>API: Return message history
    API-->>Browser: Display conversation history
    
    %% Step 4: User asks a question
    Note over Browser: User sends a message
    Browser->>Lambda: POST to Function URL with message
    Lambda->>DDB: Create/Get session
    DDB-->>Lambda: Session data
    Lambda->>DDB: Store user message
    Lambda->>Bedrock: Send query to Bedrock agent
    
    %% Step 5: Streaming response back
    Bedrock-->>Lambda: Stream AI response chunks
    Lambda-->>Browser: Stream response chunks in real-time
    Note over Browser: Display incrementally as received
    
    %% Step 6: Finalizing conversation
    Lambda->>DDB: Store complete assistant message
    Lambda->>DDB: Update session with usage metrics
    
    %% Step 7: Optional - Update session title
    Lambda->>Bedrock: Generate title if new session
    Bedrock-->>Lambda: Generated title
    Lambda->>DDB: Update session title
    Lambda-->>Browser: Complete response
```

## Detailed Message Flow

```mermaid
flowchart TD
    subgraph Browser["Client Browser"]
        UI[User Interface]
        Stream[Response Stream Handler]
    end
    
    subgraph AWS["AWS Cloud"]
        subgraph APIGateway["API Gateway"]
            Conversations[GET /conversations]
            Messages[GET /messages]
            MessagePost[POST /message]
            Suggestions[GET /suggestions]
            Title[POST /title]
        end
        
        subgraph LambdaURL["Lambda Function URL"]
            Converse[Converse Function]
            EnhancedStream[EnhancedResponseStream]
        end
        
        subgraph BedrockService["AWS Bedrock"]
            Agent[Bedrock Agent]
            ModelInvoke[Model Invocation]
        end
        
        subgraph DynamoDB["DynamoDB Tables"]
            SessionTable[Chat Session Table]
            MessageTable[Chat Message Table]
            UserTable[Chat User Table]
        end
    end
    
    %% Browser to API Gateway flows
    UI --> Conversations
    UI --> Messages
    UI --> MessagePost
    UI --> Suggestions
    UI --> Title
    
    %% API Gateway to DynamoDB
    Conversations --> SessionTable
    Messages --> MessageTable
    MessagePost --> MessageTable
    MessagePost --> SessionTable
    Title --> SessionTable
    
    %% Browser to Lambda URL for streaming
    UI --> Converse
    Converse --> EnhancedStream
    EnhancedStream --> Stream
    
    %% Lambda to Bedrock and DynamoDB
    Converse --> Agent
    Converse --> SessionTable
    Converse --> MessageTable
    Agent --> ModelInvoke
    Converse --> UserTable
    
    %% Return responses
    SessionTable --> Conversations
    MessageTable --> Messages
    Agent --> EnhancedStream
    Suggestions --> UI
    
    %% Process steps annotation with improved colors
    classDef process fill:#D93636,stroke:#333,stroke-width:2px,color:white
    classDef storage fill:#3665D9,stroke:#333,stroke-width:2px,color:white
    classDef external fill:#36D978,stroke:#333,stroke-width:2px,color:black
    
    class UI,Stream process
    class SessionTable,MessageTable,UserTable storage
    class Agent,ModelInvoke external
```

