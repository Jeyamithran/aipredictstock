import { describe, it, expect } from 'vitest';
import { ODTEBackendService } from '../server/services/odteBackendService';
import { MarketContextV2, GammaRegime, FlowAggregates } from '../types';

describe('Bias Engine Logic V2', () => {

    const mockContext: MarketContextV2 = {
        vwap: 450,
        priceVsVwap: 'Unknown',
        vwapDistancePct: 0
    };

    const mockRegime: GammaRegime = {
        regime: 'Neutral',
        netGammaUSD: 0,
        netDelta: 0,
        gammaFlip: false
    };

    const mockFlow: FlowAggregates = {
        callAskNotional: 0, putAskNotional: 0,
        callBidNotional: 0, putBidNotional: 0,
        atmCallAskNotional: 0, atmPutAskNotional: 0,
        callVolume: 0, putVolume: 0,
        rvolLike: null,
        bursts: [],
        normalizedImbalance: { overall: 0, atm: 0 }
    };

    const mockWalls = {
        callWall: 460,
        putWall: 440,
        maxPain: 450,
        distToCallWallPct: 0.05,
        distToPutWallPct: -0.05
    };

    it('should output NoTrade for conflicting or weak signals', () => {
        const bias = ODTEBackendService.calculateBiasV2(
            'TEST_1',
            mockContext,
            mockRegime,
            mockFlow,
            mockWalls
        );
        expect(bias.bias).toBe('NoTrade');
        // Max score needs to be >= 40 to trade
    });

    it('should be Bullish if ATM Call Imbalance + AboveVWAP (Short Gamma)', () => {
        const result = ODTEBackendService.calculateBiasV2(
            'TEST_2',
            { ...mockContext, priceVsVwap: 'Above' },
            { ...mockRegime, regime: 'ShortGamma' },
            { ...mockFlow, normalizedImbalance: { atm: 0.3, overall: 0.2 } },
            mockWalls
        );
        // Scores: 
        // ATM>0.2 => Bull +25
        // Overall>0.15 => Bull +10
        // ShortGamma + AboveVWAP => Bull +20
        // Total Bull: 55. Bear: 0. Net: 55.
        // Threshold: Max > 40. Net > 15.
        expect(result.bias).toBe('Bullish');
    });

    it('should be Bearish if ATM Put Imbalance + BelowVWAP (Short Gamma)', () => {
        const result = ODTEBackendService.calculateBiasV2(
            'TEST_3',
            { ...mockContext, priceVsVwap: 'Below' },
            { ...mockRegime, regime: 'ShortGamma' },
            { ...mockFlow, normalizedImbalance: { atm: -0.3, overall: -0.2 } },
            mockWalls
        );
        // Scores:
        // ATM<-0.2 => Bear +25
        // Overall<-0.15 => Bear +10
        // ShortGamma + BelowVWAP => Bear +20
        // Total Bear: 55.
        expect(result.bias).toBe('Bearish');
    });

    it('should penalize LongGamma Pinning', () => {
        // Long Gamma > 200M, distPct < 0.25 (Near VWAP) => Pinned penalty (-20 each)
        const result = ODTEBackendService.calculateBiasV2(
            'TEST_4',
            { ...mockContext, priceVsVwap: 'Above', vwapDistancePct: 0.1 },
            { ...mockRegime, regime: 'LongGamma', netGammaUSD: 300_000_000 },
            { ...mockFlow, normalizedImbalance: { atm: 0.3, overall: 0.2 } }, // Normally Bullish (+35)
            mockWalls
        );
        // BullScore: 35. 
        // Penalty: -20. Net Bull: 15.
        // BearScore: 0 - 20 = -20.
        // Net Score: 35. 
        // Logic: if Pinned, subtract 20 from both? Yes.
        // Bull: 35 - 20 = 15.
        // MaxScore = 15.
        // Threshold > 40.
        expect(result.bias).toBe('NoTrade');
        expect(result.reasons.some(r => r.includes("Pinned"))).toBeTruthy();
    });

});

