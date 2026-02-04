
export const SignalType = {
  STRONG_BUY: 'STRONG_BUY',
  BUY: 'BUY',
  NEUTRAL: 'NEUTRAL',
  SELL: 'SELL',
  STRONG_SELL: 'STRONG_SELL',
} as const;

export type SignalType = typeof SignalType[keyof typeof SignalType];

export interface StockData {
  ticker: string;
  price: number;
  changePercent: number;
  score: number; // -100 to 100
  confidence: number; // 0 to 1
  volatility: 'LOW' | 'HIGH';
  rsi: number;
  adx: number;
  trend: 'BULL' | 'BEAR' | 'FLAT';
  signal: SignalType;
  smartMoney: 'BUYING' | 'SELLING' | 'NEUTRAL';
  lastUpdated: Date;
  lastDataTimestamp?: number; // Unix timestamp in milliseconds of the actual data point
  isAfterHours?: boolean;

  // Enhanced day trading indicators
  volume: number;
  avgVolume: number;
  volumeStrength: 'STRONG' | 'NORMAL' | 'WEAK';
  volumeRatio: number; // Volume / avgVolume
  ma50Distance: number; // Percentage distance from 50-day MA
  ma200Distance: number; // Percentage distance from 200-day MA

  // Score breakdown for transparency
  momentumScore: number;
  volumeScore: number;
  trendScore: number;

  // Aziz Strategy Indicators
  vwap?: number;
  ema9?: number;
  ema20?: number;
  atr?: number;
}

export interface ChartPoint {
  time: string;
  price: number | null; // Close price (for line chart)
  forecast?: number | null;
  signal?: 'BUY' | 'SELL';
  // OHLC data for candlestick charts
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
}

export interface TradeSetup {
  entry: string;
  target: string;
  stopLoss: string;
}

export interface TradeSignal {
  id: string;
  timestamp: number;
  ticker: string;
  mode: string; // e.g., 'Day', 'Swing'
  analysisType: string; // e.g., 'Tech', 'Trend'
  signal: 'BUY' | 'SELL' | 'HOLD';
  entry: string;
  stopLoss: string;
  target: string;
  rr: string; // Risk/Reward ratio
  confidence: number; // 0-100
}

export interface AnalysisResult {
  ticker: string;
  perplexityResearch?: string; // Stage 1: Perplexity deep research
  analysis: string;
  optionsStrategy: string;
  tradeSetup: TradeSetup | null;
  generatedSignal?: TradeSignal; // Include the full signal object
  loading: boolean;
}

export interface PineScriptConfig {
  minScore: number;
  confidenceThreshold: number;
  supertrendFactor: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
}

export interface ChatContext {
  ticker: string;
  currentPrice: number;
  changePercent: number;
  analysis?: string;
  strategy?: string;
  tradeSetup?: {
    entry: string;
    target: string;
    stopLoss: string;
  };
}

export interface SECFiling {
  symbol: string;
  fillingDate: string;
  acceptedDate: string;
  cik: string;
  type: string;
  link: string;
  finalLink: string;
}

export interface InsiderTrade {
  symbol: string;
  transactionDate: string;
  filingDate: string;
  reportingCik: string;
  transactionType: string;
  securitiesOwned: number;
  securitiesTransacted: number;
  price: number;
  link: string;
  reportingName: string;
  typeOfOwner: string;
}

export interface StockNews {
  symbol: string;
  publishedDate: string;
  title: string;
  image: string;
  site: string;
  text: string;
  url: string;
}

export interface ScannerSource {
  Type: 'SEC' | 'PressRelease' | 'EarningsCall' | 'News' | 'Analyst' | 'ClinicalTrials' | 'Other';
  Title: string;
  Publisher?: string;
  PublishedAtUTC: string;
  URL?: string;
  Confidence?: number;
}

export interface ScannerAlert {
  Ticker: string;
  EntryPrice: number;
  TargetPrice: number;
  StopPrice: number;
  RiskReward: number;
  PotentialGainPercent: number;
  SetupType: string;
  TrendState: string;
  Conviction: number;
  CompanyName?: string;
  MarketCapUSD?: number | null;
  AvgVolume20d?: number | null;
  PrimaryCatalyst: string;
  CatalystType: string | null;
  CatalystDateUTC?: string;
  CatalystWindow?: string;
  Sources?: ScannerSource[];
  EntryTrigger?: string;
  StopLogic?: string;
  InvalidationReason?: string;
  ThemeTag?: string;
  EarningsNextDateUTC?: string;
  DecisionFactors: string[];
  DetailedAnalysis: string;
  DataFreshness: string;
  Source?: 'Perplexity' | 'Gemini' | 'OpenAI' | 'Both';
  MomentumScore?: number | null;
  LiquidityUSD?: number | null;
  ShortInterestFloat?: number | null;
  RelativeStrengthVsSector?: number | null;
  ATRPercent?: number | null;
  VolumeVsAvg?: number | null;
  Notes?: string | null;
  AIEntryPrice?: number | null;
  Bucket?: 'SmallCap' | 'MidCap' | 'LargeCap';
}

export interface MarketContext {
  AsOfUTC: string;
  TopThemes: string[];
  RiskOnOff: string;
  HotSectors: string[];
}

export interface ScannerResponse {
  MarketContext?: MarketContext;
  SmallCap: ScannerAlert[];
  MidCap: ScannerAlert[];
  LargeCap: ScannerAlert[];
}

export interface ScannerHistoryItem {
  id: string;
  timestamp: number;
  profile: ScannerProfile;
  alerts: ScannerAlert[];
  summary: string; // e.g., "Found 12 candidates"
}

