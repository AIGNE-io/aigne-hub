#!/bin/bash
# Local test script for AIGNE Hub Cloudflare Worker
# Usage: cd cloudflare && bash scripts/test-local.sh

set -e

BASE_URL="${1:-http://localhost:8787}"
ADMIN_DID="test-admin"
USER_DID="test-user"
PASS=0
FAIL=0

green() { printf "\033[32m%s\033[0m\n" "$1"; }
red()   { printf "\033[31m%s\033[0m\n" "$1"; }
bold()  { printf "\033[1m%s\033[0m\n" "$1"; }

assert_status() {
  local desc="$1" method="$2" url="$3" expected="$4"
  shift 4
  local status
  status=$(curl -s -o /dev/null -w '%{http_code}' -X "$method" "$@" "$url")
  if [ "$status" = "$expected" ]; then
    green "  ✓ $desc ($status)"
    PASS=$((PASS + 1))
  else
    red "  ✗ $desc (expected $expected, got $status)"
    FAIL=$((FAIL + 1))
  fi
}

assert_json() {
  local desc="$1" url="$2" jq_expr="$3" expected="$4"
  shift 4
  local result
  result=$(curl -s "$@" "$url" | python3 -c "import sys,json; d=json.load(sys.stdin); print($jq_expr)" 2>/dev/null || echo "PARSE_ERROR")
  if [ "$result" = "$expected" ]; then
    green "  ✓ $desc = $result"
    PASS=$((PASS + 1))
  else
    red "  ✗ $desc (expected '$expected', got '$result')"
    FAIL=$((FAIL + 1))
  fi
}

bold "=== AIGNE Hub CF Worker - Local Test Suite ==="
echo "Target: $BASE_URL"
echo ""

# ─── 1. Health ───
bold "1. Health Check"
assert_json "health status" "$BASE_URL/api/health" "d['status']" "ok"
assert_json "health db" "$BASE_URL/api/health" "d['db']" "connected"

# ─── 2. Auth ───
bold "2. Authentication"
assert_status "session unauth → 401" GET "$BASE_URL/auth/session" 401
assert_status "google login (no config) → 404" GET "$BASE_URL/auth/login/google" 404
assert_status "github login (no config) → 404" GET "$BASE_URL/auth/login/github" 404
assert_status "logout → 200" POST "$BASE_URL/auth/logout" 200

# ─── 3. User Profile ───
bold "3. User Profile"
assert_status "profile unauth → 401" GET "$BASE_URL/api/user/profile" 401
assert_status "profile with dev header → 200" GET "$BASE_URL/api/user/profile" 200 \
  -H "x-user-did: $ADMIN_DID" -H "x-user-role: admin"
assert_json "profile returns did" "$BASE_URL/api/user/profile" "d['did']" "$ADMIN_DID" \
  -H "x-user-did: $ADMIN_DID" -H "x-user-role: admin"

# ─── 4. App Status ───
bold "4. App Status"
assert_json "app status" "$BASE_URL/api/app/status" "d['status']" "running"

# ─── 5. Provider CRUD ───
bold "5. Provider CRUD"
# Create
TEST_PROVIDER="test-provider-$$"
assert_status "create provider (no auth) → 403" POST "$BASE_URL/api/ai-providers" 403 \
  -H "Content-Type: application/json" -d "{\"name\":\"$TEST_PROVIDER\",\"displayName\":\"Test\"}"
assert_status "create provider (admin) → 201" POST "$BASE_URL/api/ai-providers" 201 \
  -H "Content-Type: application/json" -H "x-user-did: $ADMIN_DID" -H "x-user-role: admin" \
  -d "{\"name\":\"$TEST_PROVIDER\",\"displayName\":\"Test Provider\",\"baseUrl\":\"https://api.test.com/v1\"}"
assert_status "create duplicate → 409" POST "$BASE_URL/api/ai-providers" 409 \
  -H "Content-Type: application/json" -H "x-user-did: $ADMIN_DID" -H "x-user-role: admin" \
  -d "{\"name\":\"$TEST_PROVIDER\",\"displayName\":\"Test Provider\"}"
# List
assert_status "list providers → 200" GET "$BASE_URL/api/ai-providers" 200 \
  -H "x-user-did: $ADMIN_DID" -H "x-user-role: admin"

# ─── 6. Public Model APIs ───
bold "6. Public Model APIs (no auth)"
assert_status "models → 200" GET "$BASE_URL/api/ai-providers/models" 200
assert_status "model-rates → 200" GET "$BASE_URL/api/ai-providers/model-rates" 200
assert_status "model-status → 200" GET "$BASE_URL/api/ai-providers/model-status" 200
assert_status "health → 200" GET "$BASE_URL/api/ai-providers/health" 200

# ─── 7. AI Proxy ───
bold "7. AI Proxy (v2)"
assert_status "v2 status → 200" GET "$BASE_URL/api/v2/status" 200
assert_status "chat no model → 400" POST "$BASE_URL/api/v2/chat/completions" 400 \
  -H "Content-Type: application/json" -H "x-user-did: $USER_DID" \
  -d '{"messages":[{"role":"user","content":"hi"}]}'
assert_status "chat no provider → 404" POST "$BASE_URL/api/v2/chat/completions" 404 \
  -H "Content-Type: application/json" -H "x-user-did: $USER_DID" \
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"hi"}]}'

# ─── 8. Usage ───
bold "8. Usage APIs"
assert_status "usage stats → 200" GET "$BASE_URL/api/usage/stats" 200 \
  -H "x-user-did: $USER_DID"
assert_status "usage credits → 200" GET "$BASE_URL/api/usage/credits" 200 \
  -H "x-user-did: $USER_DID"
assert_status "usage recent → 200" GET "$BASE_URL/api/usage/recent" 200 \
  -H "x-user-did: $USER_DID"
assert_status "usage by-model → 200" GET "$BASE_URL/api/usage/by-model" 200 \
  -H "x-user-did: $USER_DID"

# ─── 9. Payment Proxy ───
bold "9. Payment Proxy"
assert_status "payment (no origin) → 503" GET "$BASE_URL/api/payment/status" 503

# ─── 10. SSE Events ───
bold "10. SSE Events"
assert_status "events endpoint → 200" GET "$BASE_URL/api/events" 200

# ─── 11. V1 Compat ───
bold "11. V1 Compatibility"
assert_status "v1 status → 200" GET "$BASE_URL/api/v1/status" 200

# ─── Summary ───
echo ""
bold "=== Results ==="
green "Passed: $PASS"
if [ "$FAIL" -gt 0 ]; then
  red "Failed: $FAIL"
  exit 1
else
  green "All tests passed!"
fi
