#!/usr/bin/env bash
# Starts the image the way `docker compose up` does, next to its bundled storage, and checks it
# actually works: the app reaches the storage and creates the bucket, the web app is served, a file
# goes up and down through presigned links from the host (as a browser would), search and the
# trash work, and the server doesn't run as root. This also proves compose.yaml itself.
# Usage: .github/scripts/smoke_test.sh <image>
set -euo pipefail

image="${1:?usage: smoke_test.sh <image>}"
cd "$(dirname "$0")/../.."

# compose.yaml uses this image instead of building one
export CLOUDVAULT_IMAGE="$image"
url="http://127.0.0.1:8000"

cleanup() {
  status=$?
  if [ "$status" -ne 0 ]; then
    echo "::group::Container logs"
    docker compose logs --no-color 2>&1 || true
    echo "::endgroup::"
  fi
  docker compose down --volumes --remove-orphans >/dev/null 2>&1 || true
  exit "$status"
}
trap cleanup EXIT

check() {
  echo "✓ $1"
}

fail() {
  echo "✗ $1" >&2
  exit 1
}

# Run a line of Python on the JSON read from stdin, as `d`
json() {
  python3 -c "import json, sys; d = json.load(sys.stdin); $1"
}

post() {
  curl -fsS -X POST "$url$1" -H 'Content-Type: application/json' -d "$2"
}

# Waits for both containers to be healthy (the app has a health check of its own)
docker compose up --detach --no-build --wait --wait-timeout 240 || fail "The stack didn't become healthy within 240 seconds"
check "App and storage are up"

curl -fsS "$url/api/health" | json 'assert d["status"] == "ok" and d["storage_connected"] is True, d' \
  || fail "The app is up but can't reach the storage (or couldn't create the bucket)"
check "App is connected to the storage, and the bucket was created"

curl -fsS "$url/" | grep -q '<div id="root">' || fail "/ didn't return the web app"
curl -fsS "$url/?p=docs&q=report" | grep -q '<div id="root">' || fail "A shared address didn't open the web app"
curl -fsS "$url/trash" | grep -q '<div id="root">' || fail "App routes didn't fall back to the web app"
[ "$(curl -s -o /dev/null -w '%{http_code}' "$url/api/no-such-route")" = "404" ] || fail "An unknown API path didn't return 404"
check "Web app is served, including shared addresses and app routes"

# A file goes up with a presigned link and comes back with another, straight to the storage
post /api/folders '{"path": "smoke"}' >/dev/null
upload="$(post /api/objects/presign-upload '{"key": "smoke/hello.txt", "content_type": "text/plain", "size": 11}')"
upload_url="$(printf '%s' "$upload" | json 'print(d["upload_url"])')"
case "$upload_url" in http://localhost:9000/*) ;; *) fail "The upload link doesn't use the public address: $upload_url" ;; esac
printf 'hello cloud' | curl -fsS -X PUT -H 'Content-Type: text/plain' --data-binary @- "$upload_url" >/dev/null \
  || fail "Uploading with the presigned link failed"
curl -fsS "$url/api/objects?prefix=smoke/" | json 'assert [o["key"] for o in d["objects"]] == ["smoke/hello.txt"], d' \
  || fail "The uploaded file isn't listed"
download_url="$(curl -fsS "$url/api/objects/presign-download?key=smoke/hello.txt" | json 'print(d["download_url"])')"
[ "$(curl -fsS "$download_url")" = "hello cloud" ] || fail "Downloading with the presigned link returned the wrong content"
check "A file goes up and down through presigned links"

# The browser sends files from the page's origin, so the storage has to allow it
curl -fsS -D - -o /dev/null -H "Origin: http://localhost:8000" "$download_url" | grep -qi '^access-control-allow-origin:' \
  || fail "The storage doesn't allow the page's origin (CORS), so a browser couldn't use the links"
check "The storage allows the page's origin (CORS)"

curl -fsS "$url/api/objects/search?q=HELLO" | json 'assert [o["key"] for o in d["objects"]] == ["smoke/hello.txt"], d' \
  || fail "Search didn't find the file"
check "Search finds it by name"

# Deleting moves to the trash; restoring puts it back
batch="$(post /api/trash '{"items": [{"path": "smoke/hello.txt", "type": "file"}]}' | json 'print(d["batch"]["id"])')"
curl -fsS "$url/api/objects?prefix=smoke/" | json 'assert d["objects"] == [], d' || fail "The deleted file is still listed"
curl -fsS -X POST "$url/api/trash/$batch/restore" | json 'assert d["restored"] == ["smoke/hello.txt"], d' || fail "Restoring from the trash failed"
curl -fsS "$url/api/objects?prefix=smoke/" | json 'assert len(d["objects"]) == 1, d' || fail "The restored file isn't back"
check "Trash and restore work"

curl -fsS -X DELETE "$url/api/folders?prefix=smoke/" | json 'assert d["success"] is True, d' || fail "Deleting the folder failed"
check "A folder can be deleted"

[ "$(docker compose exec -T cloudvault id -u)" != "0" ] || fail "The server runs as root"
check "Server runs as a non-root user"
