import { Client } from '@opensearch-project/opensearch';
import OsClient from './opensearch-client';
import { DomainIndex, GeneralError, getIndexMeta } from './types';

/**
 * Create the index if it's not there.
 *
 * @param domainEndpoint
 * @param indexName
 * @returns True if we had to create it, false if it existed already.
 */
export async function ensureDomainExists(indexName: DomainIndex, options?: { dryRun?: boolean }): Promise<boolean> {
    const dryRun = options?.dryRun === true;
    console.log(`Ensuring ${indexName} index exists${dryRun ? ' (dry run)' : ''}`);

    let result = false;
    const client = await OsClient.getClient(undefined);

    const meta = getIndexMeta(indexName);
    const exists = await domainExists(indexName, client);

    if (!exists) {
        if (dryRun) {
            console.log(`Index ${meta.name} does not exist. Would create with body: ${JSON.stringify(meta.indexCreateBody)}`);
        } else {
            try {
                const createResp = await client.indices.create({ index: meta.name, body: meta.indexCreateBody });
                if (createResp.statusCode !== 200) {
                    console.error(`OpenSearch failed to create ${meta.name} index: ${JSON.stringify(createResp, null, 4)}`);
                    throw new GeneralError(`OpenSearch failed to create ${meta.name} index: ${JSON.stringify(createResp, null, 4)}`);
                } else {
                    /* created default index for domain */
                }
                result = true;
            } catch (ex) {
                if (ex instanceof Error) {
                    console.error(`Failed to create ${meta.name} index: ${ex.message} ${ex.stack}`);
                } else {
                    console.error(`Failed to create ${meta.name} index: ${ex}`);
                }
                throw new GeneralError(`Failed to create ${meta.name} index: ${ex} ${ex instanceof Error ? `${ex.message} ${ex.stack}` : ''}`);
            }
        }
    } else {
        // Index exists; verify mappings are up to date (additive changes only)
        try {
            const desiredMappings = (meta.indexCreateBody as any).mappings ?? {};
            const getMappingResp = await client.indices.getMapping({ index: meta.name });
            const respBody = (getMappingResp as any).body ?? getMappingResp; // client versions differ on where body lives
            const currentMappings = respBody?.[meta.name]?.mappings ?? respBody?.mappings ?? {};

            const diff = computeAdditiveMappingDiff(desiredMappings, currentMappings);

            if (diff.incompatibleReasons.length > 0) {
                console.warn(`Detected non-additive mapping differences for index ${meta.name}. Will NOT update mappings. Reasons: \n- ${diff.incompatibleReasons.join('\n- ')}`);
                // Detailed diffs for debugging
                const details = (diff as unknown as { incompatibleDetails?: Array<{ path: string; desired: any; current: any; reason: string }> }).incompatibleDetails ?? [];
                for (const d of details) {
                    console.warn(`Path: ${d.path}\nReason: ${d.reason}\nDesired: ${JSON.stringify(d.desired, null, 2)}\nCurrent: ${JSON.stringify(d.current, null, 2)}`);
                }
            } else if (isEmpty(diff.additivePutBody)) {
                console.log(`Index ${meta.name} mappings are up to date.`);
            } else {
                if (dryRun) {
                    console.log(`Index ${meta.name} requires additive mapping updates. Would call putMapping with body: ${JSON.stringify(diff.additivePutBody)}`);
                } else {
                    const putResp = await client.indices.putMapping({ index: meta.name, body: diff.additivePutBody });
                    if (putResp.statusCode !== 200) {
                        console.error(`OpenSearch failed to update ${meta.name} mappings: ${JSON.stringify(putResp, null, 4)}`);
                        throw new GeneralError(`OpenSearch failed to update ${meta.name} mappings: ${JSON.stringify(putResp, null, 4)}`);
                    }
                    console.log(`Updated ${meta.name} mappings with additive changes.`);
                }
            }
        } catch (ex) {
            if (ex instanceof Error) {
                console.error(`Failed to verify/update mappings for ${meta.name}: ${ex.message} ${ex.stack}`);
            } else {
                console.error(`Failed to verify/update mappings for ${meta.name}: ${ex}`);
            }
            // Do not throw; mapping update is best-effort during ensure step
        }
    }

    return result;
}

export async function domainExists(indexName: DomainIndex, client?: Client): Promise<boolean> {
    try {
        console.log(`Checking if ${indexName} index exists`);
        client = client ?? (await OsClient.getClient(undefined));
        const meta = getIndexMeta(indexName);
        const resp = await client.indices.exists({ index: meta.name });
        console.log(`Response to check if ${indexName} index exists: ${resp.body}`);
        return resp.body;
    } catch (ex) {
        if (ex instanceof Error) {
            console.error(`in domainExists function and got exception: ${ex.message} ${ex.stack}`);
            console.error(`indexName: ${indexName}`);
            console.error(`err: ${ex}`);
        } else {
            console.error(`in domainExists function and got unknown err: ${ex}`);
        }
        throw ex;
    }
}

/**
 * Compute an additive-only diff between desired mappings and current mappings. If any non-additive
 * (breaking) differences are detected, they are collected in incompatibleReasons and no updates
 * should be applied. Otherwise, additivePutBody contains a minimal body suitable for a single
 * indices.putMapping call to add missing properties and/or append missing dynamic templates.
 */
