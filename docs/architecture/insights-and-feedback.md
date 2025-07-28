# Insights and Feedback Architecture

## Overview

The Pika platform provides two interconnected features for analyzing and improving chat interactions:

- **Feedback System**: Collects and manages user feedback on chat sessions
- **Insights System**: Generates AI-powered insights about chat sessions and automatically creates improvement feedback

Both features integrate with OpenSearch for advanced querying and analytics, enabling comprehensive session analysis and continuous improvement of the chat experience.

## System Architecture

```mermaid
graph TB
    subgraph "Frontend"
        ChatApp[Chat App]
        AdminUI[Admin UI]
    end

    subgraph "API Layer"
        ChatAPI[Chat API]
        AdminAPI[Admin API]
        SvelteRoutes[SvelteKit Routes]
    end

    subgraph "Backend Services"
        FeedbackLambda[Session Feedback Changed Lambda]
        SessionChangedLambda[Session Changed Lambda]
        InsightsRunner[Session Insights Runner Lambda]
        InsightsTrigger[Session Changed Insights Lambda]
        InitialTrigger[Initial Trigger Lambda]
    end

    subgraph "Storage"
        DynamoDB[(DynamoDB)]
        S3[(S3 Bucket)]
        OpenSearch[(OpenSearch)]
        SQS[SQS Queue]
    end

    subgraph "AI Services"
        Bedrock[AWS Bedrock]
    end

    ChatApp --> SvelteRoutes
    AdminUI --> SvelteRoutes
    SvelteRoutes --> ChatAPI
    SvelteRoutes --> AdminAPI

    ChatAPI --> DynamoDB
    AdminAPI --> DynamoDB

    DynamoDB --> FeedbackLambda
    DynamoDB --> SessionChangedLambda
    DynamoDB --> InsightsTrigger
    FeedbackLambda --> OpenSearch
    SessionChangedLambda --> S3
    SessionChangedLambda --> OpenSearch
    InsightsTrigger --> DynamoDB

    SQS --> InsightsRunner
    InsightsRunner --> DynamoDB
    InsightsRunner --> S3
    InsightsRunner --> Bedrock
    InsightsRunner --> OpenSearch
    InsightsRunner --> SQS

    InitialTrigger --> SQS
```

## Feedback System Architecture

### Overview

The feedback system enables collection, storage, and analysis of user feedback on chat sessions. It supports both manual user feedback and automated AI-generated feedback.

### Components

#### 1. Data Storage

- **Primary Storage**: `chat-session-feedback` DynamoDB table
- **Secondary Storage**: OpenSearch for advanced querying and analytics
- **Schema**: Feedback records linked to sessions with timestamps and metadata

#### 2. API Endpoints

- **Chat API**: `POST /api/chat/feedback`, `GET /api/chat/feedback/{sessionId}`
- **Admin API**: `POST /api/chat-admin/session/feedback`, `PUT /api/chat-admin/session/feedback`
- **SvelteKit Routes**: `/api/session-feedback/`, `/api/session-feedback/[sessionId]/`

#### 3. Stream Processing

- **Lambda**: `session-feedback-changed`
- **Trigger**: DynamoDB Streams on feedback table
- **Function**: Replicates feedback data to OpenSearch for analytics

### Data Flow

```mermaid
sequenceDiagram
    participant User
    participant ChatApp
    participant API
    participant DynamoDB
    participant Lambda
    participant OpenSearch

    User->>ChatApp: Submit Feedback
    ChatApp->>API: POST /api/session-feedback
    API->>DynamoDB: Insert Feedback Record
    DynamoDB->>Lambda: Stream Event
    Lambda->>OpenSearch: Replicate Feedback
    Lambda->>DynamoDB: Update Session with Feedback Reference
```

### Feedback Types

- **Manual User Feedback**: Direct user input on session quality
- **AI-Generated Feedback**: Automated feedback from insights analysis
- **Admin Feedback**: Manual feedback from administrators

## OpenSearch Synchronization Architecture

### Overview

The OpenSearch synchronization system ensures that session data in the search index remains consistent with both DynamoDB session records and S3-stored insights files. This enables comprehensive analytics and search capabilities across all session data.

### Components

#### Session Changed Lambda

