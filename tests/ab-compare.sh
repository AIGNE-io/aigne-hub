#!/usr/bin/env bash
# =============================================================================
# AIGNE Hub A/B Comparison Test
#
# Compares Blocklet Server (BS) vs Cloudflare Workers (CF) on:
#   A. Functional correctness — response format, fields, credit reporting
#   B. Performance — TTFB, total latency, overhead breakdown
#
# Usage:
#   ./tests/ab-compare.sh                    # Run all tests
#   ./tests/ab-compare.sh --perf-only        # Performance only (skip format checks)
#   ./tests/ab-compare.sh --model gpt-5      # Test specific model
#   ./tests/ab-compare.sh --rounds 10        # Number of rounds per model
# =============================================================================

set -uo pipefail

# --- Config ---
BS_URL="https://staging-hub.aigne.io"
CF_URL="https://aigne-hub-staging.zhuzhuyule-779.workers.dev"
BS_KEY="blocklet-zHQbHBUnMEwnxWmEXFkCKjiYxztNvxtYZsL4sGA7sW8MP"
CF_KEY="blocklet-zCGSTnrTwPk2bUEFevqJvfRfqEoMugtztTdcPPZ2VLjnB"

ROUNDS=5
PERF_ONLY=false
TARGET_MODEL=""
PROMPT="Respond with exactly: 'Test OK'. Nothing else."

# Parse args
while [[ $# -gt 0 ]]; do
  case $1 in
    --perf-only) PERF_ONLY=true; shift ;;
    --model) TARGET_MODEL="$2"; shift 2 ;;
    --rounds) ROUNDS="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

# --- Colors ---
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

# --- Helpers ---
timestamp() { date +%s%3N; }

call_api() {
  local url="$1" key="$2" model="$3" prompt="$4"
  local tmpfile
  tmpfile=$(mktemp)

  local http_code
  http_code=$(curl -s -o "$tmpfile" -w "%{http_code}|%{time_starttransfer}|%{time_total}" \
    "${url}/api/v2/chat/completions" \
    -H "Authorization: Bearer ${key}" \
    -H "Content-Type: application/json" \
    -d "{\"model\":\"${model}\",\"messages\":[{\"role\":\"user\",\"content\":\"${prompt}\"}]}" \
    2>/dev/null)

  local status ttfb total
  status=$(echo "$http_code" | cut -d'|' -f1)
  ttfb=$(echo "$http_code" | cut -d'|' -f2)
  total=$(echo "$http_code" | cut -d'|' -f3)

  echo "${status}|${ttfb}|${total}|$(cat "$tmpfile")"
  rm -f "$tmpfile"
}

check_field() {
  local json="$1" field="$2" label="$3"
  local val
  val=$(echo "$json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d.get('$field', '__MISSING__')))" 2>/dev/null)
  if [[ "$val" == '"__MISSING__"' || "$val" == "__MISSING__" ]]; then
    echo -e "  ${RED}MISS${NC} $label ($field)"
    return 1
  else
    echo -e "  ${GREEN}OK${NC}   $label ($field) = $(echo "$val" | head -c 60)"
    return 0
  fi
}

check_nested() {
  local json="$1" path="$2" label="$3"
  local val
  val=$(echo "$json" | python3 -c "
import sys,json
d=json.load(sys.stdin)
keys='$path'.split('.')
for k in keys:
    if isinstance(d,dict): d=d.get(k,'__MISSING__')
    else: d='__MISSING__'
print(json.dumps(d))
" 2>/dev/null)
  if [[ "$val" == '"__MISSING__"' || "$val" == "__MISSING__" ]]; then
    echo -e "  ${RED}MISS${NC} $label ($path)"
    return 1
  else
    echo -e "  ${GREEN}OK${NC}   $label ($path) = $(echo "$val" | head -c 60)"
    return 0
  fi
}

# --- Models to test ---
# Use common models or target model
if [[ -n "$TARGET_MODEL" ]]; then
  MODELS=("$TARGET_MODEL")
else
  MODELS=("gemini-3-flash-preview" "gpt-5" "claude-haiku-3-5")
fi

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN} AIGNE Hub A/B Comparison Test${NC}"
echo -e "${CYAN}========================================${NC}"
echo -e "BS: $BS_URL"
echo -e "CF: $CF_URL"
echo -e "Rounds: $ROUNDS | Models: ${MODELS[*]}"
echo ""