function computeAdditiveMappingDiff(
    desiredMappings: any,
    currentMappings: any
): {
    incompatibleReasons: string[];
    incompatibleDetails: Array<{ path: string; desired: any; current: any; reason: string }>;
    additivePutBody: Record<string, unknown>;
} {
    const incompatibleReasons: string[] = [];
    const incompatibleDetails: Array<{ path: string; desired: any; current: any; reason: string }> = [];
    const putBody: Record<string, unknown> = {};

    // Handle dynamic_templates (append-only)
    const desiredTemplates: any[] = Array.isArray(desiredMappings?.dynamic_templates) ? desiredMappings.dynamic_templates : [];
    const currentTemplates: any[] = Array.isArray(currentMappings?.dynamic_templates) ? currentMappings.dynamic_templates : [];

    const desiredTemplateMap = toNamedTemplateMap(desiredTemplates);
    const currentTemplateMap = toNamedTemplateMap(currentTemplates);

    const templatesToAdd: any[] = [];
    for (const [name, tmpl] of Object.entries(desiredTemplateMap)) {
        if (!(name in currentTemplateMap)) {
            templatesToAdd.push({ [name]: tmpl });
        } else if (!deepEqual(tmpl, (currentTemplateMap as any)[name])) {
            const reason = `dynamic_template '${name}' differs from current (non-additive change).`;
            incompatibleReasons.push(reason);
            incompatibleDetails.push({ path: `dynamic_templates.${name}`, desired: tmpl, current: (currentTemplateMap as any)[name], reason });
        }
    }

    // If we have templates to add, we need to include the full combined list in putMapping
    if (templatesToAdd.length > 0) {
        putBody.dynamic_templates = [...currentTemplates, ...templatesToAdd];
    }

    // Handle properties (recursive, append-only)
    const desiredProps = desiredMappings?.properties ?? {};
    const currentProps = currentMappings?.properties ?? {};
    const propsAdditions = computeAdditivePropertiesDiff(desiredProps, currentProps, [], incompatibleReasons, incompatibleDetails);
    if (!isEmpty(propsAdditions)) {
        putBody.properties = propsAdditions;
    }

    return { incompatibleReasons, incompatibleDetails, additivePutBody: putBody };
}

function computeAdditivePropertiesDiff(
    desiredProps: Record<string, any>,
    currentProps: Record<string, any>,
    path: string[],
    incompatibleReasons: string[],
    incompatibleDetails: Array<{ path: string; desired: any; current: any; reason: string }>
): Record<string, any> {
    const additions: Record<string, any> = {};

    for (const [field, desiredDef] of Object.entries(desiredProps)) {
        const currentDef = currentProps[field];

        if (!currentDef) {
            additions[field] = desiredDef;
            continue;
        }

        const fieldPath = [...path, field].join('.');
        const desiredHasProps = desiredDef && typeof desiredDef === 'object' && 'properties' in desiredDef;
        const currentHasProps = currentDef && typeof currentDef === 'object' && 'properties' in currentDef;

        if (desiredHasProps || currentHasProps) {
            // Types must match if specified
            const desiredType = desiredDef?.type;
            const currentType = currentDef?.type;
            if (desiredType !== undefined && currentType !== undefined && desiredType !== currentType) {
                const reason = `Field '${fieldPath}' type differs (desired: ${desiredType}, current: ${currentType}).`;
                incompatibleReasons.push(reason);
                incompatibleDetails.push({ path: fieldPath, desired: desiredDef, current: currentDef, reason });
                continue;
            }

            const childDesiredProps = (desiredDef?.properties ?? {}) as Record<string, any>;
            const childCurrentProps = (currentDef?.properties ?? {}) as Record<string, any>;
            const childAdditions = computeAdditivePropertiesDiff(childDesiredProps, childCurrentProps, [...path, field], incompatibleReasons, incompatibleDetails);
            if (!isEmpty(childAdditions)) {
                // Preserve type if present, and only add the missing children
                additions[field] = {
                    ...(desiredType ? { type: desiredType } : {}),
                    properties: childAdditions
                };
            }
        } else {
            // Leaf mapping; must be identical to be considered compatible
            if (!deepEqual(desiredDef, currentDef)) {
                const reason = `Field '${fieldPath}' differs from current mapping (non-additive change).`;
                incompatibleReasons.push(reason);
                incompatibleDetails.push({ path: fieldPath, desired: desiredDef, current: currentDef, reason });
            }
        }
    }

    return additions;
}

function toNamedTemplateMap(templates: any[]): Record<string, any> {
    const map: Record<string, any> = {};
    for (const t of templates) {
        if (t && typeof t === 'object') {
            const [name, def] = Object.entries(t)[0] ?? [];
            if (name && def) {
                map[name] = def;
            }
        }
    }
    return map;
}

function isEmpty(obj: unknown): boolean {
    return !obj || (typeof obj === 'object' && Object.keys(obj as Record<string, unknown>).length === 0);
}

function deepEqual(a: any, b: any): boolean {
    if (a === b) return true;
    if (typeof a !== typeof b) return false;
    if (a === null || b === null) return a === b;
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (!deepEqual(a[i], b[i])) return false;
        }
        return true;
    }
    if (typeof a === 'object' && typeof b === 'object') {
        const aKeys = Object.keys(a).sort();
        const bKeys = Object.keys(b).sort();
        if (!deepEqual(aKeys, bKeys)) return false;
        for (const key of aKeys) {
            if (!deepEqual(a[key], b[key])) return false;
        }
        return true;
    }
    return false;
}
