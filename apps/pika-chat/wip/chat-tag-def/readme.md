# Chat Tag Def

The pika framework allows for the specification of tags that can be returned by either the agent LLM or a developer's tool that is invoked by an agent LLM.

This mini-project is about formalizing these tag definitions.

## Phase I

Define the infrastructure for a new dynamodb table named `pika-tag-def`. This will house all the tag definitions. Each record will be of type

`TagDefinition` found in `/Users/bruce.grant/dev/workspaces/opensource/pika/packages/shared/src/types/chatbot/chatbot-types.ts`.

The CDK to add to is in `/Users/bruce.grant/dev/workspaces/opensource/pika/services/pika/lib/constructs/pika-construct.ts`.

There are numerous other dynamodb tables already defined whose pattern you can copy from.

The primary key for the new `pika-tag-def` table should be hash key: `scope` and sort key `tag`.

The table should follow the existing naming pattern: `pika-tag-def-${this.props.stackName}` to be consistent with other tables.

No GSI (Global Secondary Indexes) are needed for this table.

Note: Table scanning this table as a base way of querying it is acceptable since typically there will be around 10 tags in this table and even the largest installations won't have more than a few hundred tag definitions.

## Phase II

### Task 1

We will need a set of new admin APIs for managing tag definitions. The file that has the handlers for the APIs is in
`/Users/bruce.grant/dev/workspaces/opensource/pika/services/pika/src/api/chat-admin/index.ts`.

We will need to add these handlers

```typescript
// An idempotent method that first retrieves the tag in question and if not there inserts it and if there replaces it with the new tag definition
// we don't need fancy diffing.  Just completely overwrite the tag defintion if already there following appropriate dynamodb best practices.
// see types: TagDefinitionCreateOrUpdateRequest and TagDefinitionCreateOrUpdateResponse
'POST:/api/chat-admin/tagdef': {
        handler: handleCreateOrUpdateTagDef
    },

// Delete a tagdef.  Here's the posted request type (TagDefinitionDeleteRequest) and the response type (TagDefinitionDeleteResponse)
'DELETE:/api/chat-admin/tagdef': {
        handler: handleDeleteTagDef
    },

// Search for tag defs
// see comment on TagDefinitionSearchRequest and TagDefinitionSearchResponse
'POST:/api/chat-admin/tagdef/search': {
        handler: handleGetTagDefs
    },
```

### Task 2

We will need a single new API to allow the front end to get the list of enabled tag definitions. This doesn't require admin privileges
and so goes in `/Users/bruce.grant/dev/workspaces/opensource/pika/services/pika/src/api/chatbot/index.ts`.

We will need to add these handlers

```typescript

// Search for tag definitions
// After the search, filter out any disabled definitions since this is for non-admin use
// This filtering should happen at the DynamoDB level since we can tell whether you came in through the chat api (normal user) or admin api (admin).
// When we call into our ddb query, we pass in whether we want to include disabled or not accordingly.
// see comment on TagDefinitionSearchRequest and TagDefinitionSearchResponse
'POST:/api/chat/tagdef/search': {
        handler: handleGetTagDefs
    },

```

Note: Use the default pagination settings without allowing users to change page size. If the query returns more pages, return the pagination key.

### Task 3

Update the infrastructure in `/Users/bruce.grant/dev/workspaces/opensource/pika/services/pika/lib/constructs/pika-construct.ts` to include the new API gateway APIs described above.

### Task 4

Ensure proper DynamoDB permissions are granted to different services:

- **ECS Container**: The frontend infrastructure CDK is in `/Users/bruce.grant/dev/workspaces/opensource/pika/apps/pika-chat/infra/lib/stacks/pika-chat-construct.ts`. There is an ECS container used to deploy the SvelteKit frontend and backend website. This ECS container should be given read/write/delete/scan permissions for the new `pika-tag-def` table and all future indices. We will also want to pass into the ecs container the table name as an environment variable.

- **Chat API Lambda**: The API Gateway functions are all lambdas whose infrastructure is defined in `/Users/bruce.grant/dev/workspaces/opensource/pika/services/pika/lib/constructs/pika-construct.ts`. The chat API lambda should be given read/scan/readonly permissions for the new table and all future indices. We will also want to pass into the lambda the table name as an environment variable