- **File**: `src/lambda/session-changed/index.ts`
- **Trigger**: DynamoDB Streams on chat session table
- **Function**: Replicates session changes to OpenSearch with intelligent insights handling
- **Key Features**:
    - Monitors `insightsS3Url` changes in session records
    - Automatically reads insights from S3 when URLs are added or modified
    - Removes insights from OpenSearch when URLs are cleared
    - Preserves existing insights when no URL changes occur

#### Insights Synchronization Logic

The lambda implements sophisticated logic to handle different insights URL change scenarios:

```typescript
// Case 1: No URL changes - preserve existing insights
if (newInsightsUrl === oldInsightsUrl) {
    return newSession; // Don't overwrite OpenSearch insights
}

// Case 2: URL removed - clear insights from OpenSearch
if (oldInsightsUrl && !newInsightsUrl) {
    return { ...newSession, insights: undefined };
}

// Case 3: URL added/changed - read from S3 and populate
if (newInsightsUrl) {
    const insights = await readInsightsFromS3(newInsightsUrl);
    return { ...newSession, insights };
}
```

### Data Flow

```mermaid
sequenceDiagram
    participant InsightsRunner
    participant DynamoDB
    participant S3
    participant SessionChangedLambda
    participant OpenSearch

    InsightsRunner->>S3: Store Insights JSON
    InsightsRunner->>DynamoDB: Update insightsS3Url
    DynamoDB->>SessionChangedLambda: Stream Event (MODIFY)
    SessionChangedLambda->>SessionChangedLambda: Detect URL Change
    SessionChangedLambda->>S3: Read Insights File
    S3-->>SessionChangedLambda: Return Insights Data
    SessionChangedLambda->>SessionChangedLambda: Convert snake_case to camelCase
    SessionChangedLambda->>OpenSearch: Update Session with Insights
```

### S3 Integration

#### URL Parsing

```typescript
function parseS3Url(s3Url: string): { bucket: string; key: string } | null {
    // Parses s3://bucket-name/path/to/file.json format
    // Returns structured bucket and key for GetObject operation
}
```

#### Insights Retrieval

```typescript
async function readInsightsFromS3(s3Url: string): Promise<SessionInsights | undefined> {
    // 1. Parse S3 URL to extract bucket and key
    // 2. Execute GetObjectCommand to read insights file
    // 3. Convert JSON from snake_case (storage) to camelCase (application)
    // 4. Return formatted insights for OpenSearch indexing
}
```

### Benefits

- **Automatic Sync**: Insights appear in OpenSearch immediately when generated
- **Data Consistency**: Search index always reflects current S3 storage state
- **Format Translation**: Seamless conversion between storage and application formats
- **Error Resilience**: Graceful handling of S3 read failures with detailed logging
- **Memory Efficiency**: Only reads S3 when insights URLs actually change

## Insights System Architecture

### Overview

The insights system uses AI to analyze chat sessions and generate actionable insights about conversation quality, user satisfaction, and improvement opportunities.

### Components

#### 1. Continuous Processing Pipeline

- **Architecture**: Hybrid streaming-batch pipeline with atomic session completion
- **Scheduling**: SQS-based continuous execution with configurable intervals
- **Processing**: Parallel processing with controlled concurrency and timeout management

#### 2. Core Lambda Functions

##### Session Insights Runner

- **File**: `src/lambda/session-insights-runner/index.ts`
- **Trigger**: SQS messages
- **Function**: Main processing daemon that analyzes sessions requiring insights
- **Key Features**:
    - Hybrid pipeline with atomic session completion
    - Memory-efficient frequent batch flushing
    - Graceful timeout handling with 20% buffer
    - Configurable concurrency limits for Bedrock API calls

##### Session Changed Insights Trigger

- **File**: `src/lambda/session-changed-insights/index.ts`
- **Trigger**: DynamoDB Streams on chat session table
- **Function**: Marks sessions as needing insights analysis when messages change
- **Logic**:
    - Sets `NEEDS_INSIGHTS_ANALYSIS` status when new messages arrive
    - Removes `lastAnalyzedMessageId` when session gets new messages
    - Ensures only settled sessions (after wait period) are analyzed

##### Initial Trigger

