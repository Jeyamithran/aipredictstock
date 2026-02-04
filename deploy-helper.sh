#!/bin/bash

# AI Predict Pro - Quick Deployment Helper Script
# This script prepares your deployment but Cloud AI Studio requires manual upload

set -e

echo "🚀 AI Predict Pro - Cloud AI Studio Deployment Helper"
echo "=================================================="
echo ""

# Check if dist exists
if [ ! -d "dist" ]; then
    echo "📦 Building production bundle..."
    npm run build
    echo "✅ Build complete!"
else
    echo "✅ Production build found in dist/"
fi

echo ""
echo "📊 Build Summary:"
echo "----------------"
du -sh dist/
ls -lh dist/

echo ""
echo "📋 Deployment Checklist:"
echo "------------------------"
echo "1. ✅ Production build ready in ./dist/"
echo "2. ⏳ Sign in to Cloud AI Studio: https://aistudio.google.com"
echo "3. ⏳ Navigate to your deployed app/project"
echo "4. ⏳ Click 'Update' or 'Redeploy'"
echo "5. ⏳ Upload contents of ./dist/ directory"
echo "6. ⏳ Verify GEMINI_API_KEY is set in environment"
echo "7. ⏳ Click 'Deploy' to publish changes"

echo ""
echo "🌐 Opening Cloud AI Studio in your browser..."
open "https://aistudio.google.com" || xdg-open "https://aistudio.google.com" 2>/dev/null || echo "Please navigate to: https://aistudio.google.com"

echo ""
echo "📖 Full deployment guide: ./CLOUD_AI_STUDIO_DEPLOY.md"
echo ""
echo "✨ Your app is ready to deploy!"
