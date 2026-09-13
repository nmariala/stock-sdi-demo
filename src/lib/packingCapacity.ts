export const PACKING_CAPACITY: Record<string, { max: number; buffer: number }> = {
  'SB100': { max: 300, buffer: 300 },
  'SB110': { max: 180, buffer: 178 },
  'XL': { max: 384, buffer: 384 },
  'Pancake Box': { max: 63, buffer: 63 },
  'Roll Besar': { max: 144, buffer: 140 },
  'Roll Lite': { max: 238, buffer: 230 },
  'Non Cream': { max: 120, buffer: 120 },
  'Foil': { max: 168, buffer: 168 },
  'Ice Cream': { max: 270, buffer: 270 },
  'Daging Durian': { max: 72, buffer: 69 },
  'Durpas GB': { max: 89, buffer: 85 },
  'Durpas BB': { max: 101, buffer: 97 },
  'Mille Crepes Lite': { max: 150, buffer: 144 },
  'Mille Crepes': { max: 96, buffer: 92 },
  'Monpal 300gr': { max: 72, buffer: 69 },
  'Monpal Vacuum': { max: 75, buffer: 75 },
  'Es Puter': { max: 90, buffer: 86 },
  'Monpal GB': { max: 77, buffer: 74 },
  'Susu Durian': { max: 220, buffer: 220 },
};

export const PACKING_GROUPS: { id: string; label: string; items: string[] }[] = [
  { id: 'SB100', label: 'SB100', items: ['SB100'] },
  { id: 'SB110', label: 'SB110', items: ['SB110'] },
  { id: 'XL', label: 'XL', items: ['XL'] },
  { id: 'Pancake Box', label: 'Pancake Box', items: ['Pancake Box'] },
  { id: 'Roll Besar', label: 'Roll Besar', items: ['Roll Reguler', 'Roll Premium'] },
  { id: 'Roll Lite', label: 'Roll Lite', items: ['Roll Lite Reguler', 'Roll Lite Premium'] },
  { id: 'Non Cream', label: 'Non Cream', items: ['Non Cream'] },
  { id: 'Foil', label: 'Foil', items: ['Foil'] },
  { id: 'Ice Cream', label: 'Ice Cream', items: ['Ice Cream'] },
  { id: 'Daging Durian', label: 'Daging Durian (kg)', items: ['Daging Durian'] },
  { id: 'Durpas GB', label: 'Durpas GB', items: ['Durpas GB'] },
  { id: 'Durpas BB', label: 'Durpas BB', items: ['Durpas BB'] },
  { id: 'Monpal', label: 'Monpal', items: ['Monpal'] },
  { id: 'Mille Crepes Lite', label: 'Mille Crepes Lite', items: ['Mille Crepes Lite'] },
  { id: 'Mille Crepes', label: 'Mille Crepes', items: ['Mille Crepes'] },
  { id: 'Monpal 300gr', label: 'Monpal 300gr', items: ['Monpal 300gr'] },
  { id: 'Monpal Vacuum', label: 'Monpal Vacuum', items: ['Monpal Vacuum'] },
  { id: 'Es Puter', label: 'Es Puter', items: ['Es Puter'] },
  { id: 'Monpal GB', label: 'Monpal GB', items: ['Monpal GB'] },
  { id: 'Susu Durian', label: 'Susu Durian', items: ['Susu Durian'] },
];

