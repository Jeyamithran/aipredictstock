import React, { useState, useMemo } from 'react';
import {
  ComposedChart,
  Area,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Scatter,
  ReferenceLine
} from 'recharts';
import { ChartPoint } from '../types';
import { AlertTriangle, Clock, Lock, TrendingUp, BarChart3, Activity, Layers, MousePointer2 } from 'lucide-react';

interface StockChartProps {
  data: ChartPoint[];
  ticker: string;
  trend: 'BULL' | 'BEAR' | 'FLAT';
  error?: string | null;
  timeframe: '1min' | '5min' | '15min' | '30min' | '1hour' | '4hour';
  onTimeframeChange: (timeframe: '1min' | '5min' | '15min' | '30min' | '1hour' | '4hour') => void;
  smaData?: { date: string; sma: number }[];
  emaData?: { date: string; ema: number }[];
  adxData?: { date: string; adx: number }[];
}

type ChartStyle = 'line' | 'candle';
type IndicatorType = 'NONE' | 'MACD' | 'RSI' | 'OBV' | 'ATR' | 'ADX';

// Enhanced Buy Marker
const BuyMarker = (props: any) => {
  const { cx, cy } = props;
  if (!cx || !cy) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r="8" fill="#10b981" opacity="0.2" />
      <svg x={cx - 10} y={cy - 10} width={20} height={20} viewBox="0 0 24 24" fill="#10b981" stroke="#10b981" strokeWidth="2">
        <path d="M12 2L2 22h20L12 2z" />
      </svg>
    </g>
  );
};

// Enhanced Sell Marker
const SellMarker = (props: any) => {
  const { cx, cy } = props;
  if (!cx || !cy) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r="8" fill="#f43f5e" opacity="0.2" />
      <svg x={cx - 10} y={cy - 10} width={20} height={20} viewBox="0 0 24 24" fill="#f43f5e" stroke="#f43f5e" strokeWidth="2">
        <path d="M12 22L22 2H2L12 22z" />
      </svg>
    </g>
  );
};

// Robust Candlestick Shape
const CandlestickShape = (props: any) => {
  const { x, width, payload, yAxis } = props;
  if (!payload || !yAxis || !payload.open || !payload.close || !payload.high || !payload.low) return null;

  const { open, close, high, low } = payload;

  // Calculate Y positions using the axis scale
  const yHigh = yAxis.scale(high);
  const yLow = yAxis.scale(low);
  const yOpen = yAxis.scale(open);
  const yClose = yAxis.scale(close);

  const isGreen = close >= open;
  const color = isGreen ? '#10b981' : '#f43f5e';
  const bodyTop = Math.min(yOpen, yClose);
  const bodyHeight = Math.max(Math.abs(yClose - yOpen), 1);

  // Center the candle in the band
  const xCenter = x + width / 2;
  const candleWidth = Math.max(3, Math.min(width * 0.6, 8));

  return (
    <g>
      {/* Wick */}
      <line
        x1={xCenter}
        y1={yHigh}
        x2={xCenter}
        y2={yLow}
        stroke={color}
        strokeWidth={1}
      />
      {/* Body */}
      <rect
        x={xCenter - candleWidth / 2}
        y={bodyTop}
        width={candleWidth}
        height={bodyHeight}
        fill={color}
        stroke={color}
        strokeWidth={1}
      />
    </g>
  );
};

// --- Indicator Calculations ---

const calculateEMA = (data: ChartPoint[], period: number): number[] => {
  const prices = data.map(d => d.price || 0);
  const ema: number[] = [];
  const multiplier = 2 / (period + 1);

  let sum = 0;
  for (let i = 0; i < Math.min(period, prices.length); i++) {
    sum += prices[i];
  }
  ema[period - 1] = sum / period;

  for (let i = period; i < prices.length; i++) {
    ema[i] = (prices[i] - ema[i - 1]) * multiplier + ema[i - 1];
  }

  return ema;
};

