---
title: Deploying Web Components
description: Deploy web components to production using S3 or external CDN
outline: [2, 3]
---

This guide explains how to deploy your web components to production environments.

## Overview

Your webcomponents can be defined and published from any AWS stack you wish. It doesn't have to be from the Pika stack.

Deploying involves:

1. **Building** your "compiled" javascript webcomponent file(s)
2. **Publishing** the file(s) to S3 or a URL
3. **Registering** a `TagDefinition` for each webcomponent that describes it

### Deployment Approaches

**Approach 1: Infrastructure as Code (Traditional)**

- Define resources in your CDK/CloudFormation/Serverless stack
- Deploy the entire stack to register tag definitions
- Best for production deployments

**Approach 2: Direct Upload Tool (Fast Development)**

- Create a script that directly uploads to S3 and invokes the tag definition Lambda
- Much faster than full stack deployments (seconds vs minutes)
- Perfect for rapid iteration during development
- See [Rapid Tag Definition Deployment Tool](#rapid-tag-definition-deployment-tool) for a complete reference implementation

:::note[Using Serverless Framework?]
The `pika-serverless` npm module includes a plugin to make this easy for you if you are using the Serverless Framework for IAC.
:::

## Pika S3 Bucket Name

If you intend to publish your "compiled" webcomponent file(s) to the private Pika s3 bucket (more on this below) then you will need the name of the Pika bucket.

The Pika bucket name is stored in SSM Parameter Store.

You will need to know the name of the pika service project (e.g. `pika`) and the stage it was deployed to (e.g. test, staging, prod) so you can get the Pika bucket name SSM parameter.

Your Pika framework project includes a `pika-config.ts` file in the root. The service project name may be found in `pika.projNameKebabCase`. The stage is whatever you used when you deployed the project: test, staging, prod, etc.

The SSM param name will then be: `/stack/\${pikaProjNameKebabCase}/\${stage}/s3/pika_bucket_name`

## Pika Tag Definition Lambda Custom Resource ARN

You will need the ARN of the pika service-deployed tag definition lambda that is a custom resource you will define in your stack
and use to make Pika aware of your web components.

The lambda ARN you need is stored in SSM Parameter Store here:

`/stack/\${pikaProjNameKebabCase}/\${stage}/lambda/tag_definition_custom_resource_arn`

See Pika S3 Bucket Name section above to know how to get `pikaProjNameKebabCase` and `stage`.

## Publish Your Webcomponent

### Option 1: Publish to private Pika S3 Bucket (Recommended)

Host your web component in the private Pika system S3 bucket. The system serves it via a secure proxy API.

**Benefits:**

- Integrated with Pika infrastructure
- Automatic integrity checking (SHA256 hash validation)
- No CORS configuration needed
- Private component hosting

**Requirements:**

- Must use the Pika system S3 bucket (bucket name retrieved from SSM Parameter Store)
- S3 key must follow pattern: `wc/{scope}/fileName.js.gz` // scope => your tag's scope
- File must be gzipped JavaScript
- ContentType: `application/javascript`
- ContentEncoding: `gzip`

**Uploading to S3**

Of course, you can do this via CDK or your favorite IAC approach. See Pika S3 Bucket Name above.

```js
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { gzipSync } from 'zlib';
import { createHash } from 'crypto';
import fs from 'fs';

const pikaProjNameKebabCase = 'pika';
const stage = 'test';
const myTagScope = 'acme';

// 1. Get Pika bucket name from SSM
const ssmClient = new SSMClient({ region: 'us-east-1' });
const { Parameter } = await ssmClient.send(
    new GetParameterCommand({
        Name: `/stack/${pikaProjNameKebabCase}/${stage}/s3/pika_bucket_name`
    })
);
const pikaBucket = Parameter.Value;

// 2. Read and gzip your JavaScript file
const jsContent = fs.readFileSync('./widgets.js', 'utf-8');
const gzipped = gzipSync(jsContent);

// 3. Calculate SHA256 hash of gzipped bytes
const hash = createHash('sha256').update(gzipped).digest('base64');

// 4. Upload to S3
const s3Client = new S3Client({ region: 'us-east-1' });
await s3Client.send(
    new PutObjectCommand({
        Bucket: pikaBucket,
        Key: `wc/${myTagScope}/widgets.js.gz`,
        Body: gzipped,
        ContentType: 'application/javascript',
        ContentEncoding: 'gzip'
    })
);

console.log('Hash to use in tag definition:', hash);
```

### Option 2: Publish to Your Own URL

Host your web component on your own CDN or server and provide the URL in your `TagDefinition`.

**Requirements:**

- Web-accessible HTTPS URL
- CORS headers configured for Pika domain
- Component registers itself on load

## Creating Tag Definitions

You will need to define a `TagDefinition` for each exposed custom element in your published javascript webcomponent file(s) and deploy a custom resource with your stack when you publish it to AWS.

### Understanding Custom Element Names

By default, Pika expects your JavaScript file to define a custom element with the name `{scope}.{tag}` (e.g., `pika.order-detail`). However, you may want to specify a different custom element name:

**Common Use Cases:**

1. **Multiple tags sharing one JavaScript file**: If you have several tag definitions that all point to the same JavaScript file (which defines a single custom element), you can use `customElementName` to specify the actual element name that file defines.

2. **Legacy custom element names**: If your JavaScript file defines a custom element with a name that doesn't follow the `{scope}.{tag}` convention (e.g., `hello-world` or `my-widget`).

3. **Widget bundles**: When a single JavaScript file defines multiple custom elements, each tag definition can specify which custom element it uses via `customElementName`.

**Example Scenario:**

You have three tag definitions (`acme.dashboard-widget`, `acme.analytics-widget`, `acme.reports-widget`) that all use the same JavaScript file which defines a single reusable custom element called `generic-display`. Each tag definition would set:

```js
customElementName: 'generic-display';
```

This allows the JavaScript file to be loaded once, and all three tag definitions can create instances of the `generic-display` element.

### Install Pika Shared

In case you didn't yet...

The `pika-shared` npm module exposes the `TagDefinition` and other interfaces you will want.

```bash
pnpm install -D pika-shared
```

### Create Your TagDefinitions

You will need a separate stack resource defined for each of your custom elements defined in your "compiled" javascript
webcomponent file(s).

The custom resource takes a gzipped hex encoded version of `TagDefinitionForCreateOrUpdate<TagDefinitionWidgetWebComponentForCreateOrUpdate>` as input to define your webcomponent.

#### Example TagDefinition

```js
import { type TagDefinitionForCreateOrUpdate, TagDefinitionWidgetWebComponentForCreateOrUpdate } from 'pika-shared/types/chatbot/chatbot-types';

/** The combination of `{scope}.{tag}` must be unique system wide. */
const tagDef: TagDefinitionForCreateOrUpdate<TagDefinitionWidgetWebComponentForCreateOrUpdate> = {
    /**
     * Tag name published by your webcomponent, do not include scope prefix
     */
    tag: 'order-detail',

    /**
     * The scope of the tag.  This is used to group tags together and prevent collisions with other tags.
     *
     * Inside the system, your tag will be known as `<scope>.<tag>`.  For example, the order detail tag will be
     * known as `<acme.order-detail></acme.order-detail>`.
     *
     * As a result, scope must not include punctuation of any kind to be valid xml and keep things simple.
     * All lower case is recommended but it's up to you. Your aim is to ensure uniqueness of the tag name across all
     * tags in the system and to keep it short and simple to use as few characters as possible within reason.
     *
     * Do not use `pika` for your scope as it is reserved for built in tags the platform natively supports.
     * You should use a scope that is unique to your application, chat app or agent (project name, stack name, etc.).
     *
     * When you deploy the tag definition, the scope will be used to determine the S3 bucket and key for the webcomponent
     * file. You will not actually deploy the webcomponent file to S3, the platform will do that for you.
     *
     * The webcomponent file is located in the `wc/{scope}/${tag}.js.gz` directory in the Pika S3 bucket. You will NOT
     * actually deploy the webcomponent file to S3, the platform will do that for you.
     */
    scope: 'acme',

    /**
     * This should be a pluralized noun that represents the tag and be capitalized.
     *
     * For example, the chart tag title is "Charts".  The prompt tag title is "Follow-up Prompts".
     * The image tag title is "Images".
     *
     * Do not use markdown in this title.
     *
     * NOTE: This field acts as a fallback title if your web component doesn't register its own
     * title via getWidgetMetadataAPI(). For dynamic titles and action buttons, components should
     * register metadata at runtime. See Building Web Components - Metadata Registration.
     */
    tagTitle: 'Order Details',

    /**
     * This should be a short example of the tag structure.  It may be used in the prompt assistance language injected into
     * your prompt in a quick list of tags available for the LLM to generate.
     *
     * For example, the chart tag structure example is `<pika.chart></pika.chart>`.  The prompt tag structure example is
     * `<pika.prompt></pika.prompt>`.  The image tag structure example is `<pika.image></pika.image>`.
     */
    shortTagEx: '<acme.order-detail></acme.order-detail>',

    /**
     * If true, the tag can be generated by the LLM. If this is true, then this should be an inline widget
     * (renders in chat message).
     */
    canBeGeneratedByLlm: false,

    /**
     * If true, the tag can be generated by a tool of an agent. If this is true, then this should be an inline widget
     * (renders in chat message).
     */
    canBeGeneratedByTool: false,

    /** A description of the tag.  This will be used to describe the tag in admin-facing UI. Don't use markdown in this description. */
    description: 'A tag that displays the details of an order.',

    /**
     * Causes infrastructure to not cache this tag definition and instead fetch it from the database on
     * every request. Use this when developing and testing. Defaults to false. Set to true while developing
     * and false when done and deployed to prod.
     */
    dontCacheThis: true,

    /**
     * The chat app ID this tag is associated with. Use the special value `chat-app-global` for tags available to all chat apps.
     * Every tag must be associated with either a specific chat app or be global.
     */
    chatAppId: 'acme-chat',

    /** The status of the tag. */
    status: 'enabled',

    /**
     * The rendering contexts this widget may be rendered in.
     * See the feature doc for Web Components for more details about the different rendering contexts.
     */
    renderingContexts: {
        spotlight: {
            enabled: true
        },
        canvas: {
            enabled: true
        }
    },

    widget: {
        /** Designates this as external widget as opposed to one compiled in with the front end. */
        type: 'web-component',
        webComponent: {
            /**
             * Optional: The actual custom element name that the JavaScript file defines.
             *
             * If not provided, defaults to `{scope}.{tag}` (e.g., "acme.order-detail").
             *
             * Use this when:
             * - Multiple tag definitions share the same JavaScript file that defines one custom element
             * - The JavaScript file defines a custom element with a different name than the tag
             * - A JavaScript bundle file defines multiple custom elements
             *
             * Examples:
             * - "hello-world" for a file that calls customElements.define("hello-world", ...)
             * - "generic-widget" when multiple tags share the same reusable widget
             *
             * If your JavaScript defines the element as `acme.order-detail`, you can omit this field.
             */
            customElementName: 'acme-order-detail', // Optional: only needed if different from `{scope}.{tag}`

            /** You may use `url` if you'd rather deploy it to your own server and not use the private Pika s3 bucket. */
            s3: {
                /**
                 * You don't provide the s3 bucket. For security purposes it is assumed to be the
                 * the Pika system bucket name retrieved from SSM parameter store.
                 * See instructions in Deploying Web Components doc in the `Pika S3 Bucket Name` section.
                 */


                /**
                 * Must follow pattern: wc/{scope}/fileName.js.gz where scope is your tag's scope and
                 * fileName is the whatever you want it to be.  It must end with .js.gz.
                 */
                s3Key: `wc/acme/order-detail.js.gz`
            },
            encoding: 'gzip', // This must be 'gzip'
            mediaType: 'application/javascript', // This must be 'application/javascript'
            encodedSizeBytes: 0, // Set to correct value (bytes of the gzipped content)
            encodedSha256Base64: 'my-hash' // Compute by doing a sha256 hash of the gzipped file contents and then base64 encoding the hash
        }
    }
};
```

#### Example: Multiple Tags Sharing One Widget

Here's a practical example where multiple tag definitions share the same reusable widget:

```js
// Scenario: You have a generic chart widget that can be used in different contexts
// The JavaScript file defines: customElements.define('generic-chart', ...)

// Tag Definition 1: Sales Chart (appears in spotlight)
const salesChartTag: TagDefinitionForCreateOrUpdate<TagDefinitionWidgetWebComponentForCreateOrUpdate> = {
    tag: 'sales-chart',
    scope: 'acme',
    shortTagEx: '<acme.sales-chart></acme.sales-chart>',
    tagTitle: 'Sales Charts',
    description: 'Display sales data in chart format',
    canBeGeneratedByLlm: false,
    canBeGeneratedByTool: false,
    chatAppId: 'acme-chat',
    status: 'enabled',
    renderingContexts: {
        spotlight: { enabled: true }
    },
    widget: {
        type: 'web-component',
        webComponent: {
            customElementName: 'generic-chart', // Actual element name in JS file
            s3: {
                s3Key: 'wc/acme/charts.js.gz' // Shared file
            },
            encoding: 'gzip',
            mediaType: 'application/javascript',
            encodedSizeBytes: 45000,
            encodedSha256Base64: 'abc123...'
        }
    }
};

// Tag Definition 2: Analytics Chart (appears in canvas)
const analyticsChartTag: TagDefinitionForCreateOrUpdate<TagDefinitionWidgetWebComponentForCreateOrUpdate> = {
    tag: 'analytics-chart',
    scope: 'acme',
    shortTagEx: '<acme.analytics-chart></acme.analytics-chart>',
    tagTitle: 'Analytics Charts',
    description: 'Display analytics data in chart format',
    canBeGeneratedByLlm: false,
    canBeGeneratedByTool: false,
    chatAppId: 'acme-chat',
    status: 'enabled',
    renderingContexts: {
        canvas: { enabled: true }
    },
    widget: {
        type: 'web-component',
        webComponent: {
            customElementName: 'generic-chart', // Same element name
            s3: {
                s3Key: 'wc/acme/charts.js.gz' // Same file
            },
            encoding: 'gzip',
            mediaType: 'application/javascript',
            encodedSizeBytes: 45000,
            encodedSha256Base64: 'abc123...' // Same hash
        }
    }
};

// Benefits:
// - The charts.js.gz file is only loaded once
// - Both tags create instances of the same 'generic-chart' custom element
// - The widget can differentiate behavior based on the context provided by Pika
// - Reduces bundle size and improves performance
```

### Direct Component Invocation Instructions

If your web component needs to invoke the LLM agent directly (using `chatAppState.invokeAgentAsComponent()`), you must define instructions in your tag definition.

**Field:** `componentAgentInstructionsMd`

**Purpose:** Provides component-specific prompts that the agent uses when your widget calls `invokeAgentAsComponent()`. These instructions are separate from the main chat agent instructions.

**Structure:**

```js
componentAgentInstructionsMd: {
    'instruction-name-1': `Markdown instructions here...`,
    'instruction-name-2': `Different instructions...`,
    // Add as many instruction sets as needed
}
```

**Instruction Content Guidelines:**

1. **Start with role/context:** "You are a [type] assistant..."
2. **List numbered steps:** What the agent should do
3. **Define output schema:** TypeScript interface for the response in `<output_schema>...</output_schema>`
4. **End with formatting macro:** `{{typescript-backed-output-formatting-requirements}}`

**Example Tag Definition with Instructions:**

```js
import {
    type TagDefinitionForCreateOrUpdate,
    type TagDefinitionWidgetWebComponentForCreateOrUpdate
} from 'pika-shared/types/chatbot/chatbot-types';

const weatherWidgetTag: TagDefinitionForCreateOrUpdate<TagDefinitionWidgetWebComponentForCreateOrUpdate> = {
    tag: 'weather-dashboard',
    scope: 'acme',
    shortTagEx: '<acme.weather-dashboard></acme.weather-dashboard>',
    tagTitle: 'Weather Dashboard',
    description: 'Interactive weather widget with real-time data',
    canBeGeneratedByLlm: false,
    canBeGeneratedByTool: false,
    chatAppId: 'acme-chat',
    status: 'enabled',
    renderingContexts: {
        spotlight: {
            enabled: true,
            isDefault: true
        }
    },
    widget: {
        type: 'web-component',
        webComponent: {
            customElementName: 'weather-dashboard',
            s3: {
                s3Key: 'wc/acme/weather.js.gz'
            },
            encoding: 'gzip',
            mediaType: 'application/javascript',
            encodedSizeBytes: 45000,
            encodedSha256Base64: 'your-hash-here'
        }
    },
    // Instructions for direct component invocation
    componentAgentInstructionsMd: {
        'getCurrentWeather': `You are a weather data assistant. When invoked, you should:

1. Extract the location(s) from the user's request
2. Always use the appropriate tool(s) to fetch real-time data. Do not make up weather information.
3. Return the weather information in a structured format

<output_schema>
interface WeatherDataResponse {
    locations: WeatherData[];
}

interface WeatherData {
    // The location name
    location: string;
    // Longitude
    lon: number;
    // Latitude
    lat: number;
    // Temperature in Fahrenheit
    tempF: number;
    // Temperature in Celsius
    tempC: number;
    // ISO 8601 timestamp
    timestamp: string;
}
</output_schema>

{{typescript-backed-output-formatting-requirements}}`,

        'getForecast': `You are a weather forecast assistant. When invoked, you should:

1. Extract the location from the user's request
2. Use available tools to get 5-day forecast data
3. Return comprehensive forecast information

<output_schema>
interface ForecastResponse {
    location: string;
    // Array of daily forecasts
    forecast: DailyForecast[];
}

interface DailyForecast {
    // ISO 8601 date (YYYY-MM-DD)
    date: string;
    // High temperature (Fahrenheit)
    highF: number;
    // Low temperature (Fahrenheit)
    lowF: number;
    // Weather condition (e.g., 'Sunny', 'Partly Cloudy', 'Rainy')
    condition: string;
    // Precipitation chance (0-100)
    precipChance: number;
    // Brief description
    description: string;
}
</output_schema>

{{typescript-backed-output-formatting-requirements}}`,

        'checkAlerts': `You are a weather alert assistant. When invoked, you should:

1. Extract location(s) from the user's request
2. Check for current weather alerts, warnings, and watches for these locations
3. Return alert information in structured format

Note: If no real alert API is available, return mock data indicating you checked for alerts.

<output_schema>
interface WeatherAlertsResponse {
    locations: LocationAlerts[];
}

interface LocationAlerts {
    // The location name
    location: string;
    // Array of alerts for this location
    alerts: WeatherAlert[];
}

interface WeatherAlert {
    // Alert severity: 'severe', 'warning', 'watch', 'advisory'
    severity: string;
    // Alert type (e.g., 'Thunderstorm Warning', 'Flood Watch')
    type: string;
    // Brief description
    description: string;
    // ISO 8601 timestamp when alert was issued
    issuedAt: string;
    // ISO 8601 timestamp when alert expires
    expiresAt: string;
}
</output_schema>

{{typescript-backed-output-formatting-requirements}}`
    }
};
```

**How Your Widget Uses These Instructions:**

```js
// In your widget code
const weatherData = await context.chatAppState.invokeAgentAsComponent(
    'acme', // scope
    'weather-dashboard', // tag
    'getCurrentWeather', // instruction name (must match key above)
    'Get weather for San Francisco'
);
```

**Best Practices:**

1. **One instruction per use case:** Create separate instructions for different widget actions
2. **Be specific about tools:** Mention if the agent should use specific tools
3. **Always define schemas:** Include complete TypeScript interfaces for responses
4. **Include the formatting macro:** Always end with `{{typescript-backed-output-formatting-requirements}}`
5. **Test with real queries:** Ensure instructions produce correct output format

**Security Notes:**

- Instructions are server-side only (defined in tag definitions)
- Widget code cannot modify instructions
- Only pre-defined instruction names can be invoked
- All requests require authentication

#### Example CDK to define Tag Definition Resource

First, see the "Pika Tag Definition Lambda Custom Resource ARN" section above on how to get the lambda ARN.

**For Components with Direct Invocation:**

```js
import { CustomResource, Duration } from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { gzipAndBase64EncodeString } from 'pika-shared/util/gzip-util';

export class MyWidgetStack extends Construct {
    constructor(scope: Construct, id: string) {
        super(scope, id);

        // Get the Pika tag definition lambda ARN from SSM
        const tagDefLambdaArn = '...'; // From SSM parameter store

        // Your tag definition with instructions
        const tagDef = {
            // ... tag definition as shown above with componentAgentInstructionsMd
        };

        // Create CloudFormation custom resource
        new CustomResource(this, 'WeatherDashboardTagDef', {
            serviceToken: tagDefLambdaArn,
            properties: {
                Action: 'createOrUpdate',
                TagDefinition: gzipAndBase64EncodeString(JSON.stringify(tagDef))
            }
        });
    }
}
```

### For Global Tags (All Chat Apps)

Use `chatAppId: 'chat-app-global'` for tags available to all chat apps:

```js
const globalTag: TagDefinitionForCreateOrUpdate<TagDefinitionWidgetWebComponentForCreateOrUpdate> = {
    tag: 'my-widget',
    scope: 'acme',
    chatAppId: 'chat-app-global', // Available to all chat apps
    // ... rest of definition
};
```

### Complete Deployment Example

Here's a complete example of deploying a web component with LLM integration:

**1. Build your web component:**

```bash
# Build with Vite
npm run build
# Output: dist/weather-widgets.js
```

**2. Gzip the file:**

```bash
gzip -c dist/weather-widgets.js > dist/weather-widgets.js.gz
```

**3. Calculate hash:**

```js
import { createHash } from 'crypto';
import fs from 'fs';

const gzipped = fs.readFileSync('dist/weather-widgets.js.gz');
const hash = createHash('sha256').update(gzipped).digest('base64');
const size = gzipped.length;

console.log('Hash:', hash);
console.log('Size:', size);
```

**4. Create CDK stack:**

```js
import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import { CustomResource } from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { gzipAndBase64EncodeString } from 'pika-shared/util/gzip-util';
import type {
    TagDefinitionForCreateOrUpdate,
    TagDefinitionWidgetWebComponentForCreateOrUpdate
} from 'pika-shared/types/chatbot/chatbot-types';

export class WeatherWidgetsStack extends Stack {
    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props);

        const stage = 'test'; // or 'prod'
        const pikaProjName = 'pika';

        // Get Pika bucket name from SSM
        const pikaBucketName = ssm.StringParameter.valueFromLookup(
            this,
            `/stack/${pikaProjName}/${stage}/s3/pika_bucket_name`
        );

        const pikaBucket = s3.Bucket.fromBucketName(this, 'PikaBucket', pikaBucketName);

        // Get tag definition lambda ARN
        const tagDefLambdaArn = ssm.StringParameter.valueFromLookup(
            this,
            `/stack/${pikaProjName}/${stage}/lambda/tag_definition_custom_resource_arn`
        );

        // Deploy web component to S3
        new BucketDeployment(this, 'WeatherWidgetDeployment', {
            sources: [Source.asset('./dist')], // Contains weather-widgets.js.gz
            destinationBucket: pikaBucket,
            destinationKeyPrefix: 'wc/acme/',
            contentType: 'application/javascript',
            contentEncoding: 'gzip',
            prune: false
        });

        // Define tag with instructions
        // Note: tagTitle is a fallback. The component can register its own title and
        // actions dynamically using getWidgetMetadataAPI() for a richer experience.
        const weatherDashboardTag: TagDefinitionForCreateOrUpdate<TagDefinitionWidgetWebComponentForCreateOrUpdate> = {
            tag: 'weather-dashboard',
            scope: 'acme',
            shortTagEx: '<acme.weather-dashboard></acme.weather-dashboard>',
            tagTitle: 'Weather Dashboard',
            description: 'Real-time weather dashboard with LLM integration',
            canBeGeneratedByLlm: false,
            canBeGeneratedByTool: false,
            chatAppId: 'weather-app',
            status: 'enabled',
            renderingContexts: {
                spotlight: {
                    enabled: true,
                    isDefault: true
                }
            },
            widget: {
                type: 'web-component',
                webComponent: {
                    customElementName: 'weather-dashboard',
                    s3: {
                        s3Key: 'wc/acme/weather-widgets.js.gz'
                    },
                    encoding: 'gzip',
                    mediaType: 'application/javascript',
                    encodedSizeBytes: 45000, // From step 3
                    encodedSha256Base64: 'your-calculated-hash' // From step 3
                }
            },
            componentAgentInstructionsMd: {
                'getWeather': `You are a weather assistant. When invoked:

1. Extract location from user request
2. Get current weather using available tools
3. Return structured data

<output_schema>
interface WeatherResponse {
    location: string;
    tempF: number;
    condition: string;
}
</output_schema>

{{typescript-backed-output-formatting-requirements}}`
            }
        };

        // Register tag definition
        new CustomResource(this, 'WeatherDashboardTagDef', {
            serviceToken: tagDefLambdaArn,
            properties: {
                Action: 'createOrUpdate',
                TagDefinition: gzipAndBase64EncodeString(JSON.stringify(weatherDashboardTag))
            }
        });
    }
}
```

**5. Deploy:**

**Traditional approach:**

```bash
cdk deploy
```

**Alternative: Direct upload tool (faster):**

For quicker iterations during development, use a direct upload tool instead. See the [Rapid Tag Definition Deployment Tool](#rapid-tag-definition-deployment-tool) section below for details and a complete reference implementation.

```bash
# Much faster than CDK deploy
pnpm run build-upload-tag-defs
```

## Rapid Tag Definition Deployment Tool

For faster development, you can create a tool that directly uploads tag definitions without deploying your entire CDK stack.

### Why Use a Direct Upload Tool?

- **Much faster** than CDK deploy (seconds vs minutes)
- **Quick iterations** when developing multiple web components
- **Focused updates** - only updates tag definitions and web components
- **Development friendly** - perfect for testing and iteration

### Reference Implementation

The weather sample project includes a complete reference implementation you can copy and adapt:

**Location:** `services/samples/weather/tools/upload-tag-defs/index.ts`

**What it does:**

1. Discovers required web component files from your tag definitions
2. Uploads built `.js` files to S3 (gzipped with integrity hashing)
3. Directly invokes the tag definition Lambda to register/update in DynamoDB
4. Validates all required files exist before uploading

**Usage example:**

```bash
# Build and upload in one command
pnpm run build-upload-tag-defs

# Or separate steps
pnpm run build
pnpm run upload-tag-defs
```

**Key features:**

- Automatically discovers which files to upload from S3 keys in tag definitions
- Calculates and sets correct SHA256 hashes and file sizes
- Clear error messages if files are missing
- Works with single or multiple web component files

**To adapt for your project:**

1. Copy the tool from the weather sample
2. Update the tag definitions import path
3. Add scripts to your `package.json`
4. Configure your `.env.local` with `STAGE` and `PIKA_SERVICE_PROJ_NAME_KEBAB_CASE`

This approach is especially useful during development when you're iterating on web components and don't want to wait for full stack deployments.

## Local Development Without Redeployment

After your initial deployment (via CDK or the upload tool above), you can develop and test web components locally without redeploying to AWS.

### Using Local URL Overrides

Set the `WEB_COMPONENT_URLS` environment variable to point tag definitions to your local development server:

```bash
# In your .env.local file (root of pika-chat app)
WEB_COMPONENT_URLS='weather.favorite-cities::http://localhost:5173/favorite-cities.js;weather.city-selector::http://localhost:5173/city-selector.js'
```

**Format:** `{scope}.{tag}::fully-qualified-url` (double colon to avoid conflicts with URL colons, semicolon-separated for multiple)

**How It Works:**

1. **Deploy once:** Deploy your tag definitions to DynamoDB (includes S3 location)
2. **Override locally:** Set `WEB_COMPONENT_URLS` to point to your local dev server
3. **Develop fast:** Edit code → hot reload → see changes instantly

**The system will:**

- Load tag definitions from DynamoDB (deployed once)
- **Ignore** the S3 location in the tag definition
- **Use** the URL from `WEB_COMPONENT_URLS` instead

**Example Workflow:**

```bash
# 1. Deploy tag definitions once (choose one method)
cdk deploy                          # Option A: Full stack deploy
# OR
pnpm run build-upload-tag-defs      # Option B: Direct upload (faster)

# 2. Start your web component dev server (two terminals)
cd services/samples/weather
pnpm run dev:wc      # Terminal 1: Watch and rebuild
pnpm run serve:wc    # Terminal 2: Serve built files on localhost:5173

# 3. Set environment variable in pika-chat
cd apps/pika-chat
# Add to .env.local:
# WEB_COMPONENT_URLS='weather.favorite-cities::http://localhost:5173/favorite-cities.js'

# 4. Start pika-chat dev server
pnpm run dev

# 5. Edit components, wait ~2 seconds for rebuild, refresh browser
```

**Benefits:**

- No CDK/CloudFormation redeployments during development
- No S3 uploads for every change
- Fast hot module reloading (HMR)
- Test changes in seconds, not minutes

**Important:**

- Only works when environment variable is set (development only)
- Tag definitions must exist in DynamoDB (deploy them first)
- Local dev server must be running
- Overrides are local to your machine

See [Building Web Components - Rapid Development](/docs/developer/building-web-components#rapid-development-with-local-overrides) for more details.

## Testing Your Deployment

After deploying, verify:

1. **S3 Upload:** Check that your `.js.gz` file is in the Pika S3 bucket
2. **Tag Definition:** Verify tag appears in DynamoDB `TagDefinitions` table
3. **Widget Loads:** Open your chat app and verify widget appears in spotlight
4. **LLM Integration:** Click buttons that call `invokeAgentAsComponent` and verify responses

## Troubleshooting

### Widget Doesn't Load

- **Check S3 key:** Ensure `s3Key` matches the actual file location
- **Verify hash:** SHA256 hash must match the gzipped file
- **Check size:** `encodedSizeBytes` must be correct
- **Custom element name:** Ensure `customElementName` matches what your JS defines

### invokeAgentAsComponent Fails

- **Verify instructions:** Check `componentAgentInstructionsMd` is defined
- **Match instruction name:** The name passed to `invokeAgentAsComponent()` must exist in instructions
- **Check scope/tag:** Ensure scope and tag match your tag definition exactly
- **Authentication:** Verify user is logged in and has access to the chat app

### Response Format Wrong

- **Check output schema:** Ensure schema matches actual response structure
- **Include formatting macro:** Always end instructions with `{{typescript-backed-output-formatting-requirements}}`
- **Test with agent:** Try the same query in main chat to verify agent behavior

## Next Steps

- [Building Web Components](/docs/developer/building-web-components) - Learn how to create widgets
- [pika-ux Module](/docs/developer/pika-ux-module) - Use pre-built UI components
- [Tags Feature](/docs/developer/tags-feature) - Manage tag definitions
- [Web Components Overview](/docs/features/web-components) - Understand widget contexts
