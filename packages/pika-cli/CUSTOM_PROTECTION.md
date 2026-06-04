# Custom Directory Protection

## Overview

The Pika sync command now automatically protects any directory or file path that contains a segment starting with `custom-`. This allows users to place custom directories anywhere in their project structure without worrying about them being overwritten during sync operations.

Additionally, the `pika-config.ts` file is automatically protected since users will modify it with their project names.

## How It Works

When the sync command runs, it checks each file and directory path against the following criteria:

1. **Custom- Protection**: Any path segment that starts with `custom-` is automatically protected
2. **Configuration Protection**: The `pika-config.ts` file is automatically protected
3. **Explicit Protected Areas**: Previously configured protected areas (like `apps/pika-chat/src/lib/server/auth-provider/`)
4. **User Configuration**: User-defined protected and unprotected areas from `.pika-sync.json`

## Examples

### Protected Directories

- `apps/pika-chat/tools/custom-ssl/` ✅
- `services/custom-auth/` ✅
- `apps/custom-components/` ✅
- `deep/nested/custom-directory/` ✅
- `custom-anything/here/` ✅

### Protected Files

- `apps/pika-chat/tools/custom-ssl/cert.pem` ✅
- `services/custom-auth/config.ts` ✅
- `custom-anything/here/file.txt` ✅
- `pika-config.ts` ✅ (automatically protected)

### Not Protected

- `apps/pika-chat/src/lib/client/` ❌
- `services/weather/` ❌
- `node_modules/` ❌

## Usage

Simply create directories with names starting with `custom-` anywhere in your project:

```bash
# These will all be automatically protected
mkdir apps/pika-chat/tools/custom-ssl
mkdir services/custom-auth
mkdir apps/custom-components
mkdir custom-anything
```

The `pika-config.ts` file is automatically protected, so you can safely modify project names and other configuration values without worrying about them being overwritten during sync.

## Benefits

1. **Flexibility**: Place custom directories anywhere in the project structure
2. **Automatic Protection**: No need to manually configure protected areas
3. **Clear Naming**: The `custom-` prefix makes it obvious which directories are user-created
4. **Configuration Safety**: The `pika-config.ts` file is protected to preserve user modifications
5. **Future-Proof**: Works with any future framework updates

## Implementation Details

The protection is implemented in the `isProtectedArea` function in `packages/pika-cli/src/commands/sync.ts`. It checks each path segment and returns `true` if any segment starts with `custom-`.

```typescript
function isProtectedArea(filePath: string, protectedAreas: string[]): boolean {
    // Check if any path segment starts with 'custom-'
    const pathSegments = filePath.split('/');
    const hasCustomSegment = pathSegments.some((segment) => segment.startsWith('custom-'));

    if (hasCustomSegment) {
        return true;
    }

    // Check against explicit protected areas
    // ... existing logic
}
```

The `pika-config.ts` file is explicitly listed in the `getDefaultProtectedAreas()` function:

```typescript
function getDefaultProtectedAreas(): string[] {
    return [
        // ... other protected areas
        'pika-config.ts'
        // ... more protected areas
    ];
}
```

## Patches for framework files (`pika-patches/`)

Protection is whole-file and all-or-nothing: a protected file keeps your version but stops receiving
**any** framework updates. When you need a **small, surgical** edit to a framework-owned file that has
no extension point/seam, prefer a **patch** instead of orphaning the whole file.

A patch is a unified diff stored in `pika-patches/NNN-<name>.patch`. `pika sync` reapplies every patch
(via `git apply --3way`) right after it overwrites framework files with the pristine copies — so your
edit survives the sync, and the file still receives upstream changes to the lines you didn't touch.

### Authoring

```bash
# 1. Edit the framework file in place and test it.
# 2. Capture the edit (auto-detects the changed file if you omit the path):
pika capture-patch apps/pika-chat/jest.config.js --reason "why" --upstream-ticket ABC-123
# 3. Commit the CUSTOM file + the new patch together.
```

`capture-patch` writes the patch and **leaves your edit in the working tree** (it does not revert).
Commit the custom file, not the pristine one — the repo must contain your actual change so it works
between syncs; the patch only *re-derives* the change after a sync overwrites the file. Keep edits
surgical ("inject, don't refactor"): smaller diffs conflict less often on future syncs.

### Reapply, conflicts, and promotion

Patches apply in lexical (`NNN-`) order. If a patch fails to reapply (pika changed the same lines),
`pika sync` stops with a non-zero exit and leaves `<<<<<<<` markers (or a `.rej`). That recurrence is
the signal to either refresh the patch (`pika capture-patch <file>` again) or **promote** the change
to a proper seam upstream and delete the patch.

### Checking capture-completeness

```bash
pika sync --check-collisions   # exits non-zero if any framework file's committed content
                               # isn't reproducible from pristine + pika-patches
```

Run this in CI to catch an edited framework file that was never captured (it would otherwise be
silently overwritten on the next sync). Protected files and sync PRs are exempt by construction.

## Sync and .gitignore

Sync respects your project root `.gitignore` when deciding what to **delete**. Paths that are ignored (e.g. `scripts/my-tests`, `*.local`) are never removed by sync, so you can keep custom test scripts or other untracked files without them being blown away. If you added a pika/framework path to your `.gitignore`, sync will still update that file when the framework changes.

## User Feedback

The sync command now provides clear feedback about this feature:

- **Warning Messages**: Inform users about the automatic protection
- **Status Display**: Shows custom- protection status in sync information
- **Success Messages**: Explains the protection features after successful sync