export const ITEM_ALIASES: Record<string, string> = {
  'sb100': 'SB100',
  'pancake sb100': 'SB100',
  'pancake mini sb100': 'SB100',
  'sb110': 'SB110',
  'pc sb110': 'SB110',
  'pancake sb110': 'SB110',
  'pancake mini sb110': 'SB110',
  'xl': 'XL',
  'pc xl': 'XL',
  'pancake xl': 'XL',
  'pancake mini xl': 'XL',
  'roll reguler': 'Roll Reguler',
  'roll reg': 'Roll Reguler',
  'pc roll reg': 'Roll Reguler',
  'pc.roll reg': 'Roll Reguler',
  'pc.roll reguler': 'Roll Reguler',
  'pancake roll reg': 'Roll Reguler',
  'roll reg jumbo': 'Roll Reguler',
  'roll reg besar': 'Roll Reguler',
  'roll premium': 'Roll Premium',
  'roll prem': 'Roll Premium',
  'pc roll premium': 'Roll Premium',
  'pc.roll prem': 'Roll Premium',
  'pc.roll premium': 'Roll Premium',
  'premium jumbo': 'Roll Premium',
  'roll lite reg': 'Roll Lite Reguler',
  'roll reg lite': 'Roll Lite Reguler',
  'pc roll lite reg': 'Roll Lite Reguler',
  'pc.roll lite reg': 'Roll Lite Reguler',
  'pc.roll lite reguler': 'Roll Lite Reguler',
  'roll lite prem': 'Roll Lite Premium',
  'roll lite reguler': 'Roll Lite Reguler',
  'lite reg': 'Roll Lite Reguler',
  'pc roll lite prem': 'Roll Lite Premium',
  'pc.roll lite prem': 'Roll Lite Premium',
  'pc.roll lite premium': 'Roll Lite Premium',
  'lite prem': 'Roll Lite Premium',
  'roll lite premium': 'Roll Lite Premium',
  'roll premium lite': 'Roll Lite Premium',
  'non cream': 'Non Cream',
  'pc non cream': 'Non Cream',
  'pancake non cream': 'Non Cream',
  'pancake durian box non cream': 'Non Cream',
  'pc nc': 'Non Cream',
  'pc.nc': 'Non Cream',
  'pc.non cream': 'Non Cream',
  'box isi 10': 'Pancake Box',
  'box isi 15': 'Pancake Box',
  'box isi 21': 'Pancake Box',
  'box 10': 'Pancake Box',
  'box 15': 'Pancake Box',
  'box 21': 'Pancake Box',
  'pc box 10': 'Pancake Box',
  'pc.box 10': 'Pancake Box',
  'pc. box 10': 'Pancake Box',
  'pc box 15': 'Pancake Box',
  'pc.box 15': 'Pancake Box',
  'pc. box 15': 'Pancake Box',
  'pc box 21': 'Pancake Box',
  'pc.box 21': 'Pancake Box',
  'pc. box 21': 'Pancake Box',
  'pancake box 10': 'Pancake Box',
  'pancake box 15': 'Pancake Box',
  'pancake box 21': 'Pancake Box',
  'ice cream': 'Ice Cream',
  'es krim': 'Ice Cream',
  'ice durian': 'Ice Cream',
  'ice ori durian': 'Ice Cream',
  'es puter': 'Es Puter',
  'es puter durian': 'Es Puter',
  'monpal vacuum': 'Monpal Vacuum',
  'montong palu vacuum': 'Monpal Vacuum',
  'm. vacuum': 'Monpal Vacuum',
  'mt vakum': 'Monpal Vacuum',
  'monpal vakum': 'Monpal Vacuum',
  'montong palu 300gr': 'Monpal 300gr',
  'mt 300gr': 'Monpal 300gr',
  'mt palu 300gr': 'Monpal 300gr',
  'monpal 300gr': 'Monpal 300gr',
  'm. palu 300gr': 'Monpal 300gr',
  'monpal gb': 'Monpal GB',
  'monthong gb': 'Monpal GB',
  'monthong palu gb': 'Monpal GB',
  'montong gb': 'Monpal GB',
  'mt gb': 'Monpal GB',
  'susu durian': 'Susu Durian',
  'susu ori': 'Susu Durian',
  'daging durian': 'Daging Durian',
  'daging ori': 'Daging Durian',
  'daging mix': 'Daging Durian',
  dagdur: 'Daging Durian',
  'dg ori': 'Daging Durian',
  'dg mix': 'Daging Durian',
};

const KEY_TO_GROUP: Record<string, string> = {};
const CANONICAL_KEYS: Record<string, string> = {};
PACKING_GROUPS.forEach((g) => {
  g.items.forEach((it) => {
    const k = it.toLowerCase().replace(/\s+/g, ' ').trim();
    KEY_TO_GROUP[k] = g.id;
    CANONICAL_KEYS[k] = it;
  });
});

const canonOf = (k: string): string | undefined =>
  ITEM_ALIASES[k] ?? CANONICAL_KEYS[k];

export const CONTAINS_KEYS: { key: string; canonical: string }[] = [
  ...new Set([...Object.keys(ITEM_ALIASES), ...Object.keys(CANONICAL_KEYS)]),
]
  .sort((a, b) => b.length - a.length)
  .map((key) => ({ key, canonical: canonOf(key) as string }));

export const VALID_ITEMS_REF = PACKING_GROUPS.map((g) => {
  const cap = PACKING_CAPACITY[g.id] || { max: 0, buffer: 0 };
  return { id: g.id, label: g.label, items: g.items, max: cap.max, buffer: cap.buffer };
});

export const PACKING_TYPES: Record<string, { ratio: number; unit: string }> = {
  Foam: { ratio: 1, unit: 'Foam' },
  Styrofoam: { ratio: 1, unit: 'Styrofoam' },
  Kardus: { ratio: 0.8, unit: 'Kardus' },
  Koli: { ratio: 0.8, unit: 'Koli' },
};
