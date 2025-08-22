#!/bin/bash

# Setup git commit message template for semantic versioning

echo "🔧 Setting up git commit message template for semantic versioning..."

# Check if .gitmessage exists
if [ ! -f ".gitmessage" ]; then
    echo "❌ .gitmessage file not found. Please run this script from the project root."
    exit 1
fi

# Set the commit message template
git config commit.template .gitmessage

echo "✅ Git commit message template configured!"
echo ""
echo "📝 Now when you run 'git commit' without -m, it will open the template."
echo "💡 Use conventional commit format for automatic semantic versioning:"
echo "   - feat(web): add new feature"
echo "   - fix(auth): resolve bug"
echo "   - docs: update documentation"
echo ""
echo "🔄 The CI pipeline will automatically:"
echo "   - Analyze your commit messages"
echo "   - Bump version numbers"
echo "   - Create GitHub releases"
echo "   - Tag Docker images"
echo ""
echo "📚 See README.md for more details on commit message format."