const calculateRSI = (data: ChartPoint[], period: number = 14): number[] => {
  const rsi: number[] = [];
  const changes = data.map((d, i) => i === 0 ? 0 : (d.price || 0) - (data[i - 1].price || 0));

  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 1; i <= period; i++) {
    const change = changes[i];
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }

  avgGain /= period;
  avgLoss /= period;

  rsi[period] = 100 - (100 / (1 + avgGain / avgLoss));

  for (let i = period + 1; i < data.length; i++) {
    const change = changes[i];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    rsi[i] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
  }

  return rsi;
};

const calculateMACD = (data: ChartPoint[], fast = 12, slow = 26, signal = 9) => {
  const emaFast = calculateEMA(data, fast);
  const emaSlow = calculateEMA(data, slow);
  const macdLine: number[] = [];
  const signalLine: number[] = [];
  const histogram: number[] = [];

  for (let i = 0; i < data.length; i++) {
    if (emaFast[i] !== undefined && emaSlow[i] !== undefined) {
      macdLine[i] = emaFast[i] - emaSlow[i];
    }
  }

  // Calculate Signal Line (EMA of MACD Line)
  // We need to treat macdLine as the input for EMA
  // But our EMA function takes ChartPoint[], so we'll mock it or rewrite EMA.
  // Let's rewrite a simple EMA for numbers array.
  const calculateArrayEMA = (values: number[], period: number): number[] => {
    const ema: number[] = [];
    const multiplier = 2 / (period + 1);
    let firstValidIndex = values.findIndex(v => v !== undefined);
    if (firstValidIndex === -1) return [];

    let sum = 0;
    let count = 0;
    for (let i = firstValidIndex; i < values.length; i++) {
      if (values[i] !== undefined) {
        sum += values[i];
        count++;
        if (count === period) {
          ema[i] = sum / period;
          break;
        }
      }
    }

    let startEmaIndex = values.findIndex((_, i) => ema[i] !== undefined);
    if (startEmaIndex !== -1) {
      for (let i = startEmaIndex + 1; i < values.length; i++) {
        if (values[i] !== undefined) {
          ema[i] = (values[i] - ema[i - 1]) * multiplier + ema[i - 1];
        }
      }
    }
    return ema;
  };

  const calculatedSignal = calculateArrayEMA(macdLine, signal);

  for (let i = 0; i < data.length; i++) {
    if (macdLine[i] !== undefined && calculatedSignal[i] !== undefined) {
      signalLine[i] = calculatedSignal[i];
      histogram[i] = macdLine[i] - signalLine[i];
    }
  }

  return { macdLine, signalLine, histogram };
};

const calculateATR = (data: ChartPoint[], period = 14): number[] => {
  const atr: number[] = [];
  const tr: number[] = [];

  for (let i = 0; i < data.length; i++) {
    if (i === 0) {
      tr[i] = (data[i].high || 0) - (data[i].low || 0);
    } else {
      const high = data[i].high || 0;
      const low = data[i].low || 0;
      const prevClose = data[i - 1].close || 0;
      tr[i] = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    }
  }

  // First ATR is simple average of TR
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += tr[i];
  }
  atr[period - 1] = sum / period;

  for (let i = period; i < data.length; i++) {
    atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period;
  }

  return atr;
};

const calculateOBV = (data: ChartPoint[]): number[] => {
  const obv: number[] = [];
  obv[0] = 0;

  for (let i = 1; i < data.length; i++) {
    const close = data[i].close || 0;
    const prevClose = data[i - 1].close || 0;
    const volume = data[i].volume || 0;

    if (close > prevClose) {
      obv[i] = obv[i - 1] + volume;
    } else if (close < prevClose) {
      obv[i] = obv[i - 1] - volume;
    } else {
      obv[i] = obv[i - 1];
    }
  }
  return obv;
};


