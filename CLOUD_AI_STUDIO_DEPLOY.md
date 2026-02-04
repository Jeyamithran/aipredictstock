# Cloud AI Studio Deployment Guide

This guide covers how to update your AI Predict Pro Dashboard deployment on Cloud AI Studio.

## Latest Changes Included

✅ **SPY Percentage Fix** - Corrected the bug where SPY ticker showed 0.00% change  
✅ **After-Hours Data Support** - Added real-time after-hours trading data display  
✅ **Improved Data Status Indicators** - Enhanced UI to show "Realtime", "After Hours", or "Delayed" status

## Prerequisites

- Your Gemini API key configured in Cloud AI Studio environment
- Node.js and npm installed locally (for building)
- Access to your Cloud AI Studio project

## Build Production Bundle

The production build has already been created. If you need to rebuild:

```bash
cd /Users/jeyakar/geminiaiprediction/geminitradepredict
npm run build
```

This creates an optimized production bundle in the `dist/` directory.

## Environment Variables

Your application requires the following environment variable in Cloud AI Studio:

| Variable | Description | Required |
|----------|-------------|----------|
| `GEMINI_API_KEY` | Your Google Gemini API key for AI analysis | Yes |

> **Note**: The FMP API key is configured by end-users through the app's Settings UI, so it doesn't need to be set in the deployment environment.

## Deployment Methods

### Method 1: Cloud AI Studio UI (Recommended)

1. **Navigate to Cloud AI Studio**
   - Go to [https://aistudio.google.com](https://aistudio.google.com)
   - Open your existing deployed project

2. **Upload Updated Files**
   - Click on "Update App" or "Redeploy"
   - Upload the contents of the `dist/` directory
   - Ensure `index.html` is set as the entry point

3. **Configure Environment Variables**
   - In the deployment settings, ensure `GEMINI_API_KEY` is set
   - Save the configuration

4. **Deploy**
   - Click "Deploy" to update your live application
   - Wait for the deployment to complete (usually 1-2 minutes)

### Method 2: Using CLI (If Available)

If Cloud AI Studio provides CLI access:

```bash
# Authenticate
gcloud auth login

# Set your project
gcloud config set project YOUR_PROJECT_ID

# Deploy from dist directory
cd dist
# Follow Cloud AI Studio's CLI deployment command
```

## Post-Deployment Verification

After deployment, verify the following:

1. **Application Loads**
   - Visit your Cloud AI Studio URL
   - Confirm the app loads without errors

2. **Test API Keys**
   - Open Settings modal
   - Verify Gemini AI shows as "Connected"
   - Add your FMP API key if needed

3. **Test Stock Data**
   - Add a ticker (e.g., "AAPL", "SPY")
   - Verify the percentage change displays correctly (not 0.00%)
   - Check the data status badge (Realtime/After Hours/Delayed)

4. **Test AI Analysis**
   - Select a stock
   - Click "Generate Strategy"
   - Confirm AI analysis completes successfully

5. **Test After-Hours Data**
   - During after-hours trading (4PM-8PM ET), verify:
     - Status shows "After Hours" instead of "Delayed"
     - Current after-hours prices are displayed

## Troubleshooting

### Build Issues

**Problem**: Build fails with module errors  
**Solution**: 
```bash
rm -rf node_modules package-lock.json
npm install
npm run build
```

### API Key Issues

**Problem**: Gemini AI shows "Not Configured"  
**Solution**: 
- Ensure `GEMINI_API_KEY` is set in Cloud AI Studio environment variables
- Redeploy after adding the key

**Problem**: Stock data doesn't load  
**Solution**:
- This is expected - users need to configure their own FMP API key via Settings
- Test with a valid FMP API key from [https://financialmodelingprep.com](https://financialmodelingprep.com)

### Deployment Fails

**Problem**: Deployment fails or times out  
**Solution**:
- Check Cloud AI Studio logs for specific errors
- Ensure `dist/` folder contains `index.html` and `assets/` directory
- Verify the build completed successfully without errors

## File Structure

After building, your `dist/` directory should contain:

```
dist/
├── index.html          # Main entry point
└── assets/
    └── index-*.js      # Bundled JavaScript (minified)
```

## Performance Notes

- Production bundle size: ~597 KB (179 KB gzipped)
- First load time: <2 seconds on typical connections
- Subsequent loads benefit from browser caching

## Next Steps

1. Build the production bundle (already completed)
2. Upload `dist/` contents to Cloud AI Studio
3. Verify environment variables are configured
4. Deploy and test the updated application

For any deployment issues, refer to Cloud AI Studio's official documentation or contact Google Cloud support.
