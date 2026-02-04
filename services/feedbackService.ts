
export interface FeedbackItem {
    id: string;
    timestamp: number;
    ticker: string;
    strategy: string; // The strategy summary or type
    rating: 'POSITIVE' | 'NEGATIVE';
}

const STORAGE_KEY = 'ai_strategy_feedback';

export const saveFeedback = (ticker: string, strategy: string, rating: 'POSITIVE' | 'NEGATIVE') => {
    if (typeof window === 'undefined') return;

    const newItem: FeedbackItem = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        ticker,
        strategy,
        rating
    };

    const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const updated = [newItem, ...existing].slice(0, 50); // Keep last 50
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
};

export const getRecentSuccessfulPatterns = (limit: number = 5): string => {
    if (typeof window === 'undefined') return '';

    try {
        const history: FeedbackItem[] = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');

        // Filter for POSITIVE feedback
        const wins = history.filter(h => h.rating === 'POSITIVE');

        if (wins.length === 0) return '';

        // Format for AI Prompt
        const recentWins = wins.slice(0, limit).map(w =>
            `- ${w.ticker}: ${w.strategy.substring(0, 100)}...`
        ).join('\n');

        return `\n\nUSER FEEDBACK CONTEXT (LEARNING LOOP):\nThe user has explicitly UPVOTED the following recent strategies. ALIGN your new recommendation with these successful patterns:\n${recentWins}`;
    } catch (e) {
        console.warn("Failed to read feedback history", e);
        return '';
    }
};
