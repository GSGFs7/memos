# Anonymous reactions

Anonymous visitors can add a configured emoji to a normal PUBLIC memo that is not assigned to a Space, on a PUBLIC instance. They cannot withdraw it. Signed-in reactions and their withdrawal behavior remain unchanged. Share tokens grant no reaction permission.

The browser records successful additions in localStorage, keyed by memo UID and reaction type, and blocks simultaneous submissions from its reaction entry points. Clearing browser storage or switching browsers permits another addition. This is intentional: no visitor identifier, cookie, fingerprint or IP address is persisted in reaction storage. A verified request adds one to a counter; the count describes additions rather than distinct people.

Anonymous counts use one reaction row per memo and type, with `creator_id = 0` and `anonymous_count > 0`. Existing user rows keep `anonymous_count = 0`. All three drivers increment the count atomically while checking current memo visibility, lifecycle and placement. Counts are included in normal memo, reaction-list and share responses; the existing user-centric ZIP export does not export anonymous counts. Deleting a memo also deletes its counts.

## Turnstile configuration

Create a Cloudflare Turnstile widget in Managed mode for your frontend domain. In Memos, open **Settings → Administrator → Memo → Reactions** (`/setting#memo`), enable anonymous reactions, enter the Site Key, Secret Key and exact allowed hostnames, then save. Configuration is persisted in the existing instance settings table and applies immediately, without restarting.

Only administrators may read or write this setting. The Secret Key is input-only: responses never include it, even for administrators. A blank Secret Key preserves the existing credential. Changing the Site Key requires a new matching Secret Key. Disabling anonymous reactions retains the configuration for later re-enabling.

Saved app configuration overrides environment defaults, including when disabled. Reading environment defaults does not copy them into the database. For deployments that prefer environment configuration, the following remain supported:

```text
MEMOS_ANONYMOUS_REACTION_SITE_KEY=<public site key>
MEMOS_ANONYMOUS_REACTION_SECRET=<secret key>
MEMOS_ANONYMOUS_REACTION_HOSTNAMES=memos.example.com
```

Supply the secret through your deployment's secret store. Do not commit it or pass it as a command-line argument. Site key and hostnames also have `--anonymous-reaction-site-key` and `--anonymous-reaction-hostnames` flags. Hostnames are exact names without schemes, paths or ports. Multiple hostnames can be comma-separated; include localhost only in a development deployment's allowlist.

With neither app nor environment configuration, anonymous reactions are disabled. Partial configuration fails startup. These settings do not enable challenges on signup or sign-in.

The frontend uses the `anonymous_reaction` action. Each addition obtains a fresh Turnstile token and sends it in `Challenge-Token`. The backend requires successful Siteverify validation with the configured hostname and exact action. Missing, expired, reused, rejected or unavailable verification does not write a reaction. No new provider SDK is needed.

`AddAnonymousMemoReaction` is available via Connect and `POST /api/v1/memos/{uid}/reactions:anonymous`. This route is public but is not an auth-bootstrap route; private instances block anonymous access. The dedicated default IP limit is 20 attempts per minute, applied before Siteverify, in addition to the catch-all request budget. `--rate-limit=false` disables rate limiting. Configure `--trusted-proxies` for your deployment so callers cannot spoof the address used for limiting.

SQLite, MySQL and PostgreSQL add the counter with `0.31/08__anonymous_reaction.sql`. No visitor identity or existing user reaction is migrated.
