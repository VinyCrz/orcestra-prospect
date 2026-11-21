import { distribuirRodizio } from '../src/carteira/rodizio';

const contar = (m: Map<string, string>, ejs: { id: string; uf: string | null }[]) => {
  const out: Record<string, number> = {};
  for (const e of ejs) {
    const k = `${m.get(e.id)}|${e.uf}`;
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
};

describe('rodízio balanceado por UF', () => {
  it('distribui cada UF de forma equilibrada (diferença <= 1)', () => {
    const ejs = [
      ...Array.from({ length: 7 }, (_, i) => ({ id: `rs${i}`, uf: 'RS' })),
      ...Array.from({ length: 5 }, (_, i) => ({ id: `sc${i}`, uf: 'SC' })),
      ...Array.from({ length: 3 }, (_, i) => ({ id: `sp${i}`, uf: 'SP' })),
    ];
    const r = distribuirRodizio(ejs, ['a', 'b', 'c']);
    expect(r.size).toBe(ejs.length);
    const c = contar(r, ejs);
    for (const uf of ['RS', 'SC', 'SP']) {
      const n = ['a', 'b', 'c'].map((s) => c[`${s}|${uf}`] ?? 0);
      expect(Math.max(...n) - Math.min(...n)).toBeLessThanOrEqual(1);
    }
    // total geral também equilibrado (15 / 3)
    const tot = ['a', 'b', 'c'].map((s) => ejs.filter((e) => r.get(e.id) === s).length);
    expect(Math.max(...tot) - Math.min(...tot)).toBeLessThanOrEqual(1);
  });

  it('começa por quem tem menos EJs na UF (carga inicial)', () => {
    const ejs = [
      { id: '1', uf: 'RS' },
      { id: '2', uf: 'RS' },
    ];
    const carga = new Map([
      ['a|RS', 5],
      ['b|RS', 0],
      ['c|RS', 1],
    ]);
    const r = distribuirRodizio(ejs, ['a', 'b', 'c'], carga);
    expect([r.get('1'), r.get('2')]).toEqual(['b', 'b']); // b (0) e depois empate b=c=1 -> menor total
    expect([...r.values()]).not.toContain('a');
  });

  it('é determinístico e trata UF nula', () => {
    const ejs = [
      { id: 'x', uf: null },
      { id: 'y', uf: null },
    ];
    const r1 = distribuirRodizio(ejs, ['a', 'b']);
    const r2 = distribuirRodizio([...ejs].reverse(), ['a', 'b']);
    expect([...r1.entries()]).toEqual([...r2.entries()]);
    expect(new Set(r1.values()).size).toBe(2);
  });
});