- **Chat Admin API Lambda**: The chat admin API lambda should be given full permissions (read, write, scan, delete, etc.) for the new table and all future indices. We will also want to pass into the lambda the table name as an environment variable

We will also want to update `/Users/bruce.grant/dev/workspaces/opensource/pika/apps/pika-chat/src/lib/server/config.ts` to allow the retrieval of the new table name via the environment variable.

### Task 5

Update the front end webapp so it has what it needs to be able to query these new API Gateway APIs.

This file will need to be updated to have a new member `tagDefs: TagDefinition<TagDefinitionWidget>[]` (note: should be an array)

`/Users/bruce.grant/dev/workspaces/opensource/pika/apps/pika-chat/src/lib/client/features/chat/chat-app.state.svelte.ts`

The one instance of this state object gets created in `/Users/bruce.grant/dev/workspaces/opensource/pika/apps/pika-chat/src/routes/(auth)/chat/[chatAppId]/+layout.svelte`. We are going to
want to make sure that the tag definitions that the user is allowed to see are passed into +layout.svelte from this file

`/Users/bruce.grant/dev/workspaces/opensource/pika/apps/pika-chat/src/routes/(auth)/chat/[chatAppId]/+layout.server.ts`

So in +layout.server.ts we will need to call the non-admin version of the tag defs search and page through the results to collect up all the tag defs so we can pass them into the +layout.svelte.
We do not want instructions on these since we just need the tag definitions themselves.

Then in the +layout.svelte we will want to pass the tag defs to the appState.addChatApp function and then in that function modify the constructor here to take the tag defs as a new parameter and then
set them in the private member variable and also create a getter for the private variable.

```typescript
this.#chatApps[chatApp.chatAppId] = new ChatAppState(
    this.fetchz,
    chatApp,
    this.#page,
    this,
    componentRegistry,
    userDataOverrideSettings,
    userIsContentAdmin,
    features,
    customDataUiRepresentation,
    mode,
    tagDefinitions // <- new parameter
);
```

Note: Tag definitions are independent from the ChatApp object which comes from a different DynamoDB table.

We will want to create the SvelteKit server side methods to call our API Gateway endpoints in
`/Users/bruce.grant/dev/workspaces/opensource/pika/apps/pika-chat/src/lib/server/chat-admin-apis.ts` and
`/Users/bruce.grant/dev/workspaces/opensource/pika/apps/pika-chat/src/lib/server/chat-apis.ts`

We are going to want to add an LRU cache (pattern for this is present in chat-admin-apis.ts) in both the chat-admin-apis.ts and chat-apis.ts for tag definitions.

We are going to need to cache hashes of queries and the responses intelligently. See chat-admin-apis.ts#getMatchingChatApps for what I'm talking about. Since
each individual tag definition has a `dontCacheThis` that could be set, we need to deal with the cache in an intelligent manner.

Cache invalidation: Implement cache invalidation when tag definitions are updated via admin APIs, but only on the admin API side. Don't bother with cache invalidation on the non-admin API side.

### Task 6

We will need to enhance our admin website to allow it to get all tag definitions using the admin API (returns all even if disabled) and explicitly tell the search
to include instructions so we can show them in the admin API frontend.

At the site wide level, someone who creates a fork of pika using the pika CLI tool can in their pika-config.ts file tell us which features they want to turn on.
They can also expressly state which tags they want enabled so a chat app doesn't have to override them if he just wants the defaults.

Chat app authors must explicitly state which tag definitions they want to enable in their chat apps if they want them to differ from the default setup in the site wide
config.

In `/Users/bruce.grant/dev/workspaces/opensource/pika/packages/shared/src/types/chatbot/chatbot-types.ts`
you will find SiteFeatures where I've added a new site feature named `tags?: TagsSiteFeature;` and you will also find 'tags' in `ChatAppOverridableFeatures`.

Here's the type in question

