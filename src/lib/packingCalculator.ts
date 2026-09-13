import {
  PACKING_CAPACITY,
  PACKING_GROUPS,
  PACKING_TYPES,
  ITEM_ALIASES,
  CONTAINS_KEYS,
} from './packingCapacity';

export interface PackingItem {
  name: string;
  qty: number;
}

export interface PackingGroupResult {
  id: string;
  label: string;
  qty: number;
  present: PackingItem[];
  max: number;
  buffer: number;
  useMax: boolean;
  pct: number;
}

export interface CustomerInput {
  name: string;
  items: PackingItem[];
  packingType: string | null;
  notes: string[];
  requestedPacking: { type: string; count: number } | null;
}

export interface CustomerResult extends CustomerInput {
  packingType: string;
  packingDefault: boolean;
  items: PackingItem[];
  groups: PackingGroupResult[];
  totalPct: number;
  neededUnits: number;
  totalPacks: number;
  requestedCount: number;
  requestType: string | null;
  empty: boolean;
}

type RawItem = { name: string; qty: number };
type RawCustomer = {
  name: string;
  items: RawItem[];
  packingType: string | null;
  notes: string[];
  requestedPacking: { type: string; count: number } | null;
};

export const normalizeKey = (s: unknown): string =>
  String(s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

export function normalizeItem(rawName: string) {
  const key = normalizeKey(rawName);
  if (ITEM_ALIASES[key]) return { matched: true, name: ITEM_ALIASES[key], key };
  return { matched: false, name: null as string | null, key };
}

const DAGING_RE = /daging|dagdur|dg[\s.]ori|dg[\s.]mix/i;

export function mapItem(rawName: string): string | null {
  const t = normalizeKey(rawName);
  if (!t) return null;
  if (DAGING_RE.test(t)) return 'Daging Durian';
  for (let i = 0; i < CONTAINS_KEYS.length; i += 1) {
    if (t.includes(CONTAINS_KEYS[i].key)) return CONTAINS_KEYS[i].canonical;
  }
  return null;
}

export function detectPackingType(line: string): string | null {
  const t = String(line || '').toLowerCase();
  if (t.includes('styrofoam')) return 'Styrofoam';
  if (t.includes('kardus')) return 'Kardus';
  if (t.includes('koli')) return 'Koli';
  if (/\bfoam\b/.test(t)) return 'Foam';
  return null;
}

const cleanName = (s: string): string =>
  String(s || '')
    .replace(/[\s=:;,.·-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const numOf = (s: string): number => parseFloat(String(s).replace(',', '.'));

const stripNote = (s: string): string => {
  const text = String(s || '');
  const cut = text.search(/\s+(?:via|dikirim|untuk|diktrim)\b/i);
  return cut === -1 ? text : text.slice(0, cut);
};

function tryExtractItem(line: string): RawItem | null {
  const L = String(line).trim();
  if (!L) return null;

  const parts = L.replace(/[×✕]/g, 'x').split(/\s+x\s+/i);
  if (parts.length >= 2) {
    const name = cleanName(parts[0]);
    const qtyMatch = parts[1].trim().match(/^\d+(?:[.,]\d+)?/);
    if (name && qtyMatch) {
      const qty = numOf(qtyMatch[0]);
      if (Number.isFinite(qty) && qty > 0) return { name, qty };
    }
  }

  const qf = L.match(/^(\d+(?:[.,]\d+)?)\s+(.+)$/);
  if (qf) {
    const name = cleanName(stripNote(qf[2]));
    const qty = numOf(qf[1]);
    if (name && Number.isFinite(qty) && qty > 0) return { name, qty };
  }

  const t = L.match(
    /^(.*?)[\s=:]+(\d+(?:[.,]\d+)?)\s*(?:pcs?|pc|kg|kgs|buah|lembar|bdg)?\s*$/i
  );
  if (t && t[1].trim()) {
    const name = cleanName(t[1]);
    const qty = numOf(t[2]);
    if (name && Number.isFinite(qty) && qty > 0) return { name, qty };
  }

  return null;
}

export function parseItemLine(line: string): { qty: number; name: string } {
  const item = tryExtractItem(line);
  if (!item) return { qty: 0, name: '' };
  return { qty: item.qty, name: item.name };
}

export function parseShipping(text: string): { customers: RawCustomer[]; warnings: never[] } {
  const customers: RawCustomer[] = [];
  const lines = String(text || '').split(/\r?\n/);
  let cur: RawCustomer | null = null;
  let sawCustomerHeader = false;

  const ensureCustomer = (): boolean => {
    if (cur) return true;
    if (!sawCustomerHeader) {
      cur = {
        name: 'Customer 1',
        items: [],
        packingType: null,
        notes: [],
        requestedPacking: null,
      };
      customers.push(cur);
      return true;
    }
    return false;
  };

  const newCustomer = (name: string): RawCustomer => ({
    name,
    items: [],
    packingType: null,
    notes: [],
    requestedPacking: null,
  });

  const pushNote = (text: string): void => {
    if (cur && cur.notes.length < 4 && text) cur.notes.push(text);
  };

  const REQUEST_RE =
    /^(\d+(?:[.,]\d+)?)\s*(?:x\s*)?(?:butuh\s+)?(styrofoam|foam|kardus|koli)\b(.*)$/i;

  lines.forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) return;

    const isBullet = /^[•*-]\s*/.test(line);
    const content = isBullet ? line.replace(/^[•*-]\s*/, '') : line;

    if (/^customer\b/i.test(content)) {
      sawCustomerHeader = true;
      cur = newCustomer(content.replace(/^customer\b/i, 'Customer').trim());
      customers.push(cur);
      return;
    }

    if (isBullet) {
      cur = newCustomer(content);
      customers.push(cur);
      return;
    }

    const req = content.match(REQUEST_RE);
    if (req) {
      const rtype = detectPackingType(req[2]);
      const remainder = String(req[3] || '').trim();
      if (!cur) ensureCustomer();
      if (cur) {
        cur.packingType = rtype;
        if (!cur.requestedPacking) {
          cur.requestedPacking = { type: rtype as string, count: numOf(req[1]) };
        }
        if (remainder) pushNote(remainder);
      }
      return;
    }

    const packingType = detectPackingType(content);
    if (packingType) {
      if (!cur) ensureCustomer();
      if (cur) cur.packingType = packingType;
    }

    const item = tryExtractItem(content);
    const mapped = item ? mapItem(item.name) : null;
    if (mapped) {
      if (!ensureCustomer()) return;
      cur!.items.push({ name: mapped, qty: item!.qty });
      return;
    }

    if (cur) pushNote(content);
  });

  return { customers, warnings: [] };
}

