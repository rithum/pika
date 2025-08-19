This directory houses the work in progress on allowing distributed component defintions for tags to be
registered dynamically as web components.

It will work like this...

We will create a custom cloud formation lambda function that can be used by chatapp/agent authors to
define their own custom "tags." This will take an gzipped array of `TagDefinition<T extends TagDefinitionWidgetWebComponent>`.

We will need to give them a way to upload the single javascript file they compiled their web component down to
that is first gzipped and then they will get the hash and put the hash and s3 location into the `TagDefinitionWidgetWebComponent`
they define.

That custom cloudformation resource will then populate the pika-tag-def table and that's how the system becomes aware of
their tags and can get the code for their web component so it can be run in the browser front end.

Of course, these tag definitions don't have to have a `TagDefinitionWidgetWebComponent` instead they could have a `TagDefinitionWidgetPassThrough`
which means that the LLM and the front end should just allow the tag to pass through as is and not change it in any way.

Note that there is a svelte component created to render the web components once we get to that feature.

It is in `apps/pika-chat/src/lib/client/features/chat/message-segments/default-components/wc-widget-renderer.svelte`.

The `prompt-button-wc.js` is a stab at re-creating the `prompt.svelte` tag component as a webcomponent. Mothballed here until we're ready to continue
making web components work.

The `+page.svelte` shows how to use web component (`prompt-button-wc.js`) in a svelte component.

## The tag-definition-resource custom cloudformation resource enhancements needed

1.  uploading component to s3

We will want to use this construct in CDK to facilitate the uploading of the webcomponent to s3 when we get to this

Use the BucketDeployment construct from @aws-cdk/aws-s3-deployment:
typescript// This handles deploying files to your specific bucket and prefix
new BucketDeployment(this, 'ComponentArtifacts', {
sources: [Source.asset('./component-artifacts')],
destinationBucket: myBucket,
destinationKeyPrefix: 'components/', // Your "directory"
});
Why this is better for your use case:

Works with buckets created in the same stack (no circular dependency)
Allows you to specify exact S3 prefix/directory structure
Handles file uploads during deployment automatically
Integrates properly with CloudFormation dependencies
Can reference the uploaded object locations in other resources
Supports multiple deployment sources to the same bucket

Key benefits:

Your custom CloudFormation resource can reference files at predictable S3 locations
Clean separation: bucket serves multiple purposes, components go to /components/ prefix
Proper cleanup when stack is destroyed
Versioning and rollback support

The BucketDeployment construct is specifically designed for deploying static assets to existing S3 buckets with custom prefixes, which is exactly your use case.

2. zip replacements

see `/Users/bruce.grant/dev/workspaces/opensource/pika/services/pika/src/lambda/agent-custom-resource/index.ts`

try {
agentDataStr = gunzipBase64EncodedString(agentDataGzippedHexEncoded);
console.log('Successfully decompressed AgentData, length:', agentDataStr.length);
} catch (zipErr) {
console.error('Failed to gunzip AgentData:', zipErr);
throw new Error('Failed to gunzip AgentData: ' + zipErr);
}

        let agentData = parseAgentCustomResourceProperties(agentDataStr);
        console.log('Successfully parsed AgentData for agent:', agentData.agent.agentId);

        // If the toolIdToLambdaArnMap is provided, then we need to replace the lambdaArn with the actual arn of the lambda function
        let toolIdToLambdaArnMap = event.ResourceProperties.ToolIdToLambdaArnMap as ToolIdToLambdaArnMap | undefined;
        if (toolIdToLambdaArnMap) {
            console.log('ToolIdToLambdaArnMap provided, replacing lambdaArns with actual arns', toolIdToLambdaArnMap);
            agentData.tools?.forEach((tool) => {
                if (toolIdToLambdaArnMap[tool.toolId]) {
                    console.log(`Replacing lambdaArn for tool ${tool.toolId} from ${tool.lambdaArn} to ${toolIdToLambdaArnMap[tool.toolId]}`);
                    tool.lambdaArn = toolIdToLambdaArnMap[tool.toolId];
                }
            });
        }
