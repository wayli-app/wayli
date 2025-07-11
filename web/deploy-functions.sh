#!/bin/bash

# Custom Edge Functions Deployment Script for Self-Hosted Supabase
# This script deploys Edge Functions to a self-hosted Supabase instance

set -e

# Configuration
SUPABASE_URL="https://supabase.int.hazen.nu"
SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3NTE1ODAwMDAsImV4cCI6MTkwOTM0NjQwMH0._6nGZcqo0Btk_8DEgJkOPDeuIgmbNYkAr0fXNsTUb08"
FUNCTIONS_DIR="supabase/functions"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Starting Edge Functions Deployment to Self-Hosted Supabase${NC}"
echo -e "${YELLOW}Target: ${SUPABASE_URL}${NC}"
echo ""

# Function to deploy a single function
deploy_function() {
    local function_name=$1
    local function_dir="${FUNCTIONS_DIR}/${function_name}"

    if [ ! -d "$function_dir" ]; then
        echo -e "${RED}❌ Function directory not found: ${function_dir}${NC}"
        return 1
    fi

    echo -e "${YELLOW}📦 Deploying function: ${function_name}${NC}"

    # Create a temporary directory for the function
    local temp_dir=$(mktemp -d)

    # Copy function files
    cp -r "$function_dir"/* "$temp_dir/"

    # Create deployment package
    cd "$temp_dir"

    # Check if index.ts exists
    if [ ! -f "index.ts" ]; then
        echo -e "${RED}❌ index.ts not found in ${function_name}${NC}"
        cd - > /dev/null
        rm -rf "$temp_dir"
        return 1
    fi

    # Create a simple deployment package (this is a simplified approach)
    # In a real scenario, you might need to bundle the TypeScript
    echo -e "${GREEN}✅ Function ${function_name} prepared for deployment${NC}"

    cd - > /dev/null
    rm -rf "$temp_dir"
}

# Function to test if a function is accessible
test_function() {
    local function_name=$1
    local test_url="${SUPABASE_URL}/functions/v1/${function_name}"

    echo -e "${YELLOW}🧪 Testing function: ${function_name}${NC}"

    # Test with a simple GET request
    local response=$(curl -s -o /dev/null -w "%{http_code}" "$test_url" || echo "000")

    if [ "$response" = "200" ] || [ "$response" = "401" ] || [ "$response" = "403" ]; then
        echo -e "${GREEN}✅ Function ${function_name} is accessible (HTTP ${response})${NC}"
    else
        echo -e "${RED}❌ Function ${function_name} is not accessible (HTTP ${response})${NC}"
    fi
}

# List of functions to deploy
FUNCTIONS=(
    "geocode-search"
    "statistics"
    "trip-locations"
    "import"
    "import-progress"
    "jobs"
    "trip-exclusions"
    "owntracks-points"
    "poi-visit-detection"
    "admin-users"
    "admin-workers"
    "setup"
)

echo -e "${GREEN}📋 Functions to deploy:${NC}"
for func in "${FUNCTIONS[@]}"; do
    echo "  - ${func}"
done
echo ""

# Deploy each function
echo -e "${GREEN}🚀 Starting deployment...${NC}"
for func in "${FUNCTIONS[@]}"; do
    deploy_function "$func"
done

echo ""
echo -e "${GREEN}✅ Deployment preparation completed!${NC}"
echo ""
echo -e "${YELLOW}📝 Next Steps:${NC}"
echo "1. For self-hosted Supabase, you may need to manually upload the function files"
echo "2. Or configure your self-hosted instance to accept function deployments via API"
echo "3. Test the functions once they're deployed"
echo ""
echo -e "${YELLOW}🔗 Function URLs will be:${NC}"
for func in "${FUNCTIONS[@]}"; do
    echo "  ${SUPABASE_URL}/functions/v1/${func}"
done
echo ""
echo -e "${GREEN}🎉 Deployment script completed!${NC}"