```typescript
export interface TagsSiteFeature {
    /**
     * Whether to enable the tags feature. If this is turned off you will lost a lot of the functionality of the chat app.
     */
    enabled: boolean;

    /**
     * The tag definitions that are enabled by default.  If not provided, then no tag definitions are enabled.
     * Each chat app can override this list by providing its own list of tagsEnabled in its chat app config.
     */
    tagsEnabled?: TagDefinitionLite[];

    /**
     * The tag definitions that are prohibited by default.  If not provided, then no tag definitions are prohibited.
     * Chat apps may not override this list.
     */
    tagsProhibited?: TagDefinitionLite[];
}
```

I have also added to the ChatAppFeature type TagsFeatureForChatApp and I also updated FeatureIdList to have `tags`.

I need your help to enhance the `/Users/bruce.grant/dev/workspaces/opensource/pika/apps/pika-chat/src/lib/client/features/site-admin/site-admin.state.svelte.ts`
to have the ability to get all tag defs, create/update tag defs and to delete tag defs. You will do that by enhancing this function

`async sendSiteAdminCommand(request: SiteAdminRequest) {`

and then updating the corresponding server side file here: `/Users/bruce.grant/dev/workspaces/opensource/pika/apps/pika-chat/src/routes/(auth)/api/site-admin/+server.ts`

I will also need your help to update the UI to support the viewing, editing and deletion of tag definitions including their instructions. This UI needs to be robust
and complete. The structure of the instructions is made fool proof so the user can't mess things up with markdown formatting. The types in `chatbot-types.ts` include comprehensive comments above the types. For example, in `TagDefinition<T extends TagDefinitionWidget>` above the `llmInstructions` you will find excellent documentation on the structure of what they are meant to create for instructions. The UI should provide a means for them to create the first markdown lines and then a way to create a new block and then the lines in the block and the ability to have a title have a line and you should show an overall preview out to the right like we do in many other of these feature renderer components. You should review the feature renderer components when you go to actually do this task to find the patterns to follow.

Review the UI patterns you will find in `/Users/bruce.grant/dev/workspaces/opensource/pika/apps/pika-chat/src/lib/client/features/site-admin/components`
to see the ui component patterns and widgets to use and follow.

Note we are using svelte 5 which means components should have

```typescript
interface Props {
    ...
}
let { ... }: Props = $props();
```

and event handlers are not `on:click` but `onclick` and that we should use `$effect` and `$derived` and `$derived.by` as appropriate.

You will need to update `/Users/bruce.grant/dev/workspaces/opensource/pika/apps/pika-chat/src/lib/client/features/site-admin/components/chat-apps/features/features.svelte`
to include our tags feature. The feature should be exposed in this features.svelte file. You will notice that each feature has a block - add the tags feature to the list of features to be enabled/disabled and configured.

You will need to create a new tags-feature-renderer.svelte component and perhaps also a tag-renderer.svelte component in
`/Users/bruce.grant/dev/workspaces/opensource/pika/apps/pika-chat/src/lib/client/features/site-admin/components/chat-apps/features`.

### Task 7

Update documentation website docs located in `/Users/bruce.grant/dev/workspaces/opensource/pika/apps/pika-docs/src/routes/docs`.

**Features Documentation:**
Create a new directory in `features` named `ai-driven-ui`. Then in the body of the page the title should be `AI Driven UI (tags)`.

Specifically, please mention that pika includes advanced widgets that can render inline in the body of the chat response from the LLM.
Note that this is to support a shift away from canned UI experiences to UI experiences that materialize in the moment guided by
the LLM. Give examples of our built-in chart component. Explain that chat app authors can define their own ui widgets which
can then be rendered by the UI in the flow of the chat session and give examples of widgets authors might want to create (perhaps one to represent an
order graphically, or allow the user to get a Create Product Definition form inline in the chat session or something.)

**Developer Documentation:**
Create a corresponding doc in `developer` named `tags-feature` and explain everything about the fact that we have built in tags and that
they need to be enabled in the site wide pika-config.ts. Note that soon they will be able to use web components to define their own tags (infer what this means by looking at type TagDefinitionWebComponent) and
that the tags available for use can be overridden at the chat app level.

The documentation should include:

- Developer guides for creating custom tags
- Examples of the built-in tag structures
- Best practices for LLM instruction formatting

Search for other docs in the `developer` directory that
might need to be updated to talk about this new feature such as the `customization` doc which could then link over to this new doc.

## Phase III

