import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { PikaConstruct } from '../constructs/pika-construct';
import { ConverseStrandsConstruct } from '../constructs/converse-strands-construct';
import { CustomStackDefs } from './custom-stack-defs';
import { PikaConfig, SessionInsightsFeature, UserMemoryFeature } from 'pika-shared/types/chatbot/chatbot-types';
import { interpolateStackTags, validateAndWarnTags } from '../utils/stack-tags';

export interface PikaStackProps extends cdk.StackProps {
    stage: string;
    projNameL: string; // All lowercase e.g. pika
    projNameKebabCase: string; // Kebab case e.g. pika
    projNameTitleCase: string; // Title case e.g. Pika
    projNameCamel: string; // Camel case e.g. pika
    projNameHuman: string; // Human readable e.g. Pika
    sessionInsightsFeature: SessionInsightsFeature;
    userMemoryFeature: UserMemoryFeature;
    pikaConfig: PikaConfig;
}

export class PikaStack extends cdk.Stack {
    public readonly pikaConstruct: PikaConstruct;

    constructor(scope: Construct, id: string, props: PikaStackProps) {
        super(scope, id, props);

        const customStackDefs = new CustomStackDefs(this);

        customStackDefs.addStackResoucesBeforeWeCreateThePikaConstruct();

        // Process stack tags for use in custom resources
        const processedTags = this.processStackTags(props, customStackDefs);

        // Create the chatbot construct with all the infrastructure
        this.pikaConstruct = new PikaConstruct(
            this,
            `${props.projNameTitleCase}Construct`,
            customStackDefs.getPikaConstructProps({
                stage: props.stage,
                stackName: this.stackName,
                region: this.region,
                account: this.account,
                projNameL: props.projNameL,
                projNameKebabCase: props.projNameKebabCase,
                projNameTitleCase: props.projNameTitleCase,
                projNameCamel: props.projNameCamel,
                projNameHuman: props.projNameHuman,
                sessionInsightsFeature: props.sessionInsightsFeature,
                userMemoryFeature: props.userMemoryFeature,
                stackTags: processedTags,
                componentTagNames: props.pikaConfig.stackTags?.componentTagNames,
                accountIdFieldNames: props.pikaConfig.accountIdFieldNames
            })
        );

        // Optional Strands (Python) converse Lambda — opt in via pika-config
        if (props.pikaConfig.siteFeatures?.strandsConverse?.enabled) {
            new ConverseStrandsConstruct(this, 'ConverseStrands', {
                projNameKebabCase: props.projNameKebabCase,
                stage: props.stage,
                pikaOutputs: this.pikaConstruct.outputs
            });
        }

        customStackDefs.addStackResoucesAfterWeCreateThePikaConstruct();

        // Apply stack tags if configured
        this.applyStackTags(props, customStackDefs);
    }

    private processStackTags(props: PikaStackProps, customStackDefs: CustomStackDefs): Record<string, string> | undefined {
        const stackTagsConfig = props.pikaConfig.stackTags;

        if (!stackTagsConfig) {
            // No tags configured
            return undefined;
        }

        // Merge common tags with service-specific tags (service tags overwrite on conflict)
        const mergedTags = {
            ...(stackTagsConfig.common || {}),
            ...(stackTagsConfig.pikaServiceTags || {})
        };

        if (Object.keys(mergedTags).length === 0) {
            // No tags to apply
            return undefined;
        }

        // Interpolate dynamic placeholders
        let tags = interpolateStackTags(mergedTags, {
            stage: props.stage,
            accountId: this.account,
            region: this.region,
            pikaConfig: props.pikaConfig
        });

        // Allow custom modifications via hook
        tags = customStackDefs.modifyStackTags(tags, props.stage);

        return tags;
    }

    private applyStackTags(props: PikaStackProps, customStackDefs: CustomStackDefs): void {
        const tags = this.processStackTags(props, customStackDefs);

        if (!tags) {
            // No tags to apply
            return;
        }

        // Validate and warn about invalid tags
        validateAndWarnTags(tags, this.stackName);

        // Apply tags to all resources in the stack
        for (const [key, value] of Object.entries(tags)) {
            cdk.Tags.of(this).add(key, value);
        }

        console.log(`Applied ${Object.keys(tags).length} tag(s) to stack ${this.stackName}`);
    }
}
