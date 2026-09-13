export const GUDANG = ['Puri', 'CS TCL', 'CS SBF'] as const;
export const KRITERIA = ['Good', 'Bad'] as const;

export const GUDANG_LABEL: Record<string, string> = {
  Puri: 'Puri',
  'CS TCL': 'CS TCL Balongbendo',
  'CS SBF': 'CS SBF Buduran',
};

export function labelGudang(g: string): string {
  return GUDANG_LABEL[g] || g;
}
