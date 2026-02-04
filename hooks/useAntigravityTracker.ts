import { useState, useMemo, useEffect } from "react";

export interface AntigravityForm {
    account: number;
    optionPrice: number;
    riskPercent: number;
}

export interface TradeStats {
    totalTrades: number;
    winsByLevel: Record<number, number>;
    lossesByLevel: Record<number, number>;
    completedCycles: number;
    brokenCycles: number;
    realizedPnL: number;
}

export interface TradeHistoryItem {
    id: number;
    timestamp: string;
    dayKey: string;
    level: number;
    result: 'win' | 'lose';
    pnl: number;
    equityAfter: number;
}

export interface SavedSession {
    id: number;
    date: string;
    stats: TradeStats;
    history: TradeHistoryItem[];
    finalAccount: number;
}

export interface LevelConfig {
    id: number;
    multiplier: number;
}

const STORAGE_KEY = 'antigravity_tracker_state';
const HISTORY_KEY = 'antigravity_saved_sessions';

export function useAntigravityTracker(initialAccount = 10000, initialOptionPrice = 1.5, initialRiskPercent = 15) {
    // Initialize state from localStorage or defaults
    const [form, setForm] = useState<AntigravityForm>(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            return parsed.form || { account: initialAccount, optionPrice: initialOptionPrice, riskPercent: initialRiskPercent };
        }
        return { account: initialAccount, optionPrice: initialOptionPrice, riskPercent: initialRiskPercent };
    });

    const [currentLevel, setCurrentLevel] = useState(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        return saved ? JSON.parse(saved).currentLevel || 1 : 1;
    });

    const [stats, setStats] = useState<TradeStats>(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        return saved ? JSON.parse(saved).stats || {
            totalTrades: 0,
            winsByLevel: { 1: 0, 2: 0, 3: 0, 4: 0 },
            lossesByLevel: { 1: 0, 2: 0, 3: 0, 4: 0 },
            completedCycles: 0,
            brokenCycles: 0,
            realizedPnL: 0,
        } : {
            totalTrades: 0,
            winsByLevel: { 1: 0, 2: 0, 3: 0, 4: 0 },
            lossesByLevel: { 1: 0, 2: 0, 3: 0, 4: 0 },
            completedCycles: 0,
            brokenCycles: 0,
            realizedPnL: 0,
        };
    });

    // Single source of truth for all trades
    const [history, setHistory] = useState<TradeHistoryItem[]>(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        return saved ? JSON.parse(saved).history || [] : [];
    });

    const [savedSessions, setSavedSessions] = useState<SavedSession[]>(() => {
        const saved = localStorage.getItem(HISTORY_KEY);
        return saved ? JSON.parse(saved) : [];
    });

    // Persistence Effect
    useEffect(() => {
        const stateToSave = {
            form,
            currentLevel,
            stats,
            history
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
    }, [form, currentLevel, stats, history]);

    // Save Sessions Effect
    useEffect(() => {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(savedSessions));
    }, [savedSessions]);

    const levels: LevelConfig[] = [
        { id: 1, multiplier: 1 },
        { id: 2, multiplier: 3 },
        { id: 3, multiplier: 2 },
        { id: 4, multiplier: 6 },
    ];

    const baseUnit = useMemo(
        () => form.account * (form.riskPercent / 100),
        [form.account, form.riskPercent]
    );

    const computeRow = (level: LevelConfig) => {
        const size = baseUnit * level.multiplier;
        const contracts = Math.floor(size / (form.optionPrice * 100));
        const isLast = level.id === 4;
        const tpPct = isLast ? 0.75 : 0.25;   // 75% for L4, 25% others
        const slPct = 0.33;                   // 33% avg loss
        const tpText = isLast ? "≈ +75%" : "≈ +25%";
        const slText = "≈ -33%";

        return {
            size,
            contracts,
            tpText,
            slText,
            tpPct,
            slPct,
        };
    };

    const handleFormChange = (field: keyof AntigravityForm, value: number) => {
        setForm((prev) => ({
            ...prev,
            [field]: Number(value),
        }));
    };

    const getDayKey = (dateObj: Date) => {
        // YYYY-MM-DD
        return dateObj.toISOString().slice(0, 10);
    };

    const recordTrade = (result: 'win' | 'lose') => {
        const levelObj = levels.find((l) => l.id === currentLevel);
        if (!levelObj) return;

        const row = computeRow(levelObj);

        let tradePnL = 0;
        if (result === "win") {
            tradePnL = row.size * row.tpPct;
        } else {
            tradePnL = -row.size * row.slPct;
        }

        const newAccount = form.account + tradePnL;
        const now = new Date();
        const dayKey = getDayKey(now);

        setForm((prev) => ({
            ...prev,
            account: newAccount,
        }));

        setStats((prev) => {
            const winsByLevel = { ...prev.winsByLevel };
            const lossesByLevel = { ...prev.lossesByLevel };

            if (result === "win") {
                winsByLevel[currentLevel] = (winsByLevel[currentLevel] || 0) + 1;
            } else {
                lossesByLevel[currentLevel] = (lossesByLevel[currentLevel] || 0) + 1;
            }

            let completedCycles = prev.completedCycles;
            let brokenCycles = prev.brokenCycles;

            if (result === "lose") {
                brokenCycles += 1;
            } else if (result === "win" && currentLevel === 4) {
                completedCycles += 1;
            }

            return {
                totalTrades: prev.totalTrades + 1,
                winsByLevel,
                lossesByLevel,
                completedCycles,
                brokenCycles,
                realizedPnL: prev.realizedPnL + tradePnL,
            };
        });

        setHistory((prev) => [
            ...prev,
            {
                id: prev.length + 1,
                timestamp: now.toISOString(),
                dayKey,
                level: currentLevel,
                result,
                pnl: tradePnL,
                equityAfter: newAccount,
            },
        ]);

        // Progress / reset levels
        if (result === "win") {
            if (currentLevel < 4) {
                setCurrentLevel((lvl) => lvl + 1);
            } else {
                setCurrentLevel(1);
            }
        } else {
            setCurrentLevel(1);
        }
    };

    const resetCurrentSession = (revertAccount = false) => {
        if (revertAccount) {
            setForm(prev => ({
                ...prev,
                account: prev.account - stats.realizedPnL
            }));
        }

        setStats({
            totalTrades: 0,
            winsByLevel: { 1: 0, 2: 0, 3: 0, 4: 0 },
            lossesByLevel: { 1: 0, 2: 0, 3: 0, 4: 0 },
            completedCycles: 0,
            brokenCycles: 0,
            realizedPnL: 0,
        });
        setHistory([]);
        setCurrentLevel(1);
    };

    const saveAndClearSession = () => {
        if (history.length === 0) return;

        const newSession: SavedSession = {
            id: Date.now(),
            date: new Date().toISOString(),
            stats: { ...stats },
            history: [...history],
            finalAccount: form.account
        };

        setSavedSessions(prev => [newSession, ...prev]);
        resetCurrentSession(false);
    };

    const clearAllHistory = () => {
        setSavedSessions([]);
        localStorage.removeItem(HISTORY_KEY);
    };

    // Daily grouping
    const dailySummary = useMemo(() => {
        const map: Record<string, { dayKey: string; trades: number; pnl: number }> = {};
        for (const trade of history) {
            if (!map[trade.dayKey]) {
                map[trade.dayKey] = {
                    dayKey: trade.dayKey,
                    trades: 0,
                    pnl: 0,
                };
            }
            map[trade.dayKey].trades += 1;
            map[trade.dayKey].pnl += trade.pnl;
        }
        return Object.values(map).sort((a, b) => (a.dayKey > b.dayKey ? 1 : -1));
    }, [history]);

    // Simple equity curve points
    const equityCurve = useMemo(() => {
        if (history.length === 0) {
            return [{ x: 0, y: form.account }];
        }
        return history.map((h, idx) => ({ x: idx + 1, y: h.equityAfter }));
    }, [history, form.account]);

    // Theoretical cycle win probability (for display)
    const p = 0.55;
    const probCycleWin = Math.pow(p, 4);

    return {
        form,
        setForm,
        currentLevel,
        stats,
        history,
        savedSessions,
        dailySummary,
        equityCurve,
        levels,
        baseUnit,
        computeRow,
        handleFormChange,
        recordTrade,
        resetCurrentSession,
        saveAndClearSession,
        clearAllHistory,
        probCycleWin,
    };
}