- **File**: `src/lambda/session-insights-initial-trigger/index.ts`
- **Trigger**: CloudFormation custom resource on stack deployment
- **Function**: Bootstraps the insights runner by sending initial SQS message

#### 3. AI Analysis Engine

- **File**: `src/lambda/session-insights-runner/insights-analyzer.ts`
- **AI Provider**: AWS Bedrock (Claude models)
- **Analysis Areas**:
    - User goals and satisfaction
    - Conversation effectiveness
    - Areas for improvement
    - Feature suggestions
    - Urgency assessment

#### 4. Storage Strategy

- **Session Metadata**: DynamoDB with insight status tracking
- **Insights Files**: S3 at `session-insights/{chatAppId}/{userId}/{messageId}.json`
- **Feedback Records**: Auto-generated feedback stored in feedback system
- **Search Index**: OpenSearch for advanced analytics

### Processing Pipeline

```mermaid
graph TD
    A[SQS Message] --> B[Session Insights Runner]
    B --> C[Query Sessions Needing Analysis]
    C --> D[Paginated Session Iterator]
    D --> E[Batch Sessions for Processing]
    E --> F[Analyze Session with AI]
    F --> G[Store Insights to S3]
    G --> H[Create AI Feedback Record]
    H --> I[Update Session Status]
    I --> J[Batch Flush to DynamoDB]
    J --> K[Schedule Next Execution]
    K --> A

    style B fill:#e1f5fe
    style F fill:#fff3e0
    style G fill:#f3e5f5
    style J fill:#e8f5e8
```

### Hybrid Pipeline Configuration

```typescript
interface PipelineConfig {
    queryPageSize: 200; // DynamoDB pagination balance
    insightBatchSize: 10; // Parallel insights per page
    dbBatchSize: 12; // Frequent flush threshold
    insightConcurrency: 3; // Concurrent Bedrock calls
    feedbackConcurrency: 3; // Concurrent feedback writes
    timeoutBufferMs: number; // 20% of lambda timeout
    maxRetries: 3; // Per operation retry limit
}
```

### Key Benefits

- **Atomic Completion**: Each session fully processed before moving to next
- **Memory Efficiency**: Frequent flushing prevents accumulation
- **Transactional Consistency**: Session updates and feedback creation happen together
- **Timeout Resilience**: Graceful shutdown with pending batch flushing
- **Cost Optimization**: Efficient DynamoDB batching while maintaining atomicity

## Data Models

### Session Feedback Record

```typescript
interface ChatSessionFeedback {
    feedbackId: string;
    sessionId: string;
    userId: string;
    chatAppId: string;
    feedback: string;
    rating?: number;
    createdAt: string;
    source: 'user' | 'ai' | 'admin';
    metadata?: Record<string, any>;
}
```

### Session Insights Metadata

```typescript
interface SessionInsights {
    sessionId: string;
    insightStatus: 'NEEDS_INSIGHTS_ANALYSIS' | 'INSIGHTS_COMPLETED';
    lastAnalyzedMessageId?: string;
    insightsS3Url?: string;
    analysisTimestamp?: string;
    insightsVersion: number;
}
```

### Insights File Format (S3)

```typescript
interface SessionInsightsFile {
    sessionId: string;
    analysisTimestamp: string;
    userGoals: string[];
    goalsAccomplished: boolean;
    userSentiment: string;
    agentImprovementAreas: string[];
    improvementSuggestions: string[];
    userSatisfied: boolean;
    helpRecommendations: string[];
    featureSuggestions: string[];
    urgentIssues: string[];
    overallAssessment: string;
}
```

## Configuration

### Environment Variables

#### Insights Runner

```bash
WAIT_TO_COMPUTE_INSIGHTS_MS=3600000  # 1 hour settling time
EXECUTE_RUNNER_EVERY_MS=60000        # 1 minute execution interval
NOOP_EXECUTION=false                 # Enable/disable processing
SESSION_INSIGHTS_RUNNER_QUEUE=<url>  # SQS queue URL
PIKA_S3_BUCKET=<name>               # S3 bucket for insights
CHAT_SESSION_TABLE=<name>           # DynamoDB session table
CHAT_SESSION_FEEDBACK_TABLE=<name>  # DynamoDB feedback table
PIKA_DOMAIN_ENDPOINT=<url>          # OpenSearch endpoint
```

