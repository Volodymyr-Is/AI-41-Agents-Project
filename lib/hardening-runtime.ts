import {
  InMemoryHardeningStore,
  ProductionHardeningGuard,
} from '@/src/hardening/guard';
import { PLATFORM_HOBBY_LIMITS } from '@/src/hardening/config';

const g = globalThis as typeof globalThis & {
  __fitpulseHardeningStore?: InMemoryHardeningStore;
  __fitpulseHardeningGuard?: ProductionHardeningGuard;
};

export function getHardeningStore(): InMemoryHardeningStore {
  return (g.__fitpulseHardeningStore ??= new InMemoryHardeningStore());
}

export function getHardeningGuard(): ProductionHardeningGuard {
  return (g.__fitpulseHardeningGuard ??= new ProductionHardeningGuard(
    getHardeningStore(),
    getHardeningStore(),
    {
      maxTokensPerDay: 250_000,
      maxUsdPerDay: 1.0,
      maxRequestsPerDay: 200,
      maxPayloadBytes: PLATFORM_HOBBY_LIMITS.maxPayloadBytes,
    }
  ));
}
