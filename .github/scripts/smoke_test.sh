#!/usr/bin/env bash
# Starts the Docker image next to a MinIO storage and checks it actually works: the API reaches the
# storage, the web app is served, a file goes up and down through presigned links, search and the
# trash work, and the server doesn't run as root.
# Usage: .github/scripts/smoke_test.sh <image>
set -euo pipefail

image="${1:?usage: smoke_test.sh <image>}"
net="cloudvault-smoke"
storage="cloudvault-smoke-minio"
app="cloudvault-smoke-app"
url="http://127.0.0.1:8000"

cleanup() {
  status=$?
  if [ "$status" -ne 0 ]; then
    echo "::group::App logs"
    docker logs "$app" 2>&1 || true
    echo "::endgroup::"
    echo "::group::Storage logs"
    docker logs "$storage" 2>&1 || true
    echo "::endgroup::"
  fi
  docker rm -f "$app" "$storage" >/dev/null 2>&1 || true
  docker network rm "$net" >/dev/null 2>&1 || true
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

# The storage: MinIO with one empty bucket
docker network create "$net" >/dev/null
docker run -d --name "$storage" --network "$net" \
  -e MINIO_ROOT_USER=smokeuser -e MINIO_ROOT_PASSWORD=smokepassword \
  quay.io/minio/minio server /data >/dev/null
timeout 90 docker run --rm --network "$net" --entrypoint sh quay.io/minio/mc -c "
  until mc alias set smoke http://$storage:9000 smokeuser smokepassword >/dev/null 2>&1; do sleep 1; done
  mc mb --ignore-existing smoke/smoke >/dev/null
" || fail "MinIO didn't start within 90 seconds"
check "Storage is ready"

# The image under test, pointed at it. Files go straight from the browser to storage, so the
# presigned links name the storage by its address on the network: they're used from inside the
# container below, which can reach it, as a browser would reach a real one.
docker run -d --name "$app" --network "$net" -p 8000:8000 \
  -e STORAGE_PROVIDER=minio -e S3_ENDPOINT="http://$storage:9000" -e S3_REGION=us-east-1 \
  -e S3_BUCKET=smoke -e S3_ACCESS_KEY=smokeuser -e S3_SECRET_KEY=smokepassword \
  "$image" >/dev/null

# Polled, not a fixed sleep: a slow runner shouldn't fail the check
for _ in $(seq 60); do
  if curl -fsS "$url/api/health" >/dev/null 2>&1; then break; fi
  if [ "$(docker inspect -f '{{.State.Running}}' "$app")" != "true" ]; then
    fail "The container stopped while starting"
  fi
  sleep 1
done
curl -fsS "$url/api/health" >/dev/null || fail "/api/health didn't answer within 60 seconds"
curl -fsS "$url/api/health" | json 'assert d["status"] == "ok" and d["storage_connected"] is True, d' \
  || fail "The API is up but can't reach the storage"
check "API is healthy and connected to the storage"

curl -fsS "$url/" | grep -q '<div id="root">' || fail "/ didn't return the web app"
curl -fsS "$url/?p=docs&q=report" | grep -q '<div id="root">' || fail "A shared address didn't open the web app"
curl -fsS "$url/trash" | grep -q '<div id="root">' || fail "App routes didn't fall back to the web app"
[ "$(curl -s -o /dev/null -w '%{http_code}' "$url/api/no-such-route")" = "404" ] || fail "An unknown API path didn't return 404"
check "Web app is served, including shared addresses and app routes"

# A file goes up with a presigned link and comes back with another
post /api/folders '{"path": "smoke"}' >/dev/null
upload="$(post /api/objects/presign-upload '{"key": "smoke/hello.txt", "content_type": "text/plain", "size": 11}')"
upload_url="$(printf '%s' "$upload" | json 'print(d["upload_url"])')"
printf 'hello cloud' | docker exec -i "$app" python -c '
import sys, urllib.request
request = urllib.request.Request(
    sys.argv[1], data=sys.stdin.buffer.read(), method="PUT", headers={"Content-Type": "text/plain"}
)
assert urllib.request.urlopen(request).status == 200
' "$upload_url" || fail "Uploading with the presigned link failed"
curl -fsS "$url/api/objects?prefix=smoke/" | json 'assert [o["key"] for o in d["objects"]] == ["smoke/hello.txt"], d' \
  || fail "The uploaded file isn't listed"
download_url="$(curl -fsS "$url/api/objects/presign-download?key=smoke/hello.txt" | json 'print(d["download_url"])')"
[ "$(docker exec "$app" python -c 'import sys, urllib.request; sys.stdout.write(urllib.request.urlopen(sys.argv[1]).read().decode())' "$download_url")" = "hello cloud" ] \
  || fail "Downloading with the presigned link returned the wrong content"
check "A file goes up and down through presigned links"

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

[ "$(docker exec "$app" id -u)" != "0" ] || fail "The server runs as root"
check "Server runs as a non-root user"