# =============================================================================
# Part A: Functional Correctness
# =============================================================================
if [[ "$PERF_ONLY" == "false" ]]; then
  echo -e "${YELLOW}=== Part A: Functional Correctness ===${NC}"
  echo ""

  for model in "${MODELS[@]}"; do
    echo -e "${CYAN}--- Model: $model ---${NC}"

    # Call BS
    echo -e "\n${YELLOW}[BS] Calling...${NC}"
    bs_result=$(call_api "$BS_URL" "$BS_KEY" "$model" "$PROMPT")
    bs_status=$(echo "$bs_result" | cut -d'|' -f1)
    bs_body=$(echo "$bs_result" | cut -d'|' -f4-)

    if [[ "$bs_status" != "200" ]]; then
      echo -e "  ${RED}FAIL${NC} HTTP $bs_status"
      echo "  Body: $(echo "$bs_body" | head -c 200)"
    else
      echo -e "  ${GREEN}HTTP 200${NC}"
      echo -e "  Checking AIGNE format fields:"
      check_field "$bs_body" "role" "role"
      check_field "$bs_body" "text" "text"
      check_field "$bs_body" "content" "content"
      check_field "$bs_body" "modelWithProvider" "modelWithProvider"
      check_nested "$bs_body" "usage.inputTokens" "usage.inputTokens"
      check_nested "$bs_body" "usage.outputTokens" "usage.outputTokens"
      check_nested "$bs_body" "usage.aigneHubCredits" "usage.aigneHubCredits"
    fi

    # Call CF
    echo -e "\n${YELLOW}[CF] Calling...${NC}"
    cf_result=$(call_api "$CF_URL" "$CF_KEY" "$model" "$PROMPT")
    cf_status=$(echo "$cf_result" | cut -d'|' -f1)
    cf_body=$(echo "$cf_result" | cut -d'|' -f4-)

    if [[ "$cf_status" != "200" ]]; then
      echo -e "  ${RED}FAIL${NC} HTTP $cf_status"
      echo "  Body: $(echo "$cf_body" | head -c 200)"
    else
      echo -e "  ${GREEN}HTTP 200${NC}"
      echo -e "  Checking AIGNE format fields:"
      check_field "$cf_body" "role" "role"
      check_field "$cf_body" "text" "text"
      check_field "$cf_body" "content" "content"
      check_field "$cf_body" "modelWithProvider" "modelWithProvider"
      check_nested "$cf_body" "usage.inputTokens" "usage.inputTokens"
      check_nested "$cf_body" "usage.outputTokens" "usage.outputTokens"
      check_nested "$cf_body" "usage.aigneHubCredits" "usage.aigneHubCredits"

      echo -e "  Checking OpenAI compat fields:"
      check_field "$cf_body" "id" "id"
      check_field "$cf_body" "object" "object"
      check_field "$cf_body" "model" "model"
      check_nested "$cf_body" "choices" "choices"
      check_nested "$cf_body" "usage.prompt_tokens" "usage.prompt_tokens"
      check_nested "$cf_body" "usage.completion_tokens" "usage.completion_tokens"
    fi

    echo ""
  done
fi

# =============================================================================
# Part B: Performance Comparison
# =============================================================================
echo -e "${YELLOW}=== Part B: Performance Comparison ===${NC}"
echo ""

for model in "${MODELS[@]}"; do
  echo -e "${CYAN}--- Model: $model ($ROUNDS rounds) ---${NC}"

  bs_ttfbs=()
  cf_ttfbs=()
  bs_totals=()
  cf_totals=()
  bs_fails=0
  cf_fails=0

  for i in $(seq 1 "$ROUNDS"); do
    # BS call
    bs_result=$(call_api "$BS_URL" "$BS_KEY" "$model" "Reply with one word: round $i")
    bs_status=$(echo "$bs_result" | cut -d'|' -f1)
    bs_ttfb=$(echo "$bs_result" | cut -d'|' -f2)
    bs_total=$(echo "$bs_result" | cut -d'|' -f3)

    if [[ "$bs_status" == "200" ]]; then
      bs_ttfbs+=("$bs_ttfb")
      bs_totals+=("$bs_total")
    else
      ((bs_fails++))
    fi

    # CF call
    cf_result=$(call_api "$CF_URL" "$CF_KEY" "$model" "Reply with one word: round $i")
    cf_status=$(echo "$cf_result" | cut -d'|' -f1)
    cf_ttfb=$(echo "$cf_result" | cut -d'|' -f2)
    cf_total=$(echo "$cf_result" | cut -d'|' -f3)

    if [[ "$cf_status" == "200" ]]; then
      cf_ttfbs+=("$cf_ttfb")
      cf_totals+=("$cf_total")
    else
      ((cf_fails++))
    fi

    printf "  Round %d: BS=%ss CF=%ss (HTTP: BS=%s CF=%s)\n" "$i" "$bs_total" "$cf_total" "$bs_status" "$cf_status"
  done

  # Calculate averages
  if [[ ${#bs_ttfbs[@]} -gt 0 ]]; then
    bs_avg_ttfb=$(printf '%s\n' "${bs_ttfbs[@]}" | awk '{s+=$1} END {printf "%.3f", s/NR}')
    bs_avg_total=$(printf '%s\n' "${bs_totals[@]}" | awk '{s+=$1} END {printf "%.3f", s/NR}')
  else
    bs_avg_ttfb="N/A"; bs_avg_total="N/A"
  fi

  if [[ ${#cf_ttfbs[@]} -gt 0 ]]; then
    cf_avg_ttfb=$(printf '%s\n' "${cf_ttfbs[@]}" | awk '{s+=$1} END {printf "%.3f", s/NR}')
    cf_avg_total=$(printf '%s\n' "${cf_totals[@]}" | awk '{s+=$1} END {printf "%.3f", s/NR}')
  else
    cf_avg_ttfb="N/A"; cf_avg_total="N/A"
  fi

  echo ""
  echo -e "  ${YELLOW}Results:${NC}"
  printf "  %-20s %-15s %-15s %-10s\n" "" "Avg TTFB" "Avg Total" "Fails"
  printf "  %-20s %-15s %-15s %-10s\n" "Blocklet Server" "${bs_avg_ttfb}s" "${bs_avg_total}s" "$bs_fails/$ROUNDS"
  printf "  %-20s %-15s %-15s %-10s\n" "CF Workers" "${cf_avg_ttfb}s" "${cf_avg_total}s" "$cf_fails/$ROUNDS"

  if [[ "$bs_avg_ttfb" != "N/A" && "$cf_avg_ttfb" != "N/A" ]]; then
    diff=$(echo "$cf_avg_ttfb $bs_avg_ttfb" | awk '{printf "%.3f", ($1-$2)*1000}')
    if (( $(echo "$diff < 0" | bc -l) )); then
      echo -e "  ${GREEN}CF is ${diff#-}ms faster${NC}"
    else
      echo -e "  ${RED}CF is ${diff}ms slower${NC}"
    fi
  fi
  echo ""
done

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN} Test Complete${NC}"
echo -e "${CYAN}========================================${NC}"
