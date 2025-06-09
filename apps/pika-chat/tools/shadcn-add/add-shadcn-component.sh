#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

# Check if an argument was provided
if [ -z "$1" ]; then
  echo "Error: Component name is required."
  echo "Usage: npm run shadcn-add -- <component-name>"
  exit 1
fi

COMPONENT_NAME=$1

echo "Adding component: $COMPONENT_NAME..."
npx shadcn-svelte@next add "$COMPONENT_NAME"

echo "Component '$COMPONENT_NAME' added. Running normalize-icons npm script..."
npm run normalize-icons

npm run format

echo "Done."