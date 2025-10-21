# Migration Guides

Step-by-step instructions for upgrading through breaking changes.

## Available Guides

### [Upgrading to 0.5.0](/docs/releases/migration-guides/upgrading-to-0-5-0)

**Version:** 0.4.x → 0.5.0  
**Status:** Upcoming

Two breaking changes in this release:

**1. Tag System Refactor**

- DynamoDB schema updates (GSI replacement required)
- Tag configuration model changes (`chatAppId` → `usageMode`)
- Chat app tag enablement configuration

**2. Chat Session GSI Update**

- DynamoDB GSI update for correct session sorting
- Composite sort key implementation (`chat_app_sk` with format `chatAppId#source#lastUpdate`)

**Who's Affected:**

- All deployments (DynamoDB schema changes required)
- Projects using custom tags
- Projects querying chat sessions by chat app

**Estimated Time:** 45-60 minutes (includes 4 CDK deployments + wait times)

---

## How to Use Migration Guides

### Before Starting

1. **Check your version:**

    ```bash
    cat .pika-sync.json | grep pikaVersion
    ```

2. **Commit your work:**

    ```bash
    git add .
    git commit -m "Pre-migration checkpoint"
    ```

3. **Run sync in dry-run mode:**
    ```bash
    pika sync --dry-run
    ```

### During Migration

- Follow steps exactly in order
- Don't skip manual verification steps
- Keep the migration guide open for reference
- Take breaks between major steps (especially AWS changes)

### After Migration

1. **Test thoroughly:**

    - Verify all features work
    - Check custom components
    - Test tag functionality

2. **Commit the upgrade:**
    ```bash
    git add .
    git commit -m "Upgraded to version X.X.X"
    ```

---

## Migration Checklist Template

Copy this for each migration:

```markdown
- [ ] Read complete migration guide
- [ ] Check current version
- [ ] Commit all pending changes
- [ ] Run `pika sync --dry-run`
- [ ] Follow migration steps
- [ ] Run tests
- [ ] Verify functionality
- [ ] Commit migration
```

---

## Need Help?

- **Stuck?** Check the "Common Issues" section in each guide
- **Questions?** Review the [Troubleshooting](/docs/developer/troubleshooting) docs
- **Rollback?** Each guide includes rollback instructions

---

## Future Migrations

New migration guides will be added here as breaking changes are introduced. Subscribe to release notifications to stay informed.
