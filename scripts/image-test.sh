#!/bin/sh
# Checks how a Record Keeper image serves pages, assets and config
# (docs/packaging/spec.md, "CI"):
#
#   sh scripts/image-test.sh IMAGE
#
# It runs IMAGE with a synthetic config.json mounted, on a random local port,
# makes every check, prints one line per check, and removes the container.
# Exits 0 if all pass, 1 if any failed, 2 on a usage error. Needs only docker
# and curl.
set -eu

[ "$#" -eq 1 ] || { echo "usage: image-test.sh IMAGE" >&2; exit 2; }
image=$1

work=$(mktemp -d)
container=""
cleanup() {
  [ -n "$container" ] && docker rm -f "$container" >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT

# Synthetic values only, unlike the build's localhost ones, so a /config.json
# that isn't the mounted file fails.
cat > "$work/config.json" <<'EOF'
{
  "gatewayUrl": "https://gateway.example.test",
  "clientId": "image-test",
  "basemapStyleUrl": "https://basemap.example.test/style.json"
}
EOF
# World-readable: nginx runs as UID 101. z relabels the file for SELinux
# hosts; hosts without SELinux ignore it.
chmod 0644 "$work/config.json"

container=$(docker run -d -p 127.0.0.1::8080 \
  -v "$work/config.json:/usr/share/nginx/html/config.json:ro,z" "$image")
port=$(docker port "$container" 8080/tcp | head -n 1 | sed 's/.*://')
base="http://127.0.0.1:$port"

i=0
until curl -fs -o /dev/null "$base/config.json"; do
  i=$((i + 1))
  if [ "$i" -ge 30 ]; then
    echo "FAIL: no answer from $base/config.json after 30 s" >&2
    docker logs "$container" >&2 || true
    exit 1
  fi
  sleep 1
done

failed=0
pass() { echo "ok   $1"; }
fail() { echo "FAIL $1"; failed=1; }

# header PATH NAME: the value of one response header, without the CR.
header() {
  curl -s -o /dev/null -D - "$base$1" |
    awk -v n="$2" '{ sub(/\r$/, "") }
      tolower($0) ~ "^" tolower(n) ":" { sub(/^[^:]*: */, ""); print; exit }'
}
status() { curl -s -o /dev/null -w '%{http_code}' "$base$1"; }
# expect DESCRIPTION ACTUAL WANTED
expect() {
  if [ "$2" = "$3" ]; then pass "$1"; else fail "$1: got '$2', want '$3'"; fi
}

docker exec "$container" cat /usr/share/nginx/html/index.html > "$work/index.html"

# The app, and the SPA fallback.
for path in / /parcels/a0000000-0000-4000-8000-000000000002; do
  expect "$path status" "$(status "$path")" 200
  expect "$path Content-Type" "$(header "$path" Content-Type)" text/html
  curl -s "$base$path" > "$work/body"
  if cmp -s "$work/body" "$work/index.html"; then
    pass "$path is index.html"
  else
    fail "$path is not index.html"
  fi
done

# The mounted config.json, not the build's.
curl -s "$base/config.json" > "$work/body"
if cmp -s "$work/body" "$work/config.json"; then
  pass "/config.json is the mounted file"
else
  fail "/config.json is not the mounted file"
fi

# Every asset is served, and module scripts have a JavaScript type.
assets=$(docker exec "$container" find /usr/share/nginx/html/assets -type f |
  sed 's|^/usr/share/nginx/html||')
[ -n "$assets" ] || fail "no files in assets/"
mjs=0
for path in $assets; do
  expect "$path status" "$(status "$path")" 200
  case $path in
    *.mjs)
      mjs=1
      expect "$path Content-Type" "$(header "$path" Content-Type)" application/javascript
      ;;
    *.js)
      expect "$path Content-Type" "$(header "$path" Content-Type)" application/javascript
      ;;
    *.css)
      expect "$path Content-Type" "$(header "$path" Content-Type)" text/css
      ;;
  esac
done
[ "$mjs" -eq 1 ] || fail "no .mjs file in assets/ (MapLibre's worker)"

# A missing asset is a 404, not the app.
expect "/assets/missing.js status" "$(status /assets/missing.js)" 404

# Caching.
first_asset=$(echo "$assets" | head -n 1)
expect "asset Cache-Control" "$(header "$first_asset" Cache-Control)" \
  "public, max-age=31536000, immutable"
for path in / /index.html /config.json /parcels/a0000000-0000-4000-8000-000000000002; do
  expect "$path Cache-Control" "$(header "$path" Cache-Control)" no-cache
done

# Security headers, on every kind of response.
csp="script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'none'"
for path in / /index.html /config.json "$first_asset" /parcels/a0000000-0000-4000-8000-000000000002 /assets/missing.js; do
  expect "$path Content-Security-Policy" "$(header "$path" Content-Security-Policy)" "$csp"
  expect "$path X-Content-Type-Options" "$(header "$path" X-Content-Type-Options)" nosniff
  expect "$path Referrer-Policy" "$(header "$path" Referrer-Policy)" strict-origin-when-cross-origin
done

# No version in the Server header.
expect "Server header" "$(header / Server)" nginx

# Not root.
uid=$(docker exec "$container" id -u)
if [ "$uid" != 0 ]; then pass "runs as UID $uid"; else fail "runs as root"; fi

if [ "$failed" -ne 0 ]; then
  echo "image-test: FAILED" >&2
  exit 1
fi
echo "image-test: all checks passed"
