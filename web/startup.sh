#!/bin/bash

echo "🔧 Injecting environment variables..."

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
