---
title: Deploying Web Components
description: Deploy web components to production using S3 or external CDN
outline: [2, 3]
---

This guide explains how to deploy your web components to production environments.

## Overview

Your webcomponents can be defined and published from any AWS stack you wish. It doesn't have to be from the Pika stack.

Deploying invovles:

- Building and publishing your "compiled" javascript webcomponent file
- Making a `TagDefinition` for each webcomponent you want to make available and defining a resource in your stack (CDK, CloudFormation, whatever) that will register/update your `TagDefinition` that describes your web component

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
- S3 key must follow pattern: `wc/\${scope}/fileName.js.gz` // scope => your tag's scope
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

By default, Pika expects your JavaScript file to define a custom element with the name `${scope}.${tag}` (e.g., `pika.order-detail`). However, you may want to specify a different custom element name:

**Common Use Cases:**

1. **Multiple tags sharing one JavaScript file**: If you have several tag definitions that all point to the same JavaScript file (which defines a single custom element), you can use `customElementName` to specify the actual element name that file defines.

2. **Legacy custom element names**: If your JavaScript file defines a custom element with a name that doesn't follow the `${scope}.${tag}` convention (e.g., `hello-world` or `my-widget`).

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

The custom resource takes a gzipped hex encoded version of `TagDefinitionForCreateOrUpdate<TagDefinitionWidgetWebComponent>` as input to define your webcomponent.

#### Example TagDefinition

```js
import { type TagDefinitionForCreateOrUpdate, TagDefinitionWidgetWebComponent } from 'pika-shared/types/chatbot/chatbot-types';

/** The combination of `\${scope}.\${tag}` must be unique system wide. */
const tagDef: TagDefinitionForCreateOrUpdate<TagDefinitionWidgetWebComponent> = {
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
     * The webcomponent file is located in the `wc/\${scope}/${tag}.js.gz` directory in the Pika S3 bucket. You will NOT
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
             * If not provided, defaults to `${scope}.${tag}` (e.g., "acme.order-detail").
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
            customElementName: 'acme-order-detail', // Optional: only needed if different from `${scope}.${tag}`

            /** You may use `url` if you'd rather deploy it to your own server and not use the private Pika s3 bucket. */
            s3: {
                /**
                 * This must be the Pika system bucket name retrieved from SSM parameter store.
                 * See instructions in Deploying Web Components doc in the `Pika S3 Bucket Name` section.
                 */
                s3Bucket: 'pika-system-bucket-name-retrieved-from-ssm-parameter-store',

                /**
                 * Must follow pattern: wc/\${scope}/fileName.js.gz where scope is your tag's scope and
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
const salesChartTag: TagDefinitionForCreateOrUpdate<TagDefinitionWidgetWebComponent> = {
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
                s3Bucket: 'pika-bucket',
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
const analyticsChartTag: TagDefinitionForCreateOrUpdate<TagDefinitionWidgetWebComponent> = {
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
                s3Bucket: 'pika-bucket',
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

#### Example CDK to define Tag Definition Resource

First, see the "Pika Tag Definition Lambda Custom Resource ARN" section above on how to get the lambda ARN.

TODO: !!!!!! COME BACK HERE (NOTHING BELOW SHOULD REMAIN WHEN DONE)

### For Global Tags (All Chat Apps)

Use `chatAppId: 'chat-app-global'`:

## Development Workflow

### Using deploy-mock-tags Tool

For rapid development iteration:

```bash
# From apps/pika-chat directory
npm run deploy:mock-tags
```

This tool:

1. Reads mock tags from `src/lib/mock-tags/definitions/`
2. Uploads web components to S3
3. Registers tags in DynamoDB

**Note:** Automatically skips production environments.

## CDK Deployment

For production deployments, include tag definitions in your CDK stack.

### Upload Web Components

```js
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';

