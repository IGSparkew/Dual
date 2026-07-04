import { NormalizedHap } from "@core/types/hap";
import { HapExtractor } from "../HapExtractor";

export class HapExtractorImpl implements HapExtractor {
    extract(pattern: any, begin: number, end: number): NormalizedHap[] {
        const rawHaps = pattern.queryArc(begin, end);
        
        return rawHaps.map((hap: any) => ({
            // Continuous haps have no `whole`; fall back to the queried part.
            begin: this.fractionToNumber((hap.whole ?? hap.part).begin),
            end: this.fractionToNumber((hap.whole ?? hap.part).end),
            sample: hap.value?.s ?? null,
            note: hap.value?.note ?? null,
            gain: hap.value?.gain ?? 1,
            pan: hap.value?.pan ?? 0.5,
            locations: hap.context?.locations ?? null,
        }));
    
    }

    private fractionToNumber(fraction: any): number {
        // Strudel fractions are BigInt-backed (fraction.js); convert each part
        // before dividing so we get a float, not a truncated BigInt.
        if (typeof fraction === 'number') return fraction;
        return (Number(fraction.s) * Number(fraction.n)) / Number(fraction.d);
    }
    
}

export const hapExtractor = new HapExtractorImpl();