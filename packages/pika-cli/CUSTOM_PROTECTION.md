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

## User Feedback

The sync command now provides clear feedback about this feature:

- **Warning Messages**: Inform users about the automatic protection
- **Status Display**: Shows custom- protection status in sync information
- **Success Messages**: Explains the protection features after successful sync
