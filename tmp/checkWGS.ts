import { fetchSECFilings, fetchInsiderTrades } from './services/fmpService';

(async () => {
    const ticker = 'WGS';
    console.log('SEC filings for', ticker);
    try {
        const filings = await fetchSECFilings(ticker);
        console.log('SEC filings count:', filings.length);
        console.log(filings);
    } catch (e) {
        console.error('Error fetching SEC filings', e);
    }

    console.log('Insider trades for', ticker);
    try {
        const trades = await fetchInsiderTrades(ticker);
        console.log('Insider trades count:', trades.length);
        console.log(trades);
    } catch (e) {
        console.error('Error fetching insider trades', e);
    }
})();
