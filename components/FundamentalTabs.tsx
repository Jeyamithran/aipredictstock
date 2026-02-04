import React, { useState, useEffect } from 'react';
import { SECFiling, InsiderTrade, StockNews, FMPArticle, CongressionalTrade } from '../types';
import { fetchGeneralSECFilings, fetchSECFilings, fetchGeneralInsiderTrades, fetchGeneralStockNews, fetchFMPArticles, fetchCongressionalTrades } from '../services/fmpService';

interface FundamentalTabsProps {
    ticker: string;
    onTickerSelect: (ticker: string) => void;
}

const FundamentalTabs: React.FC<FundamentalTabsProps> = ({ ticker, onTickerSelect }) => {
    const [activeTab, setActiveTab] = useState<'filings' | 'insider' | 'news' | 'articles' | 'congress'>('news');
    const [filings, setFilings] = useState<SECFiling[]>([]);
    const [insiderTrades, setInsiderTrades] = useState<InsiderTrade[]>([]);
    const [news, setNews] = useState<StockNews[]>([]);
    const [fmpArticles, setFmpArticles] = useState<FMPArticle[]>([]);
    const [congressTrades, setCongressTrades] = useState<CongressionalTrade[]>([]);

    const renderTickers = (tickerStr: string) => {
        if (!tickerStr) return null;
        const tickers = tickerStr.split(',').map(t => t.trim());
        return (
            <div className="flex flex-wrap gap-1 mt-1">
                {tickers.map((t, i) => {
                    // Remove exchange prefix if present (e.g. "AMEX:BITB" -> "BITB")
                    const cleanTicker = t.includes(':') ? t.split(':')[1] : t;
                    return (
                        <span
                            key={i}
                            onClick={(e) => {
                                e.stopPropagation();
                                onTickerSelect(cleanTicker);
                            }}
                            className="text-[10px] bg-blue-900/30 text-blue-400 px-1.5 py-0.5 rounded cursor-pointer hover:bg-blue-900/50 hover:text-blue-300 transition"
                        >
                            {cleanTicker}
                        </span>
                    );
                })}
            </div>
        );
    };

    useEffect(() => {
        if (!ticker) return;

        // Reset states on ticker change
        setFilings([]);
        setInsiderTrades([]);
        setNews([]);
        setFmpArticles([]);
        setCongressTrades([]);

        // Fetch independently
        fetchSECFilings(ticker).then(setFilings).catch(e => console.error("SEC Filings error", e));
        fetchGeneralInsiderTrades().then(setInsiderTrades).catch(e => console.error("Insider Trades error", e));
        fetchGeneralStockNews().then(setNews).catch(e => console.error("Stock News error", e));
        fetchFMPArticles().then(setFmpArticles).catch(e => console.error("FMP Articles error", e));
        fetchCongressionalTrades(ticker).then(setCongressTrades).catch(e => console.error("Congress Trades error", e));
    }, [ticker]);

    const formatDate = (dateStr: string) => {
        try {
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return dateStr; // Return original string if invalid date
            return date.toLocaleDateString();
        } catch (e) {
            return dateStr;
        }
    };

    return (
        <div className="bg-slate-800 rounded-xl p-6 shadow-lg border border-slate-700 mt-6">
            <div className="flex space-x-4 border-b border-slate-700 mb-4">
                <button
                    className={`pb-2 px-4 ${activeTab === 'filings' ? 'border-b-2 border-blue-500 text-blue-400' : 'text-gray-400 hover:text-white'}`}
                    onClick={() => setActiveTab('filings')}
                >
                    SEC Filings
                </button>
                <button
                    className={`pb-2 px-4 ${activeTab === 'insider' ? 'border-b-2 border-blue-500 text-blue-400' : 'text-gray-400 hover:text-white'}`}
                    onClick={() => setActiveTab('insider')}
                >
                    Insider Trades
                </button>
                <button
                    className={`pb-2 px-4 ${activeTab === 'news' ? 'border-b-2 border-blue-500 text-blue-400' : 'text-gray-400 hover:text-white'}`}
                    onClick={() => setActiveTab('news')}
                >
                    Stock News
                </button>
                <button
                    onClick={() => setActiveTab('articles')}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeTab === 'articles' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-gray-400 hover:text-white hover:bg-slate-800'}`}
                >
                    FMP Articles
                </button>
                <button
                    onClick={() => setActiveTab('congress')}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeTab === 'congress' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-gray-400 hover:text-white hover:bg-slate-800'}`}
                >
                    Congress
                </button>
            </div>

            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4 min-h-[300px] max-h-[500px] overflow-y-auto custom-scrollbar">
                {/* Content */}
                {activeTab === 'congress' && (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-gray-300">
                            <thead className="text-xs uppercase bg-slate-700 text-gray-400">
                                <tr>
                                    <th className="px-4 py-2">Date</th>
                                    <th className="px-4 py-2">Representative</th>
                                    <th className="px-4 py-2">Chamber</th>
                                    <th className="px-4 py-2">Type</th>
                                    <th className="px-4 py-2">Amount</th>
                                    <th className="px-4 py-2">Filing</th>
                                </tr>
                            </thead>
                            <tbody>
                                {congressTrades.length === 0 ? <tr><td colSpan={6} className="text-center py-4">No congressional trades found.</td></tr> : congressTrades.map((trade, idx) => (
                                    <tr key={idx} className="border-b border-slate-700 hover:bg-slate-700/50">
                                        <td className="px-4 py-2">{formatDate(trade.transactionDate)}</td>
                                        <td className="px-4 py-2 font-bold text-white">{trade.representative}</td>
                                        <td className="px-4 py-2">
                                            <span className={`px-2 py-1 rounded text-xs font-bold ${trade.chamber === 'Senate' ? 'bg-purple-900/50 text-purple-400' : 'bg-blue-900/50 text-blue-400'}`}>
                                                {trade.chamber}
                                            </span>
                                        </td>
                                        <td className={`px-4 py-2 font-bold ${trade.type.includes('Purchase') ? 'text-green-400' : 'text-red-400'}`}>
                                            {trade.type}
                                        </td>
                                        <td className="px-4 py-2">{trade.amount}</td>
                                        <td className="px-4 py-2">
                                            {trade.link ? (
                                                <a href={trade.link} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline text-xs">
                                                    View
                                                </a>
                                            ) : <span className="text-gray-500 text-xs">N/A</span>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                {activeTab === 'filings' && (
                    <div className="space-y-2">
                        {filings.length === 0 ? <div className="text-gray-400">No filings found.</div> : filings.map((filing, idx) => (
                            <div key={idx} className="flex justify-between items-center p-3 bg-slate-700/50 rounded hover:bg-slate-700 transition">
                                <div className="flex items-center gap-3">
                                    <span
                                        className="font-bold text-blue-400 w-16 cursor-pointer hover:text-blue-300"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onTickerSelect(filing.symbol);
                                        }}
                                    >
                                        {filing.symbol}
                                    </span>
                                    <div>
                                        <span className="font-bold text-white mr-3">{filing.type}</span>
                                        <span className="text-sm text-gray-400">{formatDate(filing.fillingDate)}</span>
                                    </div>
                                </div>
                                <a href={filing.finalLink || filing.link} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 text-sm">
                                    View Filing &rarr;
                                </a>
                            </div>
                        ))}
                    </div>
                )}

                {activeTab === 'insider' && (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-gray-300">
                            <thead className="text-xs uppercase bg-slate-700 text-gray-400">
                                <tr>
                                    <th className="px-4 py-2">Filing Date</th>
                                    <th className="px-4 py-2">Trans. Date</th>
                                    <th className="px-4 py-2">Ticker</th>
                                    <th className="px-4 py-2">Insider</th>
                                    <th className="px-4 py-2">Type</th>
                                    <th className="px-4 py-2">Shares</th>
                                    <th className="px-4 py-2">Price</th>
                                    <th className="px-4 py-2">Value</th>
                                </tr>
                            </thead>
                            <tbody>
                                {insiderTrades.length === 0 ? <tr><td colSpan={8} className="text-center py-4">No insider trades found.</td></tr> : insiderTrades.map((trade, idx) => {
                                    // @ts-ignore - API might return different keys
                                    const filingDateStr = trade.filingDate || trade.acceptanceDate || trade.fillingDate || trade.transactionDate;
                                    const isToday = new Date(filingDateStr).toDateString() === new Date().toDateString();

                                    return (
                                        <tr key={idx} className={`border-b border-slate-700 hover:bg-slate-700/50 ${isToday ? 'bg-blue-900/20' : ''}`}>
                                            <td className="px-4 py-2">
                                                <div className="flex flex-col">
                                                    <span className={`text-xs font-bold ${isToday ? 'text-blue-400' : 'text-gray-300'}`}>
                                                        {new Date(filingDateStr).toLocaleDateString()}
                                                    </span>
                                                    <span className="text-[10px] text-gray-500">
                                                        {new Date(filingDateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                    {isToday && <span className="text-[10px] font-bold text-blue-400 animate-pulse">NEW</span>}
                                                </div>
                                            </td>
                                            <td className="px-4 py-2 text-gray-400">{formatDate(trade.transactionDate)}</td>
                                            <td
                                                className="px-4 py-2 font-bold text-blue-400 cursor-pointer hover:text-blue-300"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onTickerSelect(trade.symbol);
                                                }}
                                            >
                                                {trade.symbol}
                                            </td>
                                            <td className="px-4 py-2">
                                                <div className="flex flex-col">
                                                    <span>{trade.reportingName}</span>
                                                    <span className="text-[10px] text-gray-500">{trade.typeOfOwner}</span>
                                                </div>
                                            </td>
                                            <td className={`px-4 py-2 font-bold ${trade.transactionType.includes('Buy') || trade.transactionType.includes('Purchase') ? 'text-green-400' : 'text-red-400'}`}>
                                                {trade.transactionType}
                                            </td>
                                            <td className="px-4 py-2">{trade.securitiesTransacted.toLocaleString()}</td>
                                            <td className="px-4 py-2">${trade.price}</td>
                                            <td className="px-4 py-2">${(trade.securitiesTransacted * trade.price).toLocaleString()}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {activeTab === 'news' && (
                    <div className="space-y-4">
                        {news.length === 0 ? <div className="text-gray-400">No news found.</div> : news.map((item, idx) => (
                            <div key={idx} className="flex gap-4 p-3 bg-slate-700/50 rounded hover:bg-slate-700 transition">
                                {item.image && <img src={item.image} alt={item.title} className="w-24 h-16 object-cover rounded" />}
                                <div className="flex-1">
                                    <div className="flex justify-between items-start">
                                        <h4 className="font-bold text-white text-sm mb-1 line-clamp-2">{item.title}</h4>
                                        <span className="text-xs text-gray-500 whitespace-nowrap ml-2">{formatDate(item.publishedDate)}</span>
                                    </div>
                                    {renderTickers(item.symbol)}
                                    <p className="text-xs text-gray-400 line-clamp-2 mb-2 mt-1">{item.text}</p>
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs text-blue-400">{item.site}</span>
                                        <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:text-blue-300">
                                            Read More &rarr;
                                        </a>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {activeTab === 'articles' && (
                    <div className="space-y-4">
                        {fmpArticles.length === 0 ? <div className="text-gray-400">No articles found.</div> : fmpArticles.map((item, idx) => (
                            <div key={idx} className="flex gap-4 p-3 bg-slate-700/50 rounded hover:bg-slate-700 transition">
                                {item.image && <img src={item.image} alt={item.title} className="w-24 h-16 object-cover rounded" />}
                                <div className="flex-1">
                                    <div className="flex justify-between items-start">
                                        <h4 className="font-bold text-white text-sm mb-1 line-clamp-2">{item.title}</h4>
                                        <span className="text-xs text-gray-500 whitespace-nowrap ml-2">{formatDate(item.date)}</span>
                                    </div>
                                    {renderTickers(item.tickers)}
                                    <div
                                        className="text-xs text-gray-400 line-clamp-3 mb-2 mt-1"
                                        dangerouslySetInnerHTML={{ __html: item.content }}
                                    />
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs text-blue-400">{item.author}</span>
                                        <a href={item.link} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:text-blue-300">
                                            Read Full Article &rarr;
                                        </a>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

            </div>
        </div>
    );
};

export default FundamentalTabs;