// Upload gzipped web components
new BucketDeployment(this, 'WidgetDeployment', {
    sources: [
        Source.asset('dist/widgets', {
            include: ['*.js.gz']
        })
    ],
    destinationBucket: pikaS3Bucket,
    destinationKeyPrefix: 'wc/acme/',
    prune: false
});
```

### Register Tag Definitions

```js
import { gzipSync } from 'zlib';

const tagDef = {
    tag: 'dashboard',
    scope: 'acme',
    chatAppId: 'chat-app-global',
    status: 'enabled'
    // ... rest of definition
};

const gzipped = gzipSync(JSON.stringify(tagDef));
const tagDefData = gzipped.toString('base64');

new TagDefinitionResource(this, 'DashboardTag', {
    serviceToken: tagDefLambda.functionArn,
    stage: props.stage,
    tagDefData
});
```

## Validation

The Tag Definition Lambda validates:

1. `chatAppId` is present and non-empty
2. `status` defaults to `'enabled'` if not provided
3. `status` is one of: `'enabled'`, `'disabled'`, `'retired'`
4. S3 bucket matches Pika bucket
5. S3 key follows `wc/\${scope}/fileName.js.gz` pattern
6. File exists and can be decompressed
7. Hash matches stored hash (integrity check)

## Security

### SHA256 Hash Validation

When serving from S3, Pika validates file integrity:

1. Fetch gzipped file from S3
2. Calculate SHA256 hash of gzipped bytes
3. Compare to `encodedSha256Base64` in tag definition
4. Reject if hash mismatch (file tampered with)
5. Decompress and serve to browser

This prevents serving tampered files even if someone gains S3 access.

## Best Practices

- **Version your widgets**: Use versioned file names (e.g., `widgets-v1.2.3.js.gz`)
- **Test before deploying**: Use mock tags for testing
- **Monitor errors**: Check CloudWatch logs for validation failures
- **Document dependencies**: Note which tags depend on which widget files
- **Lifecycle management**: Use `status` field to deprecate old widgets
- **Reusable widgets**: Consider using `customElementName` when multiple tags can share the same underlying widget implementation - this reduces code duplication and improves loading performance
- **Custom element naming**: Follow the `${scope}.${tag}` convention in your JavaScript files when possible to avoid needing `customElementName`, but don't hesitate to use it when sharing widgets or working with legacy code

## Troubleshooting

### Hash Mismatch Error

**Cause:** File changed after tag definition was created.

**Solution:** Recalculate hash and update tag definition, or re-upload the original file.

### File Not Found

**Cause:** S3 key in tag definition doesn't match uploaded file.

**Solution:** Verify S3 key pattern: `wc/\${scope}/fileName.js.gz`

### Custom Element Not Defined

**Cause:** Web component file doesn't register the expected custom element name.

**Solution:**

1. Check what custom element name your JavaScript file defines (look for `customElements.define('element-name', ...)`).
2. If it doesn't match `${scope}.${tag}`, add `customElementName` to your tag definition's `webComponent` object.
3. Example: If your file defines `customElements.define('hello-world', ...)` but your tag is `pika.mock-widget`, add:

```js
webComponent: {
    customElementName: 'hello-world',
    // ... rest of config
}
```

### Custom Element Already Defined Error

**Cause:** Multiple tag definitions point to the same JavaScript file, and the file is being loaded multiple times, trying to define the same custom element repeatedly.

**Solution:** Add `customElementName` to all tag definitions that share the same JavaScript file:

```js
// Tag 1: pika.widget-a
webComponent: {
    customElementName: 'shared-widget', // The actual element name in the JS file
    s3: { s3Key: 'wc/pika/shared.js.gz' }
}

// Tag 2: pika.widget-b
webComponent: {
    customElementName: 'shared-widget', // Same element name
    s3: { s3Key: 'wc/pika/shared.js.gz' } // Same file
}
```

The system will load the JavaScript file once and both tags will use the same custom element definition.

## Next Steps

- [Building Web Components](/docs/developer/building-web-components) - Create your widgets
- [Tags Feature](/docs/developer/tags-feature) - Manage tag definitions
- [Web Components Overview](/docs/features/web-components) - Understand the system
