export interface EjParaRodizio {
  id: string;
  uf: string | null;
}

/**
 * Rodízio balanceado por UF. Para cada UF, cada EJ vai para o SDR com MENOS EJs naquela UF
 * (considerando a carga inicial já existente); empate: menor total geral, depois a ordem de `sdrIds`.
 * @param carga mapa `${sdrId}|${uf}` -> EJs que o SDR já tem na UF ("" para UF nula)
 * @returns mapa ejId -> sdrId
 */
export function distribuirRodizio(
  ejs: EjParaRodizio[],
  sdrIds: string[],
  carga: Map<string, number> = new Map(),
): Map<string, string> {
  const porUf = new Map<string, EjParaRodizio[]>();
  for (const e of [...ejs].sort((a, b) => a.id.localeCompare(b.id))) {
    const k = e.uf ?? '';
    (porUf.get(k) ?? porUf.set(k, []).get(k)!).push(e);
  }
  const total = new Map<string, number>(sdrIds.map((s) => [s, 0]));
  for (const [k, n] of carga) {
    const sdr = k.split('|')[0];
    if (total.has(sdr)) total.set(sdr, (total.get(sdr) ?? 0) + n);
  }
  const atual = new Map(carga);
  const resultado = new Map<string, string>();
  // UFs maiores primeiro: reduz desbalanceamento no total.
  const ufs = [...porUf.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  for (const [uf, lista] of ufs) {
    for (const ej of lista) {
      let melhor = sdrIds[0];
      for (const s of sdrIds) {
        const n = atual.get(`${s}|${uf}`) ?? 0;
        const nm = atual.get(`${melhor}|${uf}`) ?? 0;
        if (n < nm || (n === nm && (total.get(s) ?? 0) < (total.get(melhor) ?? 0))) melhor = s;
      }
      resultado.set(ej.id, melhor);
      atual.set(`${melhor}|${uf}`, (atual.get(`${melhor}|${uf}`) ?? 0) + 1);
      total.set(melhor, (total.get(melhor) ?? 0) + 1);
    }
  }
  return resultado;
}