#### CDK Infrastructure

```typescript
// SQS Queue Configuration
visibilityTimeout: Duration.minutes(16); // 16min for 15min lambda
deadLetterQueue: {
    maxReceiveCount: 3;
}

// Lambda Configuration
timeout: Duration.minutes(15);
memorySize: 1024; // Insights runner needs more memory
```

## Security and Permissions

### IAM Policies

#### Insights Runner Lambda

- **Bedrock**: `InvokeModel`, `InvokeModelWithResponseStream`
- **DynamoDB**: Full CRUD on session and feedback tables
- **S3**: Read/write to `session-insights/*` prefix
- **SQS**: Send/receive/delete messages on insights queue
- **OpenSearch**: Full access for indexing and search

#### Stream Processing Lambdas

- **DynamoDB**: Stream read permissions and table write access
- **OpenSearch**: Index write permissions for replication

#### Session Changed Lambda

- **DynamoDB**: Stream read permissions and staging table write access
- **S3**: Read access to `session-insights/*` for insights synchronization
- **OpenSearch**: Full index access for session and insights replication

### Data Privacy

- **PII Handling**: Insights analysis processes chat content but stores only analytical metadata
- **Access Control**: Role-based access through existing authentication system
- **Audit Trail**: All feedback and insights operations logged with timestamps

## Monitoring and Observability

### Key Metrics

- **Processing Rate**: Sessions analyzed per hour
- **Error Rate**: Failed insights analysis attempts
- **Latency**: Time from session completion to insights generation
- **Queue Depth**: SQS message backlog
- **Cost Tracking**: Bedrock API usage and S3 storage
- **Sync Latency**: Time from S3 insights storage to OpenSearch availability
- **S3 Read Operations**: Insights file retrieval frequency and success rate

### Alerts

- **Queue Dead Letter**: Messages failing repeatedly
- **Processing Delays**: SQS messages not processed within SLA
- **Lambda Errors**: Insights runner failure rate above threshold
- **Bedrock Throttling**: AI API rate limit exceeded
- **S3 Read Failures**: Insights file retrieval errors above threshold
- **Sync Lag**: OpenSearch insights synchronization delays beyond SLA

## Deployment

### Prerequisites

- OpenSearch domain configured
- Session feedback table enabled
- S3 bucket with appropriate permissions
- Bedrock model access enabled

### CDK Deployment

```bash
# Deploy with insights feature enabled
cdk deploy -c stage=prod \
  --parameters sessionInsightsFeature=enabled
```

### Feature Flags

- `sessionInsightsFeature`: Controls insights system deployment
- `NOOP_EXECUTION`: Allows disabling processing without redeployment

## Operational Procedures

### Scaling Considerations

- **Bedrock Limits**: Monitor API quotas and request increases
- **DynamoDB Throughput**: Provision adequate capacity for batch writes
- **Lambda Concurrency**: Configure reserved concurrency for insights runner
- **S3 Lifecycle**: Implement policies for insights file retention

### Troubleshooting

- **Stuck Processing**: Check SQS queue for backed-up messages
- **Missing Insights**: Verify session status and wait time configuration
- **OpenSearch Sync**: Monitor stream processing lambda for replication issues
- **Cost Optimization**: Tune batch sizes and concurrency limits
- **Insights Missing in Search**: Check session-changed lambda logs for S3 read errors
- **Stale Insights Data**: Verify insightsS3Url changes trigger OpenSearch updates
- **S3 Permission Errors**: Ensure session-changed lambda has read access to insights prefix

## Future Enhancements

### Planned Features

- **Real-time Insights**: Streaming analysis for immediate feedback
- **Custom Analysis Models**: Domain-specific insights templates
- **Batch Reprocessing**: Ability to regenerate insights for historical sessions
- **Advanced Analytics**: Machine learning on feedback patterns
- **Integration APIs**: Webhook support for external systems

### Performance Optimizations

- **Caching Layer**: Redis for frequently accessed insights
- **Parallel Processing**: Multi-queue architecture for high throughput
- **Smart Batching**: Dynamic batch sizing based on load
- **Predictive Scaling**: Auto-scaling based on usage patterns
