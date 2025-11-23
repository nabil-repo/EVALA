#!/bin/bash
set -euo pipefail
NETWORK="${1:-devnet}"

# Store current directory and change to contracts
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONTRACT_DIR="$SCRIPT_DIR/../contracts"
cd "$CONTRACT_DIR"

echo "Building Move package..."
sui move build

echo "Publishing to $NETWORK..."
sui client publish --gas-budget 100000000 --json --skip-fetch-latest-git-deps --skip-dependency-verification

# Return to original directory
cd - >/dev/null

echo "Remember to set NEXT_PUBLIC_PACKAGE_ID,NEXT_PUBLIC_VOTEBOOK_ID,NEXT_PUBLIC_REPUTATION_ID,NEXT_PUBLIC_UPGRADE_CAP and NEXT_PUBLIC_DEPLOY_TX ,etc in frontend/.env"
echo "You can find the IDs in the output above or by running:"

