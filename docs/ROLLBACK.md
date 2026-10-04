# Rollback runbook (v1.1 → v1.0)

**Submitted version (v1.0):** commit `301de48` on `main` ("Merge copy fix … (#5)").
- Vercel production deployment before v1.1: **https://ami-2dg4r28b3-nguyen-van-sons-projects.vercel.app** (GitHub deployment id 6838167078, created 2026-10-04 07:23 UTC).
- Tag `v1.0-submitted` → `301de48`: **could not be pushed from the agent container** (GitHub proxy rejects tag refs). TODO(human): `git tag -a v1.0-submitted 301de48 -m "v1.0 as submitted" && git push origin v1.0-submitted` (or GitHub → Releases → Draft new release → tag `v1.0-submitted`, target commit `301de48`).

## Fastest: Vercel Instant Rollback (≈ 10 s, no rebuild)
Vercel dashboard → project **ami-ama** → **Deployments** → find the deployment above (`ami-2dg4r28b3…`, commit `301de48`) → **⋯ → Promote to Production** (or "Instant Rollback" from the production deployment's menu).

## Via git (rebuild)
Open a PR that reverts the v1.1 merge commit on `main` (`git revert -m 1 <merge-sha>`), merge it; Vercel redeploys production from `main`.

## Clients
The service worker auto-updates (`registerType: autoUpdate`, `skipWaiting`); after a rollback, phones get the old precache on their next online visit. Log entries written by v1.1 keep their extra optional fields; v1.0 ignores them.
