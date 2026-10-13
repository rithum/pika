import { readFileSync } from 'fs';
import { join } from 'path';

const CONSTRUCTS = join(__dirname, '../../lib/constructs');
const read = (file: string) => readFileSync(join(CONSTRUCTS, file), 'utf-8').replace(/\s+/g, ' ');

const pika = read('pika-construct.ts');
const converse = read('converse-strands-construct.ts');

function between(source: string, start: string, end: string): string {
    const from = source.indexOf(start);
    expect(from).toBeGreaterThanOrEqual(0);
    const to = source.indexOf(end, from + start.length);
    return source.slice(from, to === -1 ? undefined : to);
}

const TRACES_ARN = '${pikaS3Bucket.bucketArn}/traces/*';

function grantsOnTraces(section: string, action: string): boolean {
    const statements = section.split('new iam.PolicyStatement(').slice(1);
    return statements.some((s) => s.includes(`actions: ['${action}']`) && s.includes(TRACES_ARN) && s.includes('Effect.ALLOW'));
}

describe('trace offload infrastructure (source-text checks, not synthesized)', () => {
    it('lets the converse-strands role put objects under traces/', () => {
        expect(converse).toMatch(/actions: \['s3:PutObject'\], resources: \[`\$\{pikaOutputs\.pikaS3Bucket\.bucketArn\}\/traces\/\*`\]/);
    });

    it('lets the chatbot API role get objects under traces/', () => {
        const section = between(pika, "new iam.Role(this, 'PikaLambdaRole'", "new nodejs.NodejsFunction(this, 'ChatbotApiFunction'");
        expect(grantsOnTraces(section, 's3:GetObject')).toBe(true);
    });

    it('lets the insights runner role get objects under traces/', () => {
        const section = between(pika, "new iam.Role(this, 'SessionInsightsRunnerLambdaRole'", 'new nodejs.NodejsFunction');
        expect(grantsOnTraces(section, 's3:GetObject')).toBe(true);
    });

    it('expires objects under traces/ after 400 days', () => {
        expect(pika).toMatch(/id: 'ExpireOffloadedTraces', enabled: true, prefix: 'traces\/', expiration: cdk\.Duration\.days\(400\)/);
    });

    it('sets PIKA_S3_BUCKET on the chatbot API function', () => {
        const section = between(pika, "new nodejs.NodejsFunction(this, 'ChatbotApiFunction'", 'new nodejs.NodejsFunction');
        expect(section).toContain('PIKA_S3_BUCKET: pikaS3Bucket.bucketName');
    });
});