This phase is to both document the agent instruction assistance feature and to modify the admin website to allow the admin to override the `agentInstructionAssistance` feature at the chat app level.

### Task 1: Agent Instruction Assistance Documentation

Create documentation for the Agent Instruction Assistance feature in the documentation website:

**Features Documentation:**
Create a new document in `/Users/bruce.grant/dev/workspaces/opensource/pika/apps/pika-docs/src/routes/docs/features/` named `instruction-assistance` with the page title `Agent Instruction Assistance`.

This should document the `AgentInstructionAssistanceFeature` that allows automatic injection of formatting instructions into agent prompts, including:

- How the `{{tag-instructions}}` placeholder works
- How tag definitions get injected into prompts
- The relationship between the tags feature and instruction assistance
- Examples of how the output formatting requirements are structured

**Developer Documentation:**
Create a corresponding technical doc in `/Users/bruce.grant/dev/workspaces/opensource/pika/apps/pika-docs/src/routes/docs/developer/` named `instruction-assistance` with the same doc title that documents the `AgentInstructionAssistanceFeature` type and its usage.

### Task 2: Admin UI for Agent Instruction Assistance Feature Override

Update the admin site to allow viewing and overriding of the `agentInstructionAssistance` feature at the chat app level. This is similar to Phase II Task 6 but for the instruction assistance feature.

You will need to:

1. Update `/Users/bruce.grant/dev/workspaces/opensource/pika/apps/pika-chat/src/lib/client/features/site-admin/site-admin.state.svelte.ts` to handle agent instruction assistance feature management in the `sendSiteAdminCommand` function.

2. Update `/Users/bruce.grant/dev/workspaces/opensource/pika/apps/pika-chat/src/routes/(auth)/api/site-admin/+server.ts` to handle the server-side processing.

3. Create UI components in `/Users/bruce.grant/dev/workspaces/opensource/pika/apps/pika-chat/src/lib/client/features/site-admin/components/chat-apps/features/` for managing the agent instruction assistance feature configuration, including:

    - Toggle for enabling/disabling the feature
    - Configuration for `includeInstructionsForTags`
    - Settings for `completeExampleInstructionLine`
    - Settings for `jsonOnlyImperativeInstructionLine`

4. Update `/Users/bruce.grant/dev/workspaces/opensource/pika/apps/pika-chat/src/lib/client/features/site-admin/components/chat-apps/features/features.svelte` to include the agent instruction assistance feature renderer.

Follow the same patterns and UI conventions as established in Phase II Task 6, using Svelte 5 syntax with `$props()`, `onclick` handlers, and `$effect`/`$derived` as appropriate.

## Phase IV

### Task 1

We now need to make it so the CDK build process for the pika-chat front end can discover the tags that are being compiled into the front end proper.

In our types file here `/Users/bruce.grant/dev/workspaces/opensource/pika/packages/shared/src/types/chatbot/chatbot-types.ts` we find the type `TypeDefinition` which
has a widget.type with these possible values: `export type TagDefinitionWidgetType = 'pass-through' | 'pika-compiled-in' | 'custom-compiled-in' | 'web-component';`.

We need to make it so when we deploy the `pika-chat` front end stack that we idempotently create/update the 'pika-compiled-in' and 'custom-compiled-in' tag definitions
in the `pika-tag-def` dynamodb table as part of our deployment to AWS. How will we do that?

We have used the custom cloudformation resource pattern repeatedly and will do so again here in the back end pika service stack. The custom cloudformation lambdas that exist already are located in `/Users/bruce.grant/dev/workspaces/opensource/pika/services/pika/src/lambda`. We should add one here named `tag-definition-resource`. We can copy the
patterns established in the agent-custom-resource custom cloudformation lambda resource here: `/Users/bruce.grant/dev/workspaces/opensource/pika/services/pika/src/lambda/agent-custom-resource/index.ts`. The lambda function will need these environment variables: CHAT_ADMIN_API_ID, AWS_REGION, STAGE.
The inputs for this custom cloudformation resource should be:

- TagDefData: a gzipped hex encoded string that is the JSON.stringified version of `TagDefinitionForCreateOrUpdate<TagDefinitionWidgetPikaCompiledIn | TagDefinitionWidgetCustomCompiledIn>`
- Stage: the stage being run within (lower case as in test or prod)

