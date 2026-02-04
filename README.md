<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1CxgDrEAFz_-jiXgJrEJDnT1yc6TneJOD

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Institutional 0DTE Dashboard

The **Institutional 0DTE Desk** provides real-time probabilistic analysis for SPY options.

### Setup
1. Define `POLYGON_API_KEY` (or `VITE_POLYGON_API_KEY`) in your `.env` file.
2. Start the backend server for Bias Engine aggregation:
   `npm run start:server`
3. Start the frontend:
   `npm run dev`

### API Endpoints
- `GET /api/odte/spy/context`: Returns VWAP, Gamma Regime, and Flipping status.
- `GET /api/odte/spy/flow`: Returns aggregated flow (Calls vs Puts) and Burst detection.
- `GET /api/odte/spy/bias`: Returns the composite Bias (Bullish/Bearish/NoTrade) with confidence and reasons.

### Architecture
- **RegimeEngine**: Calculates Net Gamma USD and detects Gamma Flips.
- **FlowAggregator**: Classifies trades as Bid/Ask/Mid and detects institutional bursts.
- **BiasEngine**: Scores multiple signals (Gamma, VWAP, Flow) to determine directional bias.
