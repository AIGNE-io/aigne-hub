#!/bin/bash
# Quick script to analyze pricing and generate HTML report
# Usage: bash scripts/analyze-and-report.sh [env] [threshold]
#
# Examples:
#   bash scripts/analyze-and-report.sh staging 0.1
#   bash scripts/analyze-and-report.sh production 0.15

ENV=${1:-staging}
THRESHOLD=${2:-0.1}
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUTPUT_DIR="$SCRIPT_DIR/../output"
mkdir -p "$OUTPUT_DIR"

OUTPUT_FILE="pricing-analysis-${ENV}-${TIMESTAMP}.html"

echo "🎯 AIGNE Hub Pricing Analysis"
echo "Environment: $ENV"
echo "Threshold: ${THRESHOLD} ($(echo "$THRESHOLD * 100" | bc)%)"
echo ""

# Run analysis and get JSON output
echo "📊 Fetching pricing data..."
pnpm tsx scripts/analyze-pricing.ts --env "$ENV" --threshold "$THRESHOLD" --json > "$OUTPUT_DIR/pricing-raw.json" 2>&1

# Clean JSON (remove console output)
sed -n '/^\[/,$p' "$OUTPUT_DIR/pricing-raw.json" > "$OUTPUT_DIR/pricing-clean.json"

# Generate HTML report
echo "📝 Generating HTML report..."
node scripts/generate-html-report.mjs "$OUTPUT_DIR/pricing-clean.json" "$OUTPUT_FILE"

# Get absolute path
FULL_PATH=$(realpath "$OUTPUT_FILE")

echo ""
echo "✅ Report generated successfully!"
echo "📄 File: $FULL_PATH"
echo "🌐 Open in browser: file://$FULL_PATH"
echo ""

# Try to open in default browser (optional)
if command -v open &> /dev/null; then
  read -p "Open in browser now? (y/N) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    open "$FULL_PATH"
  fi
fi
