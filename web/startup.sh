#!/bin/bash

echo "🔧 Injecting environment variables..."

# Extract domain from SUPABASE_URL for CSP header
# Example: https://xyz.supabase.co -> https://*.supabase.co
if [ -n "$SUPABASE_URL" ]; then
  # Extract the protocol and domain pattern
  SUPABASE_DOMAIN=$(echo "$SUPABASE_URL" | sed -E 's|(https?://)[^.]+\.(.+)|\1*.\2|')
  echo "📍 Supabase domain: $SUPABASE_DOMAIN"
else
  echo "⚠️  Warning: SUPABASE_URL not set, using default CSP"
  SUPABASE_DOMAIN="https://*.supabase.co"
fi

# Inject CSP into nginx config
echo "🔐 Configuring Content Security Policy..."
sed -i "s|{{SUPABASE_DOMAIN}}|$SUPABASE_DOMAIN|g" /etc/nginx/nginx.conf

# Navigate to nginx html directory
cd /usr/share/nginx/html

# Inject environment variables into HTML files
for file in *.html; do
  if [ -f "$file" ]; then
    echo "📝 Processing $file..."
    sed -i "s|{{SUPABASE_URL}}|$SUPABASE_URL|g" "$file"
    sed -i "s|{{SUPABASE_ANON_KEY}}|$SUPABASE_ANON_KEY|g" "$file"
    sed -i "s|{{SUPABASE_SERVICE_ROLE_KEY}}|$SUPABASE_SERVICE_ROLE_KEY|g" "$file"
  fi
done

echo "✅ Configuration injected successfully"

# Start nginx in foreground
echo "🌐 Starting nginx..."
exec nginx -g "daemon off;"
