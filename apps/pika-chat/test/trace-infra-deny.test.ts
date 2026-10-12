import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

const source = readFileSync(join(__dirname, '../infra/lib/stacks/pika-chat-construct.ts'), 'utf-8').replace(/\s+/g, ' ');
const statements = source.split('new iam.PolicyStatement(').slice(1);

describe('pika-chat role trace isolation (source-text check, not synthesized)', () => {
    it('denies object access under traces/ even though the bucket is otherwise readable and writable', () => {
        const deny = statements.find((s) => s.includes('Effect.DENY') && s.includes('${pikaS3BucketArn}/traces/*'));

        expect(deny).toBeDefined();
        for (const action of ['s3:GetObject', 's3:PutObject', 's3:DeleteObject']) {
            expect(deny).toContain(`'${action}'`);
        }
    });

    it('still allows the bucket-wide grant the deny carves out of', () => {
        const allow = statements.find((s) => s.includes('Effect.ALLOW') && s.includes('${pikaS3BucketArn}/*') && s.includes("'s3:GetObject'"));

        expect(allow).toBeDefined();
    });
});
