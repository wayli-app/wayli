# Repair orphaned trip_media (broken trip photos)

## What this fixes

Photos on a trip page that 404, even though the trip shows them. Root cause:
the `polarsteps-import` job inserts a `trip_media` metadata row pointing at a
storage object that was never actually registered (Fluxbase storage can report
a successful upload while the object isn't durable). Result: a `trip_media` row
with a `storage_path` whose object is missing from `storage.objects` and from
disk → broken image.

> Note: Fluxbase storage is **not** a plain filesystem mirror. An object must
> exist in BOTH `storage.objects` (the registry) AND on disk under
> `/data/storage/<bucket>/<path>` to serve. Placing a file on disk without a
> `storage.objects` row still 404s.

## Hardening (already in this repo)

`fluxbase/jobs/polarsteps-import.ts` now verifies every upload via
`uploadPhotoWithVerify()` (upload → `storage.list` confirms the object → retry
×3 → only then insert the `trip_media` row). New imports should not produce
orphans. This runbook covers recovering **existing** orphans.

## Detecting orphans

```sh
USER_ID=<owner user id>            # e.g. 54e0b1e7-4e8b-4c78-8c9a-fa1150f6fa79
FB_POD=$(kubectl get pod -n wayli -l app.kubernetes.io/name=fluxbase -o jsonpath='{.items[0].metadata.name}')
PG_POD=$(kubectl get pod -n wayli -l app.kubernetes.io/name=postgresql -o jsonpath='{.items[0].metadata.name}')

# 1. All media storage paths for the user (from Postgres)
kubectl exec "$PG_POD" -n wayli -- psql -U wayli -d wayli -t -A -c \
  "SELECT storage_path FROM trip_media WHERE user_id='$USER_ID';" > /tmp/media.tsv

# 2. All object basenames actually on disk
kubectl exec "$FB_POD" -n wayli -- sh -c \
  "find /data/storage/trip-images/$USER_ID -type f -exec basename {} \;" > /tmp/disk.txt

# 3. Diff: media basenames missing from disk
python3 - <<'PY'
disk = {l.strip() for l in open('/tmp/disk.txt') if l.strip()}
for l in open('/tmp/media.tsv'):
    l = l.strip()
    if l and l.split('/')[-1] not in disk:
        print(l)
PY
```

Also check the registry directly — orphans have a `trip_media` row but **no**
matching `storage.objects` row:

```sh
kubectl exec "$PG_POD" -n wayli -- psql -U wayli -d wayli -c "
SELECT tm.id, tm.trip_id, tm.storage_path
FROM trip_media tm
WHERE tm.user_id = '$USER_ID'
  AND NOT EXISTS (
    SELECT 1 FROM storage.objects o
    WHERE o.bucket_id = 'trip-images'
      AND o.path = regexp_replace(tm.storage_path, '^.*?/storage/trip-images/', '')
  );"
```

## Recovering the bytes

Orphaned photos are usually recoverable from the original Polarsteps export
zip (the `<uuid>_<uuid>.jpg` basenames match `trip/.../photos/<basename>`).
For each orphan:

1. Extract the file from the export zip.
2. Place it on disk at `/data/storage/trip-images/<userId>/<tripId>/<basename>`
   (owner `1001:1001`; the fluxbase container runs as uid 1001).
3. Register it in `storage.objects`:

```sql
INSERT INTO storage.objects (bucket_id, path, mime_type, size, owner_id, tenant_id)
VALUES ('trip-images', '<userId>/<tripId>/<basename>', 'image/jpeg', <size>,
        '<userId>', '<tenantId>')
ON CONFLICT (bucket_id, path) DO NOTHING;
```

`tenant_id` can be copied from any existing object for that owner.

## Verify

After registering, the public URL should return HTTP 200:

```sh
curl -s -o /dev/null -w "%{http_code}\n" \
  "https://<host>/api/v1/storage/trip-images/<userId>/<tripId>/<basename>"
```

(204/200 = fixed; 404 = object still missing from `storage.objects` or disk.)
