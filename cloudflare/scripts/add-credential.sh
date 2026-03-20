#!/bin/bash
# Add an API credential to a provider for testing AI calls
#
# Usage:
#   bash scripts/add-credential.sh openai sk-your-openai-key
#   bash scripts/add-credential.sh anthropic sk-ant-your-key
#   bash scripts/add-credential.sh deepseek sk-your-deepseek-key
#   bash scripts/add-credential.sh google AIzaSy-your-key
#   bash scripts/add-credential.sh xai xai-your-key

set -e

PROVIDER_NAME="${1:?Usage: add-credential.sh <provider-name> <api-key>}"
API_KEY="${2:?Usage: add-credential.sh <provider-name> <api-key>}"
BASE_URL="${3:-http://localhost:8787}"

# Find provider ID
PROVIDER_ID=$(curl -s -H "x-user-did: admin" -H "x-user-role: admin" \
  "$BASE_URL/api/ai-providers" | \
  python3 -c "
import sys,json
for p in json.load(sys.stdin):
  if p['name'] == '$PROVIDER_NAME':
    print(p['id'])
    break
" 2>/dev/null)

if [ -z "$PROVIDER_ID" ]; then
  echo "Error: Provider '$PROVIDER_NAME' not found"
  exit 1
fi

echo "Provider: $PROVIDER_NAME (id: ${PROVIDER_ID:0:12}...)"

# Add credential
RESULT=$(curl -s -X POST \
  "$BASE_URL/api/ai-providers/$PROVIDER_ID/credentials" \
  -H "Content-Type: application/json" \
  -H "x-user-did: admin" \
  -H "x-user-role: admin" \
  -d "{\"name\": \"${PROVIDER_NAME}-key-1\", \"value\": {\"api_key\": \"$API_KEY\"}}")

echo "$RESULT" | python3 -c "
import sys,json
d = json.load(sys.stdin)
if 'error' in d:
  print(f'Error: {d[\"error\"]}')
else:
  print(f'Created credential: {d[\"name\"]} (id: {d[\"id\"][:12]}...)')
  print(f'Active: {d.get(\"active\", True)}')
" 2>/dev/null

echo ""
echo "Test with:"
MODELS=$(curl -s "$BASE_URL/api/ai-providers/models" | python3 -c "
import sys,json
models = json.load(sys.stdin)
found = [m['model'] for m in models if m['provider'] == '$PROVIDER_NAME'][:3]
print(', '.join(found) if found else '(no models found)')
" 2>/dev/null)
echo "  Available models: $MODELS"
echo ""
echo "  curl -X POST $BASE_URL/api/v2/chat/completions \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -H 'x-user-did: test-user' \\"
echo "    -d '{\"model\": \"$PROVIDER_NAME/<model>\", \"messages\": [{\"role\": \"user\", \"content\": \"hi\"}]}'"
