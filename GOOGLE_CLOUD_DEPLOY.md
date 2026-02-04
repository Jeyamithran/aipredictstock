# Deploy to Google Cloud Platform from GitHub

This guide covers multiple methods to deploy your AI Predict Pro dashboard to Google Cloud Platform directly from your GitHub repository.

## Deployment Options

| Method | Best For | Complexity | Auto-scaling | Cost |
|--------|----------|------------|--------------|------|
| **Cloud Run** | Containerized apps | Medium | Yes | Pay-per-use |
| **Firebase Hosting** | Static sites | Easy | Yes | Free tier available |
| **App Engine** | Simple deployments | Easy | Yes | Always-on costs |

## Option 1: Cloud Run (Recommended)

Cloud Run is ideal for containerized web applications with automatic scaling and pay-per-use pricing.

### Prerequisites

1. Install Google Cloud CLI:
   ```bash
   # macOS
   brew install --cask google-cloud-sdk
   ```

2. Authenticate and set project:
   ```bash
   gcloud auth login
   gcloud config set project YOUR_PROJECT_ID
   ```

### Setup

1. **Create Dockerfile** (if not exists):
   ```dockerfile
   # Already created - see Dockerfile in project root
   ```

2. **Enable required APIs**:
   ```bash
   gcloud services enable cloudbuild.googleapis.com run.googleapis.com
   ```

3. **Deploy from GitHub**:
   ```bash
   gcloud run deploy ai-predict-pro \
     --source https://github.com/Jeyamithran/geminitradepredict \
     --region us-central1 \
     --platform managed \
     --allow-unauthenticated \
     --set-env-vars GEMINI_API_KEY=your_gemini_api_key_here
   ```

   Or deploy from local directory:
   ```bash
   gcloud run deploy ai-predict-pro \
     --source . \
     --region us-central1 \
     --platform managed \
     --allow-unauthenticated \
     --set-env-vars GEMINI_API_KEY=your_gemini_api_key_here
   ```

### Continuous Deployment from GitHub

Set up automatic deployment when you push to GitHub:

1. **Connect GitHub Repository**:
   - Go to [Cloud Build](https://console.cloud.google.com/cloud-build/triggers)
   - Click "Connect Repository"
   - Select GitHub and authorize
   - Choose your repository: `Jeyamithran/geminitradepredict`

3. **Create Build Trigger**:
   - Go to [Cloud Build Triggers](https://console.cloud.google.com/cloud-build/triggers)
   - Click **Create Trigger**
   - Name: `deploy-main`
   - Event: `Push to a branch`
   - Source: Select your repository
   - Branch: `^main$`
   - Configuration: `Cloud Build configuration file (yaml or json)`
   - Location: `cloudbuild.yaml` (default)
   - **Advanced Settings -> Substitution variables** (CRITICAL STEP):
     Add the following variables (values from your local `.env` file):
     
     | Variable | Value |
     |----------|-------|
     | `_VITE_FMP_API_KEY` | `YOUR_FMP_API_KEY` |
     | `_VITE_GEMINI_API_KEY` | `YOUR_GEMINI_API_KEY` |
     | `_VITE_PERPLEXITY_API_KEY` | `YOUR_PERPLEXITY_API_KEY` |

     > **Note**: These variables are prefixed with `_` because they are user-defined substitutions in Cloud Build. The `cloudbuild.yaml` file maps them to the correct `VITE_` environment variables during the build process.

---

## Option 2: Firebase Hosting

Firebase Hosting is perfect for static sites and has generous free tier.

### Prerequisites

1. Install Firebase CLI:
   ```bash
   npm install -g firebase-tools
   ```

2. Login to Firebase:
   ```bash
   firebase login
   ```

### Setup

1. **Initialize Firebase**:
   ```bash
   firebase init hosting
   ```
   
   Choose:
   - Public directory: `dist`
   - Single-page app: `Yes`
   - GitHub integration: `Yes` (for auto-deploy)

2. **Build and Deploy**:
   ```bash
   npm run build
   firebase deploy --only hosting
   ```

### GitHub Actions Auto-Deploy

Firebase init will create `.github/workflows/firebase-hosting-merge.yml`:

```yaml
name: Deploy to Firebase Hosting on merge
on:
  push:
    branches:
      - main
jobs:
  build_and_deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm ci && npm run build
      - uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: '${{ secrets.GITHUB_TOKEN }}'
          firebaseServiceAccount: '${{ secrets.FIREBASE_SERVICE_ACCOUNT }}'
          channelId: live
          projectId: your-project-id
```

---

## Option 3: App Engine

App Engine provides a fully managed platform with automatic scaling.

### Setup

1. **Create `app.yaml`**:
   ```yaml
   runtime: nodejs18
   
   env_variables:
     GEMINI_API_KEY: "your_gemini_api_key_here"
   
   handlers:
     - url: /assets
       static_dir: dist/assets
       secure: always
     
     - url: /.*
       static_files: dist/index.html
       upload: dist/index.html
       secure: always
   ```

2. **Add build script to `package.json`**:
   ```json
   {
     "scripts": {
       "gcp-build": "npm run build"
     }
   }
   ```

3. **Deploy**:
   ```bash
   gcloud app deploy
   ```

---

## Quick Start: One-Command Deployment

### Cloud Run (Fastest)

```bash
# 1. Set your project
gcloud config set project YOUR_PROJECT_ID

# 2. Deploy (builds and deploys in one command)
gcloud run deploy ai-predict-pro \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars GEMINI_API_KEY=$(cat .env | grep GEMINI_API_KEY | cut -d '=' -f2)
```

### Firebase Hosting (Easiest)

```bash
# 1. Install and login
npm install -g firebase-tools
firebase login

# 2. Initialize and deploy
firebase init hosting
npm run build
firebase deploy
```

---

## Environment Variables

All methods need the `GEMINI_API_KEY` environment variable:

- **Cloud Run**: Use `--set-env-vars` flag or Cloud Console
- **Firebase**: Use Firebase Functions + Hosting rewrites
- **App Engine**: Set in `app.yaml`

---

## Continuous Deployment Summary

| Platform | GitHub Integration | Auto-Deploy on Push |
|----------|-------------------|---------------------|
| Cloud Run | Cloud Build Triggers | ✅ Yes |
| Firebase | GitHub Actions | ✅ Yes |
| App Engine | Cloud Build | ✅ Yes |

---

## Cost Comparison

**Cloud Run**:
- Free tier: 2M requests/month
- ~$0.10-1.00/month for low traffic
- Scales to zero when not in use

**Firebase Hosting**:
- Free tier: 10 GB/month bandwidth
- Completely free for most small projects

**App Engine**:
- Always-on instance: ~$50+/month
- No free tier for standard environment

---

## Recommended Workflow

For your app, I recommend **Cloud Run with GitHub integration**:

1. ✅ Already pushed to GitHub
2. Create Dockerfile (use the one in this repo)
3. Run one deploy command
4. Set up Cloud Build trigger for auto-deployment
5. Every push to `main` branch auto-deploys!

## Next Steps

Choose your preferred method and run the deployment commands above. For Cloud Run, I can help you create the necessary files right now!
