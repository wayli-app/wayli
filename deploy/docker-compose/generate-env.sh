#!/bin/bash

# Wayli Docker Compose - Secret Generator
# This script generates all required secret values for the Docker Compose setup
# and optionally prompts for configuration values

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Print functions
print_header() {
    echo -e "\n${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}\n"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_info() {
    echo -e "${CYAN}ℹ${NC} $1"
}

# Check for required tools
check_requirements() {
    local missing=0

    if ! command -v openssl &> /dev/null; then
        print_error "openssl is required but not installed"
        missing=1
    fi

    if ! command -v docker &> /dev/null; then
        print_error "docker is required but not installed"
        missing=1
    fi

    if [ $missing -eq 1 ]; then
        echo ""
        print_error "Please install missing dependencies and try again"
        exit 1
    fi
}

# Read existing value from .env file if it exists
get_existing_value() {
    local key=$1
    local file=${2:-.env}

    if [ -f "$file" ]; then
        grep "^${key}=" "$file" 2>/dev/null | cut -d'=' -f2- || echo ""
    else
        echo ""
    fi
}

# Prompt for a value with default
prompt_with_default() {
    local prompt=$1
    local default=$2
    local var_name=$3
    local show_default=${4:-true}

    if [ "$show_default" = "true" ] && [ -n "$default" ]; then
        read -p "$(echo -e ${CYAN}${prompt}${NC}) [${default}]: " value
    else
        read -p "$(echo -e ${CYAN}${prompt}${NC}): " value
    fi

    # Use default if no input provided
    if [ -z "$value" ]; then
        value=$default
    fi

    echo "$value"
}

# Generate a secure random password
generate_password() {
    local length=${1:-32}
    openssl rand -base64 $((length * 3 / 4)) | tr -d '\n' | head -c $length
}

# Generate a secure random base64 string
generate_base64() {
    local length=${1:-48}
    openssl rand -base64 $length | tr -d '\n'
}

# Generate a 32-character encryption key
generate_encryption_key() {
    openssl rand -base64 24 | cut -c1-32
}

# Generate JWT secret (at least 32 characters)
generate_jwt_secret() {
    openssl rand -base64 48 | tr -d '\n'
}

# Update .env file with key=value
update_env_value() {
    local key=$1
    local value=$2
    local file=${3:-.env}

    # Escape special characters for sed
    local escaped_value=$(echo "$value" | sed 's/[&/\]/\\&/g')

    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s|^${key}=.*|${key}=${escaped_value}|" "$file"
    else
        # Linux
        sed -i "s|^${key}=.*|${key}=${escaped_value}|" "$file"
    fi
}

# Generate JWT tokens using Node.js crypto via Docker
generate_jwt_tokens() {
    local jwt_secret=$1

    echo ""
    print_info "Attempting to generate JWT tokens using Docker..."
    echo ""

    # Try to use Node.js via Docker to generate JWT tokens using built-in crypto
    local jwt_output
    if jwt_output=$(docker run --rm node:20-alpine node -e "
        const crypto = require('crypto');

        function base64url(input) {
            return Buffer.from(input)
                .toString('base64')
                .replace(/=/g, '')
                .replace(/\+/g, '-')
                .replace(/\//g, '_');
        }

        function generateToken(role, secret) {
            const now = Math.floor(Date.now() / 1000);
            const exp = now + (10 * 365 * 24 * 60 * 60); // 10 years

            const header = {
                alg: 'HS256',
                typ: 'JWT'
            };

            const payload = {
                role: role,
                iss: 'supabase',
                iat: now,
                exp: exp
            };

            const headerB64 = base64url(JSON.stringify(header));
            const payloadB64 = base64url(JSON.stringify(payload));
            const signature = crypto
                .createHmac('sha256', secret)
                .update(headerB64 + '.' + payloadB64)
                .digest('base64')
                .replace(/=/g, '')
                .replace(/\+/g, '-')
                .replace(/\//g, '_');

            return headerB64 + '.' + payloadB64 + '.' + signature;
        }

        const anonToken = generateToken('anon', '$jwt_secret');
        const serviceToken = generateToken('service_role', '$jwt_secret');
        console.log('ANON_KEY=' + anonToken);
        console.log('SERVICE_ROLE_KEY=' + serviceToken);
    " 2>&1); then
        # Check if output contains tokens (not error messages)
        if echo "$jwt_output" | grep -q "^ANON_KEY=eyJ"; then
            print_success "JWT tokens generated successfully"

            # Extract tokens and update .env
            ANON_KEY=$(echo "$jwt_output" | grep "^ANON_KEY=" | cut -d'=' -f2-)
            SERVICE_ROLE_KEY=$(echo "$jwt_output" | grep "^SERVICE_ROLE_KEY=" | cut -d'=' -f2-)

            update_env_value "ANON_KEY" "$ANON_KEY"
            update_env_value "SERVICE_ROLE_KEY" "$SERVICE_ROLE_KEY"

            return 0
        else
            print_warning "Could not generate JWT tokens automatically"
            echo "Docker output: $jwt_output"
            echo ""
            echo "Please generate JWT tokens manually at:"
            echo "  https://supabase.com/docs/guides/self-hosting/docker#generate-api-keys"
            echo ""
            return 1
        fi
    else
        print_warning "Could not generate JWT tokens automatically (Docker not available?)"
        echo ""
        echo "Please generate JWT tokens manually at:"
        echo "  https://supabase.com/docs/guides/self-hosting/docker#generate-api-keys"
        echo ""
        return 1
    fi
}

# Main script
main() {
    print_header "Wayli Docker Compose - Configuration Setup"

    # Check requirements
    check_requirements

    # Check if .env already exists
    local existing_env=false
    if [ -f .env ]; then
        existing_env=true
        print_warning ".env file already exists"
        read -p "Do you want to reconfigure? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            print_error "Aborted. Existing .env file was not modified."
            exit 0
        fi
        cp .env .env.backup.$(date +%Y%m%d_%H%M%S)
        print_success "Backup created: .env.backup.$(date +%Y%m%d_%H%M%S)"
    fi

    # Copy from example
    if [ ! -f .env.example ]; then
        print_error ".env.example file not found"
        exit 1
    fi

    cp .env.example .env
    print_success "Created .env from .env.example"

    # Configuration Section
    print_header "Configuration"

    echo "Please provide configuration values. Press Enter to use defaults."
    echo "Existing values from your .env will be shown as defaults."
    echo ""

    # Wayli Configuration
    echo -e "${BLUE}Wayli Configuration:${NC}"
    WAYLI_VERSION=$(prompt_with_default "Wayli version" "$(get_existing_value WAYLI_VERSION || echo 'latest')")
    WAYLI_WEB_PORT=$(prompt_with_default "Wayli web port" "$(get_existing_value WAYLI_WEB_PORT || echo '3000')")

    # Domain Configuration
    echo ""
    echo -e "${BLUE}Domain Configuration:${NC}"
    print_info "All CORS and security settings will be derived from these URLs"
    SITE_URL=$(prompt_with_default "Site URL (where users access Wayli)" "$(get_existing_value SITE_URL || echo 'http://localhost:3000')")
    SUPABASE_PUBLIC_URL=$(prompt_with_default "Supabase Public URL (API endpoint)" "$(get_existing_value SUPABASE_PUBLIC_URL || echo 'http://localhost:8000')")

    # Derive Supabase CORS from SITE_URL (extract domain without protocol)
    if [[ "$SITE_URL" == "http://localhost"* ]] || [[ "$SITE_URL" == "https://localhost"* ]]; then
        SUPABASE_CORS_ALLOW_ORIGIN="localhost:3000"
    else
        SUPABASE_CORS_ALLOW_ORIGIN=$(echo "$SITE_URL" | sed -E 's|^https?://||')
    fi

    print_success "Derived settings:"
    echo "  • CSRF Trusted Origins: $SITE_URL (used by SvelteKit)"
    echo "  • Supabase Edge Functions CORS: $SUPABASE_CORS_ALLOW_ORIGIN"

    # Optional Services
    echo ""
    echo -e "${BLUE}Optional Services:${NC}"
    PEXELS_API_KEY=$(prompt_with_default "Pexels API Key (for cover images, optional)" "$(get_existing_value PEXELS_API_KEY)")
    NOMINATIM_ENDPOINT=$(prompt_with_default "Nominatim endpoint (for geocoding)" "$(get_existing_value NOMINATIM_ENDPOINT || echo 'https://nominatim.openstreetmap.org')")

    # Email Configuration
    echo ""
    echo -e "${BLUE}Email Configuration (optional):${NC}"
    print_info "Configure SMTP for sending real emails (password reset, invites, etc.)"
    print_info "If skipped, a fake SMTP server will be used for testing only"
    echo ""
    read -p "$(echo -e ${CYAN}'Do you want to configure SMTP?'${NC}) (y/N): " -n 1 -r
    echo

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        SMTP_HOST=$(prompt_with_default "SMTP host" "$(get_existing_value SMTP_HOST)")
        SMTP_PORT=$(prompt_with_default "SMTP port" "$(get_existing_value SMTP_PORT)")
        SMTP_USER=$(prompt_with_default "SMTP user" "$(get_existing_value SMTP_USER)")
        SMTP_PASS=$(prompt_with_default "SMTP password" "$(get_existing_value SMTP_PASS)")
        SMTP_ADMIN_EMAIL=$(prompt_with_default "Admin email" "$(get_existing_value SMTP_ADMIN_EMAIL)")
        SMTP_SENDER_NAME=$(prompt_with_default "Email sender name" "$(get_existing_value SMTP_SENDER_NAME)")
    else
        # Use defaults for fake SMTP server (from .env.example)
        SMTP_HOST="supabase-mail"
        SMTP_PORT="2500"
        SMTP_USER="fake_mail_user"
        SMTP_PASS="fake_mail_password"
        SMTP_ADMIN_EMAIL="admin@example.com"
        SMTP_SENDER_NAME="fake_sender"
        print_info "Skipped SMTP configuration - using fake SMTP for testing"
    fi

    # Generate secrets
    print_header "Generating Secrets"

    echo "Generating secure random values..."
    echo ""

    POSTGRES_PASSWORD=$(generate_password 40)
    DASHBOARD_PASSWORD=$(generate_password 32)
    MINIO_ROOT_PASSWORD=$(generate_password 32)
    SECRET_KEY_BASE=$(generate_base64 48)
    VAULT_ENC_KEY=$(generate_encryption_key)
    PG_META_CRYPTO_KEY=$(generate_encryption_key)
    JWT_SECRET=$(generate_jwt_secret)

    print_success "POSTGRES_PASSWORD: Generated (40 chars)"
    print_success "DASHBOARD_PASSWORD: Generated (32 chars)"
    print_success "MINIO_ROOT_PASSWORD: Generated (32 chars)"
    print_success "SECRET_KEY_BASE: Generated (base64, 48 bytes)"
    print_success "VAULT_ENC_KEY: Generated (32 chars)"
    print_success "PG_META_CRYPTO_KEY: Generated (32 chars)"
    print_success "JWT_SECRET: Generated (base64, 48 bytes)"

    # Update .env file with all values
    print_header "Writing Configuration"

    # Secrets
    update_env_value "POSTGRES_PASSWORD" "$POSTGRES_PASSWORD"
    update_env_value "DASHBOARD_PASSWORD" "$DASHBOARD_PASSWORD"
    update_env_value "MINIO_ROOT_PASSWORD" "$MINIO_ROOT_PASSWORD"
    update_env_value "SECRET_KEY_BASE" "$SECRET_KEY_BASE"
    update_env_value "VAULT_ENC_KEY" "$VAULT_ENC_KEY"
    update_env_value "PG_META_CRYPTO_KEY" "$PG_META_CRYPTO_KEY"
    update_env_value "JWT_SECRET" "$JWT_SECRET"

    # Configuration
    update_env_value "WAYLI_VERSION" "$WAYLI_VERSION"
    update_env_value "WAYLI_WEB_PORT" "$WAYLI_WEB_PORT"
    update_env_value "SITE_URL" "$SITE_URL"
    update_env_value "SUPABASE_PUBLIC_URL" "$SUPABASE_PUBLIC_URL"
    update_env_value "SUPABASE_CORS_ALLOW_ORIGIN" "$SUPABASE_CORS_ALLOW_ORIGIN"
    update_env_value "PEXELS_API_KEY" "$PEXELS_API_KEY"
    update_env_value "NOMINATIM_ENDPOINT" "$NOMINATIM_ENDPOINT"
    update_env_value "SMTP_HOST" "$SMTP_HOST"
    update_env_value "SMTP_PORT" "$SMTP_PORT"
    update_env_value "SMTP_USER" "$SMTP_USER"
    update_env_value "SMTP_PASS" "$SMTP_PASS"
    update_env_value "SMTP_ADMIN_EMAIL" "$SMTP_ADMIN_EMAIL"
    update_env_value "SMTP_SENDER_NAME" "$SMTP_SENDER_NAME"

    print_success "All configuration written to .env"

    # Generate JWT tokens
    generate_jwt_tokens "$JWT_SECRET"

    # Summary
    print_header "Setup Complete!"

    echo "Your configuration has been saved to .env"
    echo ""
    echo "Summary:"
    echo "  • Wayli version: ${WAYLI_VERSION}"
    echo "  • Web port: ${WAYLI_WEB_PORT}"
    echo "  • Site URL: ${SITE_URL}"
    echo "  • Supabase URL: ${SUPABASE_PUBLIC_URL}"
    echo ""

    # Check if JWT tokens were successfully generated
    ANON_KEY=$(get_existing_value "ANON_KEY")
    if [ -z "$ANON_KEY" ] || [ "$ANON_KEY" = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"* ]; then
        print_warning "JWT tokens still need to be configured manually"
        echo "  Update ANON_KEY and SERVICE_ROLE_KEY in .env"
        echo "  Visit: https://supabase.com/docs/guides/self-hosting/docker#generate-api-keys"
        echo ""
    else
        print_success "JWT tokens were successfully generated"
        echo ""
    fi

    echo "Next steps:"
    echo "  1. Review your .env file and make any additional customizations"
    echo "  2. Start the services: docker compose up -d"
    echo "  3. Access Wayli at: ${SITE_URL}"
    echo "  4. Access Supabase Studio at: ${SUPABASE_PUBLIC_URL}"
    echo ""
    print_success "Configuration complete!"
    echo ""
    print_warning "Keep your .env file secure and never commit it to version control"
}

# Run main function
main "$@"