export type ScannerProfile = 'hedge_fund' | 'pro_trader' | 'catalyst' | 'bio_analyst' | 'immediate_breakout' | 'high_growth';

export interface SectorPerformance {
  sector: string;
  changesPercentage: string;
}

export interface EarningsCalendar {
  date: string;
  symbol: string;
  eps: number | null;
  epsEstimated: number | null;
  time: string;
  revenue: number | null;
  revenueEstimated: number | null;
}

export interface FMPArticle {
  title: string;
  date: string;
  content: string;
  tickers: string;
  image: string;
  link: string;
  author: string;
  site: string;
}

export interface CongressionalTrade {
  representative: string;
  chamber: 'House' | 'Senate';
  transactionDate: string;
  disclosureDate: string;
  type: string;
  amount: string;
  party: string;
  ticker: string;
  link: string;
}

export interface SMAData {
  date: string;
  sma: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketContext {
  marketMood: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  sectorPerformance: string;
  keyEvents: string;
}

export interface AnalystRating {
  symbol: string;
  date: string;
  rating: string;
  gradingCompany: string;
  newGrade: string;
  previousGrade: string;
}

export interface EMAData {
  date: string;
  ema: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ADXData {
  date: string;
  adx: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketBriefing {
  id: string;
  timestamp: number;
  content: string;
  dateStr: string;
}
export interface ShortInterestResult {
  settlement_date: string;
  ticker: string;
  short_interest: number;
  avg_daily_volume: number;
  days_to_cover: number;
}

// ODTE Specific Types
export interface ODTEOption {
  ticker: string; // The Option Ticker (e.g. O:SPY...)
  underlyingTicker: string; // The Stock Ticker (e.g. SPY)
  strike: number;
  type: 'call' | 'put';
  expiration: string;
  premium: number;
  changePercent: number;
  volume: number;
  avgVolume: number; // 20-day avg for this hour (simulated or fetched)
  volumeRatio: number; // current / avg
  openInterest: number;
  delta: number;
  gamma: number;
  theta: number; // Theta per day usually, converted to per min in UI
  vega: number;
  iv: number;
  ivRank?: number;
  distanceToStrike: number; // %
  bid: number;
  ask: number;
}

export interface ODTEScanResult {
  timestamp: number;
  opportunities: ODTEOption[];
  marketContext: {
    vix: number;
    putCallRatio: number;
    tick: number;
    trend: string;
  };
}

export interface ODTESimulationPosition {
  id: string;
  option: ODTEOption;
  entryPrice: number;
  quantity: number;
  entryTime: number; // timestamp
  status: 'OPEN' | 'CLOSED';
  exitPrice?: number;
  exitTime?: number;
  pnl?: number;
  maxProfit?: number;
  maxLoss?: number;
}

export interface ODTEStrategySuggestion {
  condition: string;
  strategy: string;
  strikeSelection: string;
  timing: string;
  confidence: number;
}

export interface GammaExposure {
  strike: number;
  callGamma: number;
  putGamma: number;
  netGamma: number;
  totalGamma: number;
}

export interface HeatmapData {
  strike: number;
  callVolume: number;
  putVolume: number;
  totalVolume: number;
}

export interface ExpectedMove {
  oneSigma: number; // Price points
  twoSigma: number;
  maxPain: number;
}

export interface SmartStrikeScore {
  ticker: string;
  strike: number;
  liquidityScore: number; // 0-100
  edgeScore: number;      // 0-100 (Gamma/Theta efficiency)
  riskScore: number;      // 0-100 (Pin risk, Tail risk)
  totalScore: number;     // Weighted average
}

export interface ODTEInstitutionalMetrics {
  gammaExposure: GammaExposure[];
  heatmap: HeatmapData[];
  expectedMove: ExpectedMove;
  netDelta: number;
  netGamma: number;
  thetaBurn: number; // Total theta dollars per minute
}

export interface GammaRegime {
  regime: 'LongGamma' | 'Neutral' | 'ShortGamma' | 'Unknown';
  netGammaUSD: number | null;
  netDelta?: number;
  gammaFlip: boolean;
}

export interface FlowBurst {
  strike: number;
  type: 'call' | 'put';
  side: 'Bid' | 'Ask' | 'Mid' | 'Unknown';
  notional: number;
  timestamp: string; // ISO8601
}

export interface FlowAggregates {
  callAskNotional: number;
  putAskNotional: number;
  callBidNotional: number;
  putBidNotional: number;
  atmCallAskNotional: number;
  atmPutAskNotional: number;
  callVolume: number;
  putVolume: number;
  rvolLike: number | null;
  bursts: FlowBurst[];
  netFlowScore?: number; // Normalized -100 to 100
  normalizedImbalance?: {
    overall: number; // -1 to 1
    atm: number; // -1 to 1
  };
}

export interface MarketContextV2 {
  vwap: number | null;
  priceVsVwap: 'Above' | 'Below' | 'At' | 'Unknown';
  vwapDistancePct: number;
}

export interface BiasResponse {
  bias: 'Bullish' | 'Bearish' | 'NoTrade';
  confidence: number;
  reasons: string[];
  regime: GammaRegime;
  flow: FlowAggregates;
  context: MarketContextV2;
  debug?: any;
  score?: {
    bull: number;
    bear: number;
    net: number;
  };
  walls?: {
    callWall: number | null;
    putWall: number | null;
    maxPain: number | null;
    distToCallWallPct: number | null;
    distToPutWallPct: number | null;
  };
}
