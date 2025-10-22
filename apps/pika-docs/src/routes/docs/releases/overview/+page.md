# Releases

Stay up to date with the latest Pika Framework releases, new features, and important changes.

## Current Version

**Latest Stable:** `0.6.2` (October 22, 2025)

Check your project version:

```bash
cat .pika-sync.json | grep pikaVersion
```

**What's New in 0.6.2:**

- **Chat Input Height Fix** - Textarea now properly resets to original size after submitting questions
- Improved user experience with predictable input field sizing
- Fixed height reset behavior in chat input component

**What's New in 0.6.1:**

- **S3 File Content Route Fix** - Improved reliability and safety for S3 text file retrieval
- Added 50MB file size limit to prevent memory issues
- Fixed route path structure for proper parameter handling
- Better error handling for oversized files

**What's New in 0.6.0:**

- **S3 File Access for Web Components** - New `getS3TextFileContent()` method enables secure retrieval of text files from the Pika S3 bucket
- No AWS credential management required for web components
- Perfect for loading configuration files, data files, or dynamic content
- Comprehensive documentation with examples

**Note:** If upgrading from 0.4.0 or earlier, be aware that 0.5.0 introduced breaking changes. See [Migration Guide](/docs/releases/migration-guides/upgrading-to-0-5-0) for upgrade instructions.

## How Releases Work

### Version Numbering (0.x.x)

While Pika is pre-1.0, we use:

- **0.x.0** - Breaking changes or significant new features
- **0.x.y** - Bug fixes and minor improvements

Once we reach 1.0, we'll follow strict semantic versioning.

### Release Frequency

- **Breaking changes**: Released promptly with migration guides
- **New features**: Batched when ready (typically every 2-4 weeks)
- **Bug fixes**: Released as needed

### What You Get

Each release includes:

- **Changelog** - Detailed list of changes
- **Migration guides** - Step-by-step instructions for breaking changes
- **Version metadata** - Tracked in your `.pika-sync.json`
- **Automatic sync support** - `pika sync` handles updates intelligently

## Sync Your Project

Update to the latest version:

```bash
# See what will change
pika sync --dry-run

# View detailed diffs
pika sync --diff

# Apply updates
pika sync
```

The sync command will:

1. Check your current version
2. Download the latest framework
3. Show you what's changed
4. **Warn about breaking changes**
5. Preserve your customizations
6. Apply updates safely

## Breaking Changes

When breaking changes are introduced:

- **Automatic detection** - `pika sync` will detect breaking changes
- **Block sync** - Won't proceed without acknowledgment
- **Clear guidance** - Links to migration guides
- **Manual steps** - Detailed instructions for required changes

## Version History

| Version | Date        | Type     | Summary                                       |
| ------- | ----------- | -------- | --------------------------------------------- |
| 0.6.2   | Oct 22 2025 | Patch    | Chat input height fix                         |
| 0.6.1   | Oct 21 2025 | Patch    | S3 file content route fixes                   |
| 0.6.0   | Oct 21 2025 | Feature  | S3 file access for web components             |
| 0.5.2   | Oct 21 2025 | Patch    | Instruction augmentation fixes                |
| 0.5.1   | Oct 21 2025 | Patch    | Session source field fix                      |
| 0.5.0   | Oct 21 2025 | Breaking | Tag system refactor + Chat session GSI update |
| 0.4.0   | Oct 20 2025 | Stable   | Initial tracked release                       |

## Learn More

- [Full Changelog](/docs/releases/changelog) - Complete version history
- [Migration Guides](/docs/releases/migration-guides) - Step-by-step upgrade instructions
- [Sync System](/docs/developer/sync-system) - How syncing works

## Stay Informed

Keep your project updated:

```bash
# Check for updates regularly
pika sync --dry-run

# Subscribe to release notifications (if available)
```

## Questions?

- Not sure if you should upgrade? Check the changelog for your version
- Breaking change coming? Migration guides provide complete instructions
- Sync issues? See [Troubleshooting](/docs/developer/troubleshooting)
