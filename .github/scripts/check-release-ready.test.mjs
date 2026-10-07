import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkReleaseReady } from './check-release-ready.mjs';

const base = '# Changelog\n\n## [0.29.4] - 2026-10-01\n';
const changed = '# Changelog\n\n## [0.29.5] - 2026-10-06\n\n## [0.29.4] - 2026-10-01\n';

const releasesWith = (status, latestVersion) => ({
    latestVersion,
    releases: [
        { version: '0.29.5', status },
        { version: '0.29.4', status: 'released' },
    ],
});

test('unchanged CHANGELOG needs no check', () => {
    const result = checkReleaseReady({ changelog: base, baseChangelog: base, releases: releasesWith('unreleased', '0.29.4') });
    assert.equal(result.ok, true);
});

test('changed CHANGELOG with released top and matching latestVersion passes', () => {
    const result = checkReleaseReady({ changelog: changed, baseChangelog: base, releases: releasesWith('released', '0.29.5') });
    assert.equal(result.ok, true);
});

test('changed CHANGELOG with unreleased top fails', () => {
    const result = checkReleaseReady({ changelog: changed, baseChangelog: base, releases: releasesWith('unreleased', '0.29.5') });
    assert.equal(result.ok, false);
    assert.ok(result.message.includes('release:publish 0.29.5'));
});

test('released status with latestVersion behind fails', () => {
    const result = checkReleaseReady({ changelog: changed, baseChangelog: base, releases: releasesWith('released', '0.29.4') });
    assert.equal(result.ok, false);
});

test('top version missing from releases.json fails', () => {
    const releases = { latestVersion: '0.29.4', releases: [{ version: '0.29.4', status: 'released' }] };
    const result = checkReleaseReady({ changelog: changed, baseChangelog: base, releases });
    assert.equal(result.ok, false);
});

test('Unreleased heading above a released version is skipped', () => {
    const changelog = '# Changelog\n\n## [Unreleased]\n\n## [0.29.5] - 2026-10-06\n';
    const result = checkReleaseReady({ changelog, baseChangelog: base, releases: releasesWith('released', '0.29.5') });
    assert.equal(result.ok, true);
});

test('no versioned heading fails', () => {
    const result = checkReleaseReady({ changelog: '# Changelog\n\n## [Unreleased]\n', baseChangelog: base, releases: releasesWith('released', '0.29.5') });
    assert.equal(result.ok, false);
});
