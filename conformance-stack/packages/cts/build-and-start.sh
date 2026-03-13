#!/bin/bash

echo "Building core package..."
cd ../core
pnpm run build
echo "Core package built successfully!"

echo "Starting development server..."
cd ../cts
pnpm dev
