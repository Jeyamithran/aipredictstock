#!/bin/bash

# AI Predict Pro - Cloud Run Deployment Script
# Deploys directly to Google Cloud Run from local source

set -e

echo "🚀 Deploying AI Predict Pro to Google Cloud Run"
echo "================================================"
echo ""

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "❌ Error: gcloud CLI not installed"
    echo "Install with: brew install --cask google-cloud-sdk"
    exit 1
fi

# Check if logged in
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" &> /dev/null; then
    echo "🔑 Please login to Google Cloud..."
    gcloud auth login
fi

# Get project ID
PROJECT_ID=$(gcloud config get-value project 2>/dev/null)

if [ -z "$PROJECT_ID" ]; then
    echo "📋 Please set your Google Cloud project ID:"
    read -p "Project ID: " PROJECT_ID
    gcloud config set project $PROJECT_ID
fi

echo "✅ Using project: $PROJECT_ID"
echo ""

# Check for GEMINI_API_KEY
if [ -f ".env" ]; then
    export $(cat .env | grep GEMINI_API_KEY | xargs)
fi

if [ -z "$GEMINI_API_KEY" ]; then
    echo "🔑 Please enter your Gemini API key:"
    read -sp "Gemini API Key: " GEMINI_API_KEY
    echo ""
fi

# Check for VITE_OPENAI_API_KEY
if [ -f ".env" ]; then
    export $(cat .env | grep VITE_OPENAI_API_KEY | xargs)
fi

if [ -z "$VITE_OPENAI_API_KEY" ]; then
    echo "🔑 Please enter your OpenAI API key (VITE_OPENAI_API_KEY):"
    read -sp "OpenAI API Key: " VITE_OPENAI_API_KEY
    echo ""
fi

# Enable required APIs
echo "🔧 Enabling required Google Cloud APIs..."
gcloud services enable cloudbuild.googleapis.com run.googleapis.com --quiet

echo ""
echo "🐳 Building and deploying to Cloud Run..."
echo ""

# Deploy to Cloud Run
gcloud run deploy ai-predict-pro \
    --source . \
    --region us-central1 \
    --platform managed \
    --allow-unauthenticated \
    --set-env-vars GEMINI_API_KEY="$GEMINI_API_KEY",VITE_OPENAI_API_KEY="$VITE_OPENAI_API_KEY" \
    --memory 512Mi \
    --cpu 1 \
    --max-instances 10 \
    --port 8080

echo ""
echo "✨ Deployment complete!"
echo ""
echo "Your app is now live at:"
gcloud run services describe ai-predict-pro --region us-central1 --format='value(status.url)'
echo ""
