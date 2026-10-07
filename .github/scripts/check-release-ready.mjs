// Fails a PR that changes CHANGELOG.md while its top version is not marked released, because auto-release only fires for a released latestVersion.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

export function checkReleaseReady({ changelog, baseChangelog, releases }) {
    if (changelog === baseChangelog) {
        return { ok: true, message: 'CHANGELOG.md unchanged; no release check needed.' };
    }
    const match = changelog.match(/^## \[(\d+\.\d+\.\d+[^\]]*)\]/m);
    if (!match) {
        return { ok: false, message: 'No versioned heading was found in CHANGELOG.md.' };
    }
    const top = match[1];
    const entry = releases.releases.find((r) => r.version === top);
    if (!entry) {
        return { ok: false, message: `CHANGELOG.md's top version ${top} has no entry in releases.json.` };
    }
    if (entry.status !== 'released' || releases.latestVersion !== top) {
        return {
            ok: false,
            message: `CHANGELOG.md's top version is ${top}, but releases.json has status "${entry.status}" and latestVersion "${releases.latestVersion}". Merging now would not create a release. On this branch run \`pnpm release:publish ${top} --non-interactive\`, commit releases.json, and push. You don't need to push the tag: auto-release creates it on merge. To merge without releasing, add the \`no-release\` label.`,
        };
    }
    return { ok: true, message: `Release ${top} is marked released.` };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const { values } = parseArgs({
        options: {
            changelog: { type: 'string', default: 'CHANGELOG.md' },
            releases: { type: 'string', default: 'releases.json' },
            'base-changelog': { type: 'string' },
        },
    });
    const changelog = readFileSync(values.changelog, 'utf8');
    const baseChangelog = values['base-changelog']
        ? readFileSync(values['base-changelog'], 'utf8')
        : execFileSync('git', ['show', `origin/${process.env.GITHUB_BASE_REF || 'main'}:CHANGELOG.md`], { encoding: 'utf8' });
    const releases = JSON.parse(readFileSync(values.releases, 'utf8'));
    const result = checkReleaseReady({ changelog, baseChangelog, releases });
    console.log(result.message);
    if (!result.ok) {
        console.log(`::error::${result.message}`);
    }
    process.exit(result.ok ? 0 : 1);
}
