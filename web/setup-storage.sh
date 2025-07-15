#!/bin/bash

# Setup Storage Buckets for Wayli
# This script helps set up the required storage buckets for file uploads

echo "🚀 Setting up Wayli storage buckets..."

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI is not installed. Please install it first:"
    echo "   npm install -g supabase"
    exit 1
fi

# Check if we're in the right directory
if [ ! -f "supabase/config.toml" ]; then
    echo "❌ Please run this script from the web directory"
    exit 1
fi

echo "📦 Creating storage buckets..."

# Run the storage setup SQL
echo "🔧 Running storage setup SQL..."
supabase db reset --linked

echo "✅ Storage setup completed!"
echo ""
echo "📋 Created buckets:"
echo "   - temp-files (private, 1GB limit, for import files)"
echo "   - trip-images (public, 10MB limit, for trip images)"
echo ""
echo "🔒 Storage policies have been configured for:"
echo "   - User isolation (users can only access their own files)"
echo "   - Service role access (for background processing)"
echo ""
echo "🎉 You can now upload files and images!"