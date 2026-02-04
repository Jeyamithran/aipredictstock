# AI Stock Prediction Platform (Showcase)

> **Note:** This repository is a **public architectural showcase** of a proprietary institutional trading system. Core prediction logic, including alpha-generating heuristics and trained model weights, has been abstracted or redacted for IP protection. This code demonstrates engineering maturity, service boundaries, and system design.

## 🚀 Project Overview

**aipredictstock** is an advanced, real-time market analysis platform designed to identify high-probability trading setups using a multi-agent AI architecture. It synthesizes data from multiple financial providers (Polygon.io, Financial Modeling Prep) and cross-validates trading signals using different LLM personas (Gemini Pro, GPT-4o).

### 🎯 What Problem It Solves
Retail traders and small funds often lack the tools to process the deluge of market data (Options Flow, News, Technicals, Macro) in real-time. This system automates the role of a "Quantitative Analyst," "Risk Manager," and "Execution Trader" into a unified dashboard that:
1.  **Filters Noise:** Scans thousands of tickers to find top 1% opportunities.
2.  **Validates Signals:** Uses AI to read SEC filings and earnings reports instantly.
3.  **Manages Risk:** dynamic position sizing based on volatility (VIX) and conviction.

## 🏗️ Architecture Design

The system follows a modular **Service-Oriented Architecture (SOA)** ensuring separation of concerns and testability.

### Service Boundaries
- **`scannerPrompts.ts`**: (Redacted) Stores the specialized "Personas" (Hedge Fund Analyst, Momentum Trader, Biotech Specialist) used to query LLMs.
- **`decisionEngine.ts`**: (Redacted) A risk-first state machine that validates trade entries against technical hard-gates (VWAP, EMA).
- **`geminiService.ts`**: Handles interactions with Google's Gemini models for broad market reasoning and sentiment analysis.
- **`openaiService.ts`**: (Redacted) Specialized module for analyzing complex Option Flow data structures.
- **`polygonService.ts` & `fmpService.ts`**: Robust data layers handling API rate limiting, caching, and normalization.

### Data Flow
1.  **Market Scan**: The `Screener Service` fetches raw candidates based on volume/price criteria.
2.  **AI Analysis**: Candidates are passed to specific AI Agents (e.g., "Biotech Analyst") to verify catalysts like FDA approvals.
3.  **Logic Gate**: The `Decision Engine` applies strict mathematical rules (R/R > 2.5, spread < 10%).
4.  **Signal Generation**: Validated setups are pushed to the frontend via WebSocket or Polling.

## 🛠️ Technology Stack

- **Frontend**: React, TypeScript, TailwindCSS (for rapid UI development)
- **AI/ML**: Google Gemini 1.5/2.0, OpenAI GPT-4o
- **Data Providers**: Polygon.io (Options/Technicals), FMP (Fundamentals/News)
- **Infrastructure**: Node.js, Vite

## 🔒 Proprietary Logic (Abstracted)

In this showcase, the following components contain stubbed or simplified logic to protect intellectual property:
- **Scoring Formulas**: The exact weighting of Flow vs. Technicals.
- **Alpha Factors**: Specific parameters for "Gamma Squeeze" detection.
- **Pattern Recognition**: The regex/parsing logic for unannounced FDA catalysts.

## 📸 Sample Outputs (Mock)

**Agent Response: "Biotech Analyst"**
```json
{
  "Ticker": "LABU",
  "SetupType": "Phase 2 Data Readout",
  "Conviction": 5,
  "PrimaryCatalyst": "Positive trial results published in Lancet",
  "RiskReward": 3.2,
  "DecisionFactors": ["High Volume", "Short Interest > 20%", "News < 1h old"]
}
```

## 👨‍💻 Engineering Standards
- **Strong Typing**: Comprehensive TypeScript interfaces for all financial data structures.
- **Error Handling**: Graceful degradation when APIs are rate-limited or return partial data.
- **Clean Code**: Consistent naming conventions and modular service files.

---

*For inquiries regarding the full production capabilities or architecture deep-dive, please contact the author.*