export const StockChart: React.FC<StockChartProps> = ({
  data,
  ticker,
  trend,
  error,
  timeframe,
  onTimeframeChange,
  smaData,
  emaData,
  adxData
}) => {
  const [chartStyle, setChartStyle] = useState<ChartStyle>('line');
  const [showSMA, setShowSMA] = useState(false);
  const [showEMA, setShowEMA] = useState(false);
  const [showEMA9, setShowEMA9] = useState(false);
  const [showEMA20, setShowEMA20] = useState(false);
  const [showEMA50, setShowEMA50] = useState(false);
  const [showEMA200, setShowEMA200] = useState(false);
  const [activeIndicator, setActiveIndicator] = useState<IndicatorType>('NONE');
  const [clickedPoint, setClickedPoint] = useState<any | null>(null);

  const color = trend === 'BULL' ? '#10b981' : trend === 'BEAR' ? '#f43f5e' : '#9ca3af';

  const hasData = data && data.length > 0;

  // Improved Y-axis domain calculation
  const yDomain = useMemo(() => {
    if (!hasData) return ['auto', 'auto'];

    // Filter out 0 and null values for domain calculation
    const validPrices = data.map(d => d.price || 0).filter(p => p > 0);
    const highs = data.map(d => d.high || 0).filter(h => h > 0);
    const lows = data.map(d => d.low || 0).filter(l => l > 0);

    let min = 0;
    let max = 0;

    if (chartStyle === 'candle') {
      if (highs.length === 0 || lows.length === 0) return ['auto', 'auto'];
      min = Math.min(...lows);
      max = Math.max(...highs);
    } else {
      if (validPrices.length === 0) return ['auto', 'auto'];
      min = Math.min(...validPrices);
      max = Math.max(...validPrices);
    }

    const padding = (max - min) * 0.05; // 5% padding
    return [min - padding, max + padding];
  }, [data, chartStyle, hasData]);

  const chartDataWithSignals = useMemo(() => {
    if (!hasData) return [];
    const ema9 = showEMA9 ? calculateEMA(data, 9) : [];
    const ema20 = showEMA20 ? calculateEMA(data, 20) : [];
    const ema50 = showEMA50 ? calculateEMA(data, 50) : [];
    const ema200 = showEMA200 ? calculateEMA(data, 200) : [];

    // Indicators - Calculate all for legend values
    const rsi = calculateRSI(data);
    const macd = calculateMACD(data);
    const atr = calculateATR(data);
    const obv = calculateOBV(data);

    const mergedData = data.map((point, index) => {
      const smaPoint = smaData?.find(s => {
        // Simple date matching - might need refinement based on exact timestamp formats
        // Assuming both are ISO strings or compatible
        return new Date(s.date).getTime() === new Date(point.time).getTime();
      });

      const emaPoint = emaData?.find(s => new Date(s.date).getTime() === new Date(point.time).getTime());
      const adxPoint = adxData?.find(s => new Date(s.date).getTime() === new Date(point.time).getTime());

      return {
        ...point,
        sma: showSMA && smaPoint ? smaPoint.sma : null, // Only add SMA if showSMA is true
        ema: showEMA && emaPoint ? emaPoint.ema : null, // Only add EMA if showEMA is true
        adx: activeIndicator === 'ADX' && adxPoint ? adxPoint.adx : null,
        ema9: ema9[index] || null,
        ema20: ema20[index] || null,
        ema50: ema50[index] || null,
        ema200: ema200[index] || null,
        // Add explicit buy/sell price fields for Scatter alignment
        buyPrice: point.signal === 'BUY' ? (point.price || point.close) : null,
        sellPrice: point.signal === 'SELL' ? (point.price || point.close) : null,
        // Indicator values
        rsi: rsi[index] || null,
        macdLine: macd.macdLine[index] || null,
        macdSignal: macd.signalLine[index] || null,
        macdHist: macd.histogram[index] || null,
        atr: atr[index] || null,
        obv: obv[index] || null
      };
    });

    return mergedData;
  }, [data, showSMA, smaData, showEMA, emaData, activeIndicator, adxData, showEMA9, showEMA20, showEMA50, showEMA200, hasData]);

  const getErrorIcon = () => {
    if (!error) return <AlertTriangle className="w-6 h-6 mb-2 opacity-50" />;
    if (error.includes("Limit Reach") || error.includes("Rate Limit")) return <Clock className="w-6 h-6 mb-2 opacity-50" />;
    if (error.includes("API Key")) return <Lock className="w-6 h-6 mb-2 opacity-50" />;
    return <AlertTriangle className="w-6 h-6 mb-2 opacity-50" />;
  };

  const timeframes: Array<{ value: '1min' | '5min' | '15min' | '30min' | '1hour' | '4hour', label: string }> = [
    { value: '1min', label: '1m' },
    { value: '5min', label: '5m' },
    { value: '15min', label: '15m' },
    { value: '30min', label: '30m' },
    { value: '1hour', label: '1h' },
    { value: '4hour', label: '4h' }
  ];

  const handleChartClick = (data: any) => {
    if (data && data.activePayload && data.activePayload.length > 0) {
      setClickedPoint(data.activePayload[0].payload);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="h-[500px] w-full bg-neutral-900/30 rounded-lg border border-neutral-800 p-4 flex flex-col">
        <div className="flex flex-wrap justify-between items-center mb-3 shrink-0 gap-2">
          <h3 className="text-sm font-semibold text-gray-300">{ticker} Price Action & Signals</h3>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-0.5 bg-neutral-800/50 rounded p-0.5">
              {timeframes.map(tf => (
                <button
                  key={tf.value}
                  onClick={() => onTimeframeChange(tf.value)}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${timeframe === tf.value ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-300'
                    }`}
                >
                  {tf.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 bg-neutral-800/50 rounded p-0.5">
              <button
                onClick={() => setShowSMA(!showSMA)}
                className={`px-2 py-1 rounded text-xs font-medium transition-colors ${showSMA ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-gray-300'
                  }`}
              >
                SMA
              </button>
            </div>
            <div className="flex items-center gap-1 bg-neutral-800/50 rounded p-0.5">
              <button
                onClick={() => setShowEMA(!showEMA)}
                className={`px-2 py-1 rounded text-xs font-medium transition-colors ${showEMA ? 'bg-purple-500 text-white' : 'text-gray-400 hover:text-gray-300'
                  }`}
              >
                EMA
              </button>
            </div>
            <div className="flex items-center gap-1 bg-neutral-800/50 rounded p-0.5">
              <button
                onClick={() => setChartStyle('line')}
                className={`px-2 py-1 rounded text-xs font-medium transition-colors ${chartStyle === 'line' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-gray-300'
                  }`}
              >
                <TrendingUp className="w-3 h-3" />
              </button>
              <button
                onClick={() => setChartStyle('candle')}
                className={`px-2 py-1 rounded text-xs font-medium transition-colors ${chartStyle === 'candle' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-gray-300'
                  }`}
              >
                <BarChart3 className="w-3 h-3" />
              </button>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setShowEMA9(!showEMA9)} className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-colors ${showEMA9 ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50' : 'bg-neutral-800/50 text-gray-500 hover:text-gray-400'}`}>9</button>
              <button onClick={() => setShowEMA20(!showEMA20)} className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-colors ${showEMA20 ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/50' : 'bg-neutral-800/50 text-gray-500 hover:text-gray-400'}`}>20</button>
              <button onClick={() => setShowEMA50(!showEMA50)} className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-colors ${showEMA50 ? 'bg-orange-500/20 text-orange-400 border border-orange-500/50' : 'bg-neutral-800/50 text-gray-500 hover:text-gray-400'}`}>50</button>
              <button onClick={() => setShowEMA200(!showEMA200)} className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-colors ${showEMA200 ? 'bg-purple-500/20 text-purple-400 border border-purple-500/50' : 'bg-neutral-800/50 text-gray-500 hover:text-gray-400'}`}>200</button>
            </div>

            {/* Indicator Selector */}
            <div className="flex items-center gap-1 bg-neutral-800/50 rounded p-0.5">
              <button onClick={() => setActiveIndicator('NONE')} className={`px-2 py-0.5 rounded text-[10px] font-bold ${activeIndicator === 'NONE' ? 'bg-gray-600 text-white' : 'text-gray-400'}`}>Off</button>
              <button onClick={() => setActiveIndicator('MACD')} className={`px-2 py-0.5 rounded text-[10px] font-bold ${activeIndicator === 'MACD' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}>MACD</button>
              <button onClick={() => setActiveIndicator('RSI')} className={`px-2 py-0.5 rounded text-[10px] font-bold ${activeIndicator === 'RSI' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}>RSI</button>
              <button onClick={() => setActiveIndicator('OBV')} className={`px-2 py-0.5 rounded text-[10px] font-bold ${activeIndicator === 'OBV' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}>OBV</button>
              <button onClick={() => setActiveIndicator('ATR')} className={`px-2 py-0.5 rounded text-[10px] font-bold ${activeIndicator === 'ATR' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}>ATR</button>
            </div>
            {/* Indicator Values Box */}
            <div className="flex flex-wrap gap-2 mt-2 text-xs text-gray-300">
              {/* Use latest data point for values */}
              {chartDataWithSignals.length > 0 && (
                <>
                  <div className="bg-neutral-800/50 px-2 py-1 rounded">RSI: {chartDataWithSignals[chartDataWithSignals.length - 1].rsi?.toFixed(2) ?? '—'}</div>
                  <div className="bg-neutral-800/50 px-2 py-1 rounded">MACD: {chartDataWithSignals[chartDataWithSignals.length - 1].macdLine?.toFixed(2) ?? '—'}</div>
                  <div className="bg-neutral-800/50 px-2 py-1 rounded">Signal: {chartDataWithSignals[chartDataWithSignals.length - 1].macdSignal?.toFixed(2) ?? '—'}</div>
                  <div className="bg-neutral-800/50 px-2 py-1 rounded">ATR: {chartDataWithSignals[chartDataWithSignals.length - 1].atr?.toFixed(2) ?? '—'}</div>
                  <div className="bg-neutral-800/50 px-2 py-1 rounded">OBV: {chartDataWithSignals[chartDataWithSignals.length - 1].obv?.toFixed(0) ?? '—'}</div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 relative flex flex-col">
          {hasData ? (
            <>
              <div className="flex-1 relative min-h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={chartDataWithSignals}
                    onClick={handleChartClick}
                  >
                    <defs>
                      <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={color} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                    <XAxis
                      dataKey="time"
                      stroke="#525252"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={30}
                      hide={activeIndicator !== 'NONE'} // Hide X axis if indicator chart is below
                    />
                    <YAxis stroke="#525252" fontSize={10} tickLine={false} axisLine={false} domain={yDomain} width={40} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#171717', borderColor: '#404040', color: '#e5e5e5' }}
                      itemStyle={{ color: '#e5e5e5' }}
                      labelStyle={{ color: '#a3a3a3' }}
                    />

                    {/* SMA Line */}
                    {showSMA && (
                      <Line
                        type="monotone"
                        dataKey="sma"
                        stroke="#f97316" // Orange-500
                        strokeWidth={2}
                        dot={false}
                        activeDot={false}
                        isAnimationActive={false}
                      />
                    )}

                    {/* EMA Line */}
                    {showEMA && (
                      <Line
                        type="monotone"
                        dataKey="ema"
                        stroke="#a855f7" // Purple-500
                        strokeWidth={2}
                        dot={false}
                        activeDot={false}
                        isAnimationActive={false}
                      />
                    )}

                    {/* Main Price Line/Candles */}
                    {chartStyle === 'line' ? (
                      <Area type="monotone" dataKey="price" stroke={color} strokeWidth={2} fillOpacity={1} fill="url(#colorPrice)" isAnimationActive={false} />
                    ) : (
                      <Bar dataKey="close" shape={<CandlestickShape />} isAnimationActive={false} />
                    )}

                    {showEMA9 && <Line type="monotone" dataKey="ema9" stroke="#10b981" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />}
                    {showEMA20 && <Line type="monotone" dataKey="ema20" stroke="#eab308" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />}
                    {showEMA50 && <Line type="monotone" dataKey="ema50" stroke="#f97316" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />}
                    {showEMA200 && <Line type="monotone" dataKey="ema200" stroke="#a855f7" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />}

                    <Scatter dataKey="buyPrice" shape={<BuyMarker />} legendType="none" tooltipType="none" fill="#10b981" isAnimationActive={false} />
                    <Scatter dataKey="sellPrice" shape={<SellMarker />} legendType="none" tooltipType="none" fill="#f43f5e" isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* Secondary Indicator Chart */}
              {activeIndicator !== 'NONE' && (
                <div className="h-32 border-t border-neutral-800 mt-2 pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartDataWithSignals} syncId="priceChart">
                      <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                      <XAxis dataKey="time" stroke="#525252" fontSize={10} tickLine={false} axisLine={false} minTickGap={30} />
                      <YAxis stroke="#525252" fontSize={10} tickLine={false} axisLine={false} width={40} />
                      <Tooltip contentStyle={{ backgroundColor: '#171717', borderColor: '#404040', color: '#e5e5e5' }} />

                      {activeIndicator === 'RSI' && (
                        <>
                          <Line type="monotone" dataKey="rsi" stroke="#3b82f6" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                          <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="3 3" opacity={0.5} />
                          <ReferenceLine y={30} stroke="#22c55e" strokeDasharray="3 3" opacity={0.5} />
                        </>
                      )}

                      {activeIndicator === 'MACD' && (
                        <>
                          <Line type="monotone" dataKey="macdLine" stroke="#3b82f6" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                          <Line type="monotone" dataKey="macdSignal" stroke="#f97316" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                          <Bar dataKey="macdHist" fill="#9ca3af" opacity={0.5} />
                        </>
                      )}

                      {activeIndicator === 'ATR' && (
                        <Line type="monotone" dataKey="atr" stroke="#eab308" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                      )}

                      {activeIndicator === 'OBV' && (
                        <Line type="monotone" dataKey="obv" stroke="#a855f7" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                      )}

                      {activeIndicator === 'ADX' && (
                        <Line type="monotone" dataKey="adx" stroke="#22c55e" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                      )}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 bg-neutral-900/20 rounded-lg border border-neutral-800 border-dashed text-center p-4">
              {getErrorIcon()}
              <p className="text-xs font-medium text-gray-400">{error || "No chart data available."}</p>
              <p className="text-[10px] opacity-60 mt-1">{error ? "Retrying automatically in 60s..." : "Check API Key or Market Hours"}</p>
            </div>
          )}
        </div>
      </div>

      {/* Selected Candle Details Panel */}
      {clickedPoint && (
        <div className="bg-neutral-900/50 border border-neutral-800 rounded-lg p-3 animate-in fade-in slide-in-from-top-2">
          <div className="flex justify-between items-center mb-2">
            <h4 className="text-xs font-bold text-gray-300 flex items-center gap-2">
              <MousePointer2 className="w-3 h-3 text-blue-400" />
              Selected Candle: <span className="text-white">{clickedPoint.time}</span>
            </h4>
            <button onClick={() => setClickedPoint(null)} className="text-gray-500 hover:text-white">
              <Activity className="w-3 h-3" />
            </button>
          </div>
          <div className="grid grid-cols-5 gap-4 text-xs">
            <div>
              <span className="block text-gray-500">Open</span>
              <span className="font-mono text-gray-300">{clickedPoint.open?.toFixed(2)}</span>
            </div>
            <div>
              <span className="block text-gray-500">High</span>
              <span className="font-mono text-emerald-400">{clickedPoint.high?.toFixed(2)}</span>
            </div>
            <div>
              <span className="block text-gray-500">Low</span>
              <span className="font-mono text-rose-400">{clickedPoint.low?.toFixed(2)}</span>
            </div>
            <div>
              <span className="block text-gray-500">Close</span>
              <span className="font-mono text-white">{clickedPoint.close?.toFixed(2)}</span>
            </div>
            <div>
              <span className="block text-gray-500">Volume</span>
              <span className="font-mono text-blue-300">{(clickedPoint.volume / 1000).toFixed(1)}k</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