export function statusFor(pct: number): {
  key: string;
  label: string;
  emoji: string;
  color: string;
} {
  if (!Number.isFinite(pct))
    return { key: 'safe', label: 'Sangat Aman', emoji: '🟢', color: '#16802A' };
  if (pct <= 100) return { key: 'safe', label: 'Sangat Aman', emoji: '🟢', color: '#16802A' };
  if (pct <= 106) return { key: 'ok', label: 'Masih Aman', emoji: '🟡', color: '#B45309' };
  return { key: 'over', label: 'Overspace / Tidak Aman', emoji: '🔴', color: '#C0392B' };
}

export function aggregateItems(items: PackingItem[]): {
  totals: Record<string, number>;
  order: string[];
} {
  const totals: Record<string, number> = {};
  const order: string[] = [];
  (Array.isArray(items) ? items : []).forEach((it) => {
    if (!it) return;
    if (totals[it.name] === undefined) {
      totals[it.name] = 0;
      order.push(it.name);
    }
    totals[it.name] += Number(it.qty) || 0;
  });
  return { totals, order };
}

export function computeCustomer(input: CustomerInput): CustomerResult {
  const { name, items, packingType, requestedPacking, notes } = input;
  const reqType =
    typeof packingType === 'string' && packingType.trim() ? packingType.trim() : null;
  const unit = reqType || 'Foam';
  const capType = PACKING_TYPES[unit] || PACKING_TYPES.Foam;
  const packingDefault = !reqType;

  const requested =
    requestedPacking && typeof requestedPacking === 'object' ? requestedPacking : null;
  const requestedCount =
    requested && Number.isFinite(requested.count) && requested.count > 0
      ? Math.ceil(requested.count)
      : 0;

  const agg = aggregateItems(items);

  const itemGroup: Record<string, string> = {};
  PACKING_GROUPS.forEach((g) => {
    g.items.forEach((it) => {
      itemGroup[it] = g.id;
    });
  });

  const groupMap: Record<string, { id: string; qty: number; present: PackingItem[] }> = {};
  agg.order.forEach((itName) => {
    const gid = itemGroup[itName];
    if (!gid) return;
    if (!groupMap[gid]) groupMap[gid] = { id: gid, qty: 0, present: [] };
    groupMap[gid].qty += agg.totals[itName];
    groupMap[gid].present.push({ name: itName, qty: agg.totals[itName] });
  });

  const groupsWithQty = Object.values(groupMap).filter((g) => g.qty > 0);
  const custHasMixed = groupsWithQty.length >= 2;

  const groups: PackingGroupResult[] = groupsWithQty
    .map((g) => {
      const cap = PACKING_CAPACITY[g.id] || { max: 1, buffer: 1 };
      const groupMixed = g.present.length >= 2;
      const useMax = !(groupMixed || custHasMixed);
      const pct = g.qty / (useMax ? cap.max : cap.buffer);
      return {
        id: g.id,
        label: (PACKING_GROUPS.find((x) => x.id === g.id) || {}).label || g.id,
        qty: g.qty,
        present: g.present,
        max: cap.max,
        buffer: cap.buffer,
        useMax,
        pct,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));

  const totalPct = groups.reduce((s, g) => s + g.pct, 0);
  const neededUnits = totalPct > 0 ? Math.max(1, Math.ceil(totalPct / (capType.ratio * 1.05))) : 0;
  const totalPacks = Math.max(neededUnits, requestedCount);

  return {
    name,
    items: agg.order.map((it) => ({ name: it, qty: agg.totals[it] })),
    groups,
    totalPct,
    neededUnits,
    totalPacks,
    requestedCount,
    requestType: requestedCount > 0 && requested ? requested.type : null,
    packingType: capType.unit,
    packingDefault,
    notes: Array.isArray(notes) ? notes : [],
    requestedPacking: requested,
    empty: items.length === 0,
  };
}

export function summarizeResults(customers: CustomerResult[]): {
  totalCustomers: number;
  perType: Record<string, number>;
} {
  const res = { totalCustomers: customers.length, perType: {} as Record<string, number> };
  customers.forEach((c) => {
    if (c.neededUnits <= 0) return;
    if (!res.perType[c.packingType]) res.perType[c.packingType] = 0;
    res.perType[c.packingType] += c.neededUnits;
  });
  return res;
}

export const fmtPercent = (x: number): string => {
  const v = Number(x);
  if (!Number.isFinite(v)) return '0';
  const r = Math.round(v * 100) / 100;
  return Number.isInteger(r) ? String(r) : String(r);
};

export const fmtQty = (x: number): string => {
  const v = Number(x);
  if (!Number.isFinite(v)) return '0';
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
};