The infrastructure for this new lambda should be defined here: `/Users/bruce.grant/dev/workspaces/opensource/pika/services/pika/lib/constructs/pika-construct.ts`. Copy the
`private createAgentCustomResource(chatAdminRestApi: apigateway.RestApi): void {` function for defining the resources needed. Note that this lambda will need permissions to be able to invoke the admin apis.

This custom cloudformation resource lambda should use the admin api gateway APIs to call `handleCreateOrUpdateTagDef` and `handleDeleteTagDef` APIs defined in `/Users/bruce.grant/dev/workspaces/opensource/pika/services/pika/src/api/chat-admin/index.ts` and you can find the API signatures above those methods as in

```typescript
/**
 * POST:/api/chat-admin/tagdef
 */

/**
 * DELETE:/api/chat-admin/tagdef
 */
```

Again, reference the `/Users/bruce.grant/dev/workspaces/opensource/pika/services/pika/src/lambda/agent-custom-resource/index.ts` as it calls admin APIs also.

### Task 2

Now that the backend custom cloudformation is defined we now need to use it. Here's the parts of this...

#### Task 2.a

We need to collect up all the tag definition files that have been created to represent the tag widget components that are compiled into the front end. We need to do this when we are going to build the front end project. Then in the CDK that builds the front end pika-chat project we can collect up all these definitions and create a custom cloudformation resource that represents each one. Note we are going to need to gzip hex encode the JSON data. Note that each tag-definition file referenced below is a typescript file but see this that is a comment in each file:

```typescript
/**
 * Do not include any other imports in this file.  It is typescript only to give you the type of the tag definition.
 * Think of it is a json object.  You must return  `TagDefinitionForCreateOrUpdate<TagDefinitionWidgetPikaCompiledIn>`
 * as the default export.
 */
```

Add a new typescript tool in `/Users/bruce.grant/dev/workspaces/opensource/pika/apps/pika-chat/tools` named `generate-tag-defs-for-build` and then have this called anytime we build the project in `/Users/bruce.grant/dev/workspaces/opensource/pika/apps/pika-chat/package.json` (just have our tool called in scripts.build) that will do the following:

- find all tag definitions files in `/Users/bruce.grant/dev/workspaces/opensource/pika/apps/pika-chat/src/lib/client/features/chat/message-segments/default-components` and `/Users/bruce.grant/dev/workspaces/opensource/pika/apps/pika-chat/src/lib/client/features/chat/message-segments/custom-components` whose name starts with `tag-definition` and ends with `.ts` as in `/Users/bruce.grant/dev/workspaces/opensource/pika/apps/pika-chat/src/lib/client/features/chat/message-segments/default-components/tag-definition-chart.ts`.
- get the JSON definitions for each tag definition file as JSON
- extract the scope and tag attributes from each and then gzip compress and hex encode the json object and create a file in `/Users/bruce.grant/dev/workspaces/opensource/pika/apps/pika-chat/infra/build` that is an array of the found tag definitions (tag, scope, gzippedHexEncodedString) named `tag-definitions.json` and then modify the `/Users/bruce.grant/dev/workspaces/opensource/pika/apps/pika-chat/infra/bin/pika-chat.ts` to import this data. Note I have already added the import for the type that this file should have in pika-chat.ts with this `import { TagDefinitionsJsonFile } from 'pika-shared/types/chatbot/chatbot-types.js';`. Be sure to check if that build directory exists and if not cause it to be created.

Here's the type in question:

```typescript
export interface TagDefinitionsJsonFile {
    tagDefs: TagDefInJsonFile[];
}

export interface TagDefInJsonFile {
    tag: string;
    scope: string;
    gzippedHexEncodedString: string;
}
```

#### Task 2.b

Now we need to iterate through the contents of the `/Users/bruce.grant/dev/workspaces/opensource/pika/apps/pika-chat/infra/build/tag-definitions.json` file that we imported in the cdk file and then create a new custom cloudformation resource for each in `/Users/bruce.grant/dev/workspaces/opensource/pika/apps/pika-chat/infra/lib/stacks/pika-chat-construct.ts`.
