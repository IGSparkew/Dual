import { NormalizedHap } from "@core/types/hap";
import { HapExtractor } from "../HapExtractor";

export class HapExtractorImpl implements HapExtractor {
    extract(pattern: any, begin: number, end: number): NormalizedHap[] {
        const rawHaps = pattern.queryArc(begin, end);
        
        return rawHaps.map((hap: any) => ({
            begin: this.fractionToNumber(hap.whole.begin),
            end: this.fractionToNumber(hap.whole.end),
            sample: hap.value?.s ?? null,
            note: hap.value?.note ?? null,
            gain: hap.value?.gain ?? 1,
            pan: hap.value?.pan ?? 0.5,
            locations: hap.context?.locations ?? null,
        }));
    
    }

    private fractionToNumber(fraction: any): number {
        return fraction.s * fraction.n / fraction.d;
    }
    
}

export const hapExtractor = new HapExtractorImpl();