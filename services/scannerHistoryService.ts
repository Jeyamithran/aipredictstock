import { ScannerHistoryItem, ScannerProfile, ScannerResponse, ScannerAlert } from '../types';

const HISTORY_KEY = 'scanner_history_v1';
const MAX_HISTORY_ITEMS = 50;

export const saveScanToHistory = (profile: ScannerProfile, response: ScannerResponse): void => {
    try {
        // Safe check for localStorage availability
        if (typeof window === 'undefined' || !window.localStorage) return;

        const timestamp = Date.now();
        const id = `scan_${timestamp}`;

        // Tag alerts with their bucket before flattening
        const smallCap = response.SmallCap.map(a => ({ ...a, Bucket: 'SmallCap' as const }));
        const midCap = response.MidCap.map(a => ({ ...a, Bucket: 'MidCap' as const }));
        const largeCap = response.LargeCap.map(a => ({ ...a, Bucket: 'LargeCap' as const }));

        // Flatten alerts for summary count
        const allAlerts = [
            ...smallCap,
            ...midCap,
            ...largeCap
        ];

        if (allAlerts.length === 0) return; // Don't save empty scans

        const newItem: ScannerHistoryItem = {
            id,
            timestamp,
            profile,
            alerts: allAlerts,
            summary: `Found ${allAlerts.length} candidates`
        };

        const existingHistory = getScannerHistory();
        const updatedHistory = [newItem, ...existingHistory].slice(0, MAX_HISTORY_ITEMS);

        try {
            localStorage.setItem(HISTORY_KEY, JSON.stringify(updatedHistory));
        } catch (e: any) {
            if (e.name === 'QuotaExceededError') {
                // If quota exceeded, try removing half the history and saving again
                const reducedHistory = [newItem, ...existingHistory].slice(0, MAX_HISTORY_ITEMS / 2);
                try {
                    localStorage.setItem(HISTORY_KEY, JSON.stringify(reducedHistory));
                } catch (retryError) {
                    console.error("Failed to save history even after reduction:", retryError);
                }
            } else {
                console.error("Failed to save history:", e);
            }
        }
    } catch (error) {
        console.error("Critical error in saveScanToHistory:", error);
    }
};

export const getScannerHistory = (): ScannerHistoryItem[] => {
    try {
        if (typeof window === 'undefined' || !window.localStorage) return [];
        const stored = localStorage.getItem(HISTORY_KEY);
        if (!stored) return [];

        const parsed = JSON.parse(stored);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.error("Failed to retrieve scan history:", error);
        return [];
    }
};

export const clearScannerHistory = (): void => {
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            localStorage.removeItem(HISTORY_KEY);
            // Dispatch a custom event so other tabs/components know history is cleared
            window.dispatchEvent(new Event('scanner-history-cleared'));
        }
    } catch (e) {
        console.error("Failed to clear history:", e);
    }
};

export const reconstructResponseFromHistory = (item: ScannerHistoryItem): ScannerResponse => {
    // Filter alerts back into buckets based on the saved Bucket property
    // If Bucket property is missing (legacy history), default to SmallCap or try to guess?
    // For now, default to SmallCap if missing to avoid data loss.

    return {
        SmallCap: item.alerts.filter(a => a.Bucket === 'SmallCap' || !a.Bucket),
        MidCap: item.alerts.filter(a => a.Bucket === 'MidCap'),
        LargeCap: item.alerts.filter(a => a.Bucket === 'LargeCap')
    };
};
