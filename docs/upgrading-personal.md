# Upgrading the personal fork

The upstream baseline is `26.11.0`. Personal features are anonymous reactions,
image stickers, crawler blocking, and the GHCR/Kubernetes deployment configuration.
Keep `main` for upstream history and integrate stable tags on `sync/<version>`
branches created from `personal`. Keep emergency backports separate from feature
changes. Do not rewrite published `personal` history.

## 0.31 personal to 26.11

- REST moves from `/api/v1` to `/api`; Connect procedures use `memos.api`.
  Update external clients and reverse proxy rules. The Kubernetes probes in this
  repository already use the new profile route.
- The schema advances to `26.11.1`, independently of the application version.
  All drivers add `anonymous_count` through `26.11/00__anonymous_reaction.sql`.
  The migrator checks the actual table before the transaction and skips that
  addition when the old personal `0.31.9` database already has the column.
  Existing reaction rows, aggregate counts, sticker maps and anonymous settings
  remain in place. Fresh installs use the equivalent `LATEST.sql`.
- Configuration files formerly loaded from `/etc/secrets` must be converted to
  `memos.api.Configuration` documents under `/etc/memos/config`. Keep identity
  provider UIDs. Secret files referenced by the new configuration can still live
  in a secret mount. Use `memos config plan` with the candidate schema before
  enabling the configuration on production.
- Upstream changed access-token invalidation. Plan for sign-in or token refresh
  after upgrading; personal access tokens are unaffected.
- Reconfigure custom memo length and upload size caps under Usage limits. The
  old instance caps are not migrated by upstream. Double-click editing is now a
  browser preference; raw Markdown mode is under Settings → Editor.
- Image builds use `scripts/release_version.sh development-version` because the
  new binary rejects the former `0.31.0-personal.<sha>` version format. The
  `personal` and `sha-<commit>` image tags and pinned deployment digests remain.

## Verification and deployment

1. Preserve the old branch/commit and deployed image digest. Take a consistent
   database backup and back up local attachments and deployment configuration.
   Stop writes while taking the final backup, or use the database's supported
   consistent backup mechanism. A live SQLite file copy alone is insufficient.
2. Run the repository's Go, frontend and Proto checks. Store tests cover official
   `0.31.8`, personal `0.31.9`, and official calendar databases, including repeated
   startup. Upgrade Smoke verifies the official baseline and the personal image
   pinned in `deployments/image.json` before publishing.
3. Start the candidate with an isolated copy of the database, local attachments
   and necessary configuration. Avoid connecting this rehearsal to production
   outbound notifications or writable production storage. Check sign-in, notes,
   attachments, Spaces, reactions, stickers and probes, then restart it once.
4. Merge the verified sync branch into `personal`. Publishing that branch invokes
   the existing image workflow. Review the resulting `deployments/image.json`
   and Kubernetes digest before applying the deployment.
5. Upgrade production from the verified backup point. Check startup logs, schema,
   readiness and the same user flows. Keep the backup until acceptance.

Rollback means restoring the old image **and the pre-upgrade database backup**,
plus matching attachments/configuration where necessary. The old binary rejects
the newer schema marker; changing the marker manually is not a rollback. Writes
made after the upgrade require a separate recovery plan before restoring backup.

## Future syncs

Use a stable upstream tag, review its release notes, create a backup reference,
and merge it into a new sync branch without committing immediately. Review the
personal diff against that tag, resolve source Proto changes and regenerate,
and run the applicable checks plus an upgrade from the current personal image.
Only then commit and merge back into `personal`. Avoid carrying old safety fixes
once equivalent upstream behavior is verified. Keep generated assets out of
commits, except the repository's tracked placeholder.
