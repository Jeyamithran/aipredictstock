
import { StockData, SignalType } from './types';

export const WATCHLIST_TICKERS = ['SPY', 'QQQ', 'NVDA', 'AMD', 'MSFT', 'TSLA', 'AAPL'];

export const ENHANCED_PINE_SCRIPT = `//@version=5
indicator("Supertrend AI Pro v6.0", overlay = true, format=format.price, precision=2)

// --- Inputs ---
Periods = input.int(10, title="ATR Period", minval=1)
src = input.source(hl2, title="Source")
Multiplier = input.float(3.0, title="ATR Multiplier", step=0.1)
changeATR = input.bool(true, title="Use Average ATR?")
showsignals = input.bool(true, title="Show Buy/Sell Signals")
highlighting = input.bool(true, title="Show Trend Highlighter")

// --- Calculations ---
atr2 = ta.sma(ta.tr, Periods)
atr = changeATR ? ta.atr(Periods) : atr2

up = src - (Multiplier * atr)
up1 = nz(up[1], up)
up := close[1] > up1 ? math.max(up, up1) : up

dn = src + (Multiplier * atr)
dn1 = nz(dn[1], dn)
dn := close[1] < dn1 ? math.min(dn, dn1) : dn

var trend = 1
trend := nz(trend[1], trend)
trend := trend == -1 and close > dn1 ? 1 : trend == 1 and close < up1 ? -1 : trend

// --- Plotting ---
upPlot = plot(trend == 1 ? up : na, title="Up Trend", style=plot.style_linebr, linewidth=2, color=color.rgb(16, 185, 129))
dnPlot = plot(trend == 1 ? na : dn, title="Down Trend", style=plot.style_linebr, linewidth=2, color=color.rgb(244, 63, 94))

// --- Signals ---
buySignal = trend == 1 and trend[1] == -1
sellSignal = trend == -1 and trend[1] == 1

plotshape(buySignal and showsignals, title="Buy Signal", text="BUY", location=location.belowbar, style=shape.labelup, size=size.tiny, color=color.rgb(16, 185, 129), textcolor=color.white)
plotshape(sellSignal and showsignals, title="Sell Signal", text="SELL", location=location.abovebar, style=shape.labeldown, size=size.tiny, color=color.rgb(244, 63, 94), textcolor=color.white)

// --- Highlighter ---
mPlot = plot(ohlc4, title="", style=plot.style_circles, linewidth=0)
longFillColor = highlighting ? (trend == 1 ? color.new(color.green, 85) : color.new(color.white, 100)) : color.new(color.white, 100)
shortFillColor = highlighting ? (trend == -1 ? color.new(color.red, 85) : color.new(color.white, 100)) : color.new(color.white, 100)

fill(mPlot, upPlot, title="UpTrend Highlighter", color=longFillColor)
fill(mPlot, dnPlot, title="DownTrend Highlighter", color=shortFillColor)

// --- Alerts ---
alertcondition(buySignal, title="SuperTrend Buy", message="AI Predict Pro: BUY Signal detected for {{ticker}} at {{close}}")
alertcondition(sellSignal, title="SuperTrend Sell", message="AI Predict Pro: SELL Signal detected for {{ticker}} at {{close}}")
alertcondition(trend != trend[1], title="Trend Change", message="AI Predict Pro: Trend changed direction for {{ticker}}")
`;

export const SECTOR_AI = ['NVDA', 'AMD', 'TSM', 'AVGO', 'SMCI', 'ARM', 'MU', 'INTC', 'PLTR', 'AI'];
export const SECTOR_CLOUD = ['MSFT', 'AMZN', 'GOOGL', 'ORCL', 'CRM', 'NOW', 'SNOW', 'DDOG', 'NET', 'MDB'];
export const SECTOR_QUANTUM = ['IONQ', 'QBTS', 'RGTI', 'QUBT', 'HON', 'IBM', 'GOOGL'];
export const SECTOR_CRYPTO = ['MSTR', 'MARA', 'RIOT', 'COIN', 'CLSK', 'HUT', 'BITF', 'HOOD', 'IBIT'];

export const SHORT_SQUEEZE_CANDIDATES = ['GME', 'AMC', 'CVNA', 'UPST', 'MSTR', 'COIN', 'MARA', 'BYND', 'SPCE', 'RIVN', 'LCID', 'TSLA', 'NVDA', 'PLTR', 'AI', 'SOFI'];