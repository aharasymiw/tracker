import type { ConsumptionType } from '@/types'

export const DEFAULT_UNITS: Record<ConsumptionType, string> = {
  flower: 'hits',
  vape: 'puffs',
  edible: 'mg',
  concentrate: 'dabs',
  tincture: 'drops',
  topical: 'applications',
}
