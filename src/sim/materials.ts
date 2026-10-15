import type { MaterialId } from './types';

/**
 * RHA-equivalence multipliers per material against kinetic (KE) and chemical (CE / HEAT jet) threats.
 * Effective protection = physical mm × multiplier.
 */
export const MATERIALS: Record<MaterialId, { name: string; ke: number; ce: number; color: number }> = {
  rha: { name: 'Rolled homogeneous armor', ke: 1.0, ce: 1.0, color: 0x9aa4ad },
  cast: { name: 'Cast steel', ke: 0.94, ce: 0.94, color: 0x8c949a },
  hha: { name: 'High-hardness armor', ke: 1.15, ce: 1.0, color: 0xb1bcc6 },
  structural: { name: 'Structural steel', ke: 0.45, ce: 0.45, color: 0x6d757c },
  ceramic: { name: 'Ceramic', ke: 1.6, ce: 2.0, color: 0xe8e2c8 },
  nera: { name: 'NERA sandwich', ke: 0.55, ce: 1.25, color: 0x5fb2c9 },
  textolite: { name: 'Glass textolite', ke: 0.6, ce: 1.1, color: 0xd8c25a },
  rubber: { name: 'Rubber', ke: 0.3, ce: 1.0, color: 0x3a3a3a },
  air: { name: 'Air gap', ke: 0, ce: 0, color: 0x223344 },
  era: { name: 'Explosive reactive armor', ke: 1.0, ce: 1.0, color: 0xa8c880 },
};
