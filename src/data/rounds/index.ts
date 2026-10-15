import type { Round } from '../../sim/types';

const R = (r: Round) => r;

export const ROUNDS: Round[] = [
  // ---------------- APFSDS
  R({ id: 'm829a1', name: 'M829A1', family: 'APFSDS', gun: '120 mm M256', caliber: 120, mass: 4.6, velocity: 1575, drag: 0.00005, rodLength: 0.684, rodDiameter: 24, penMaterial: 'du', filler: 0, description: 'US "Silver Bullet" depleted-uranium long rod. Self-sharpening and pyrophoric.' }),
  R({ id: 'm833', name: 'M833', family: 'APFSDS', gun: '105 mm M68', caliber: 105, mass: 3.7, velocity: 1494, drag: 0.00006, rodLength: 0.53, rodDiameter: 24, penMaterial: 'du', filler: 0, description: 'Depleted-uranium long rod for 105 mm guns.' }),
  R({ id: 'dm53', name: 'DM53', family: 'APFSDS', gun: '120 mm Rh L/55', caliber: 120, mass: 5.0, velocity: 1750, drag: 0.00005, rodLength: 0.745, rodDiameter: 25, penMaterial: 'tungsten', filler: 0, description: 'German tungsten long rod, very high velocity.' }),
  R({ id: '3bm42', name: '3BM42 Mango', family: 'APFSDS', gun: '125 mm 2A46M', caliber: 125, mass: 4.85, velocity: 1700, drag: 0.00006, rodLength: 0.574, rodDiameter: 30, penMaterial: 'tungsten', filler: 0, description: 'Soviet two-segment tungsten penetrator.' }),
  R({ id: '3bm15', name: '3BM15', family: 'APFSDS', gun: '125 mm 2A46', caliber: 125, mass: 3.6, velocity: 1785, drag: 0.00007, rodLength: 0.4, rodDiameter: 38, penMaterial: 'tungsten', filler: 0, description: 'Early Soviet steel rod with a tungsten carbide slug.' }),
  R({ id: 'l23', name: 'L23 APFSDS', family: 'APFSDS', gun: '120 mm L11', caliber: 120, mass: 3.9, velocity: 1534, drag: 0.00006, rodLength: 0.55, rodDiameter: 30, penMaterial: 'tungsten', filler: 0, description: 'British tungsten long rod for the rifled L11.' }),
  // ---------------- full-calibre AP
  R({ id: 'm72', name: 'M72 AP', family: 'AP', gun: '75 mm M3', caliber: 75, mass: 6.3, velocity: 619, drag: 0.00012, penMaterial: 'steel', filler: 0, description: 'Uncapped solid steel shot.' }),
  R({ id: 'm82', name: 'M82 APC', family: 'AP', gun: '90 mm M3', caliber: 90, mass: 10.9, velocity: 853, drag: 0.0001, penMaterial: 'steel', filler: 0, capped: true, description: 'Capped solid steel shot.' }),
  // ---------------- APHE
  R({ id: 'br365k', name: 'BR-365K', family: 'APHE', gun: '85 mm ZiS-S-53', caliber: 85, mass: 9.2, velocity: 792, drag: 0.0001, penMaterial: 'steel', filler: 0.048, capped: true, fuzeDelay: 1.3, description: 'Soviet armour-piercing high explosive with ballistic cap.' }),
  R({ id: 'pzgr39', name: 'PzGr 39/43', family: 'APHE', gun: '88 mm KwK 43', caliber: 88, mass: 10.2, velocity: 1000, drag: 0.0001, penMaterial: 'steel', filler: 0.11, capped: true, fuzeDelay: 1.2, description: 'German APCBC-HE; large filler, devastating inside the hull.' }),
  R({ id: 'br471', name: 'BR-471', family: 'APHE', gun: '122 mm D-25T', caliber: 122, mass: 25, velocity: 800, drag: 0.0001, penMaterial: 'steel', filler: 0.156, fuzeDelay: 1.3, description: 'Heavy 122 mm APHE.' }),
  R({ id: 'pzgr39_42', name: 'PzGr 39/42', family: 'APHE', gun: '75 mm KwK 42', caliber: 75, mass: 6.8, velocity: 925, drag: 0.0001, penMaterial: 'steel', filler: 0.018, capped: true, fuzeDelay: 1.2, description: 'Panther APCBC-HE: high velocity from the long L/70 gun.' }),
  R({ id: 'br412d', name: 'BR-412D', family: 'APHE', gun: '100 mm D-10T', caliber: 100, mass: 15.9, velocity: 887, drag: 0.0001, penMaterial: 'steel', filler: 0.065, capped: true, fuzeDelay: 1.3, description: 'Soviet 100 mm APCBC-HE.' }),
  // ---------------- HEAT
  R({ id: 'm431', name: 'M431 HEAT', family: 'HEAT', gun: '90 mm M41', caliber: 90, mass: 5.8, velocity: 1219, drag: 0.0002, penMaterial: 'steel', filler: 0.77, cdFactor: 3.6, description: 'Fin-stabilised 90 mm HEAT for the Patton.' }),
  R({ id: 'm456a2', name: 'M456A2', family: 'HEAT', gun: '105 mm M68', caliber: 105, mass: 10.2, velocity: 1173, drag: 0.0002, penMaterial: 'steel', filler: 0.98, cdFactor: 3.81, description: 'Fin-stabilised HEAT. Jet penetration does not depend on range.' }),
  R({ id: 'm830', name: 'M830', family: 'HEAT', gun: '120 mm M256', caliber: 120, mass: 13.5, velocity: 1140, drag: 0.0002, penMaterial: 'steel', filler: 1.7, cdFactor: 4.0, description: 'HEAT-MP for 120 mm guns.' }),
  R({ id: '3bk14m', name: '3BK14M', family: 'HEAT', gun: '125 mm 2A46M', caliber: 125, mass: 19, velocity: 905, drag: 0.0002, penMaterial: 'steel', filler: 1.76, cdFactor: 4.0, description: 'Soviet 125 mm HEAT-FS.' }),
  // ---------------- HESH
  R({ id: 'l35', name: 'L35 HESH', family: 'HESH', gun: '105 mm L7', caliber: 105, mass: 11.3, velocity: 732, drag: 0.00015, penMaterial: 'steel', filler: 2.0, description: 'Squash head: plasters explosive on the plate and blows scabs off the inside face.' }),
  R({ id: 'l31', name: 'L31 HESH', family: 'HESH', gun: '120 mm L11', caliber: 120, mass: 17.1, velocity: 670, drag: 0.00015, penMaterial: 'steel', filler: 4.08, description: 'Heavy 120 mm HESH.' }),
  // ---------------- HE
  R({ id: 'of365', name: 'OF-365', family: 'HE', gun: '85 mm ZiS-S-53', caliber: 85, mass: 9.54, velocity: 793, drag: 0.00012, penMaterial: 'steel', filler: 0.74, description: 'Fragmentation HE. Only threatens thin armour.' }),
  R({ id: 'of412', name: 'OF-412', family: 'HE', gun: '100 mm D-10T', caliber: 100, mass: 15.6, velocity: 900, drag: 0.00012, penMaterial: 'steel', filler: 1.46, description: '100 mm HE-FRAG.' }),
  R({ id: 'of471', name: 'OF-471', family: 'HE', gun: '122 mm D-25T', caliber: 122, mass: 25, velocity: 800, drag: 0.00012, penMaterial: 'steel', filler: 3.6, description: 'Big 122 mm HE – the blast can kill crews through thin roofs.' }),
];

export const roundById = (id: string): Round => {
  const r = ROUNDS.find((x) => x.id === id);
  if (!r) throw new Error(`Unknown round ${id}`);
  return r;
};

export const FAMILIES = ['APFSDS', 'AP', 'APHE', 'HEAT', 'HESH', 'HE'] as const;
