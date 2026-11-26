import type { Request, Response } from 'express';
import { HEADER_IP_PROXY, HEADER_SEGREDO_PROXY, ipDoProxy } from '../src/common/ip-do-proxy';

const SEGREDO = 'a'.repeat(40);

function requisicao(headers: Record<string, string>): Request {
  const req = { headers: { ...headers } } as unknown as Request;
  Object.defineProperty(req, 'ip', { value: '10.0.0.1', configurable: true });
  return req;
}

function rodar(segredo: string | undefined, req: Request) {
  const next = jest.fn();
  ipDoProxy(segredo)(req, {} as Response, next);
  expect(next).toHaveBeenCalledTimes(1);
  return req;
}

describe('ipDoProxy', () => {
  it('usa o IP do proxy quando o segredo confere', () => {
    const req = rodar(SEGREDO, requisicao({ [HEADER_SEGREDO_PROXY]: SEGREDO, [HEADER_IP_PROXY]: '200.1.2.3' }));
    expect(req.ip).toBe('200.1.2.3');
    expect(req.headers[HEADER_SEGREDO_PROXY]).toBeUndefined();
    expect(req.headers[HEADER_IP_PROXY]).toBeUndefined();
  });

  it('ignora segredo errado', () => {
    const req = rodar(SEGREDO, requisicao({ [HEADER_SEGREDO_PROXY]: 'b'.repeat(40), [HEADER_IP_PROXY]: '200.1.2.3' }));
    expect(req.ip).toBe('10.0.0.1');
  });

  it('ignora o cabeçalho quando não há segredo configurado', () => {
    const req = rodar(undefined, requisicao({ [HEADER_SEGREDO_PROXY]: '', [HEADER_IP_PROXY]: '200.1.2.3' }));
    expect(req.ip).toBe('10.0.0.1');
    expect(req.headers[HEADER_IP_PROXY]).toBeUndefined();
  });

  it('ignora IP inválido', () => {
    const req = rodar(SEGREDO, requisicao({ [HEADER_SEGREDO_PROXY]: SEGREDO, [HEADER_IP_PROXY]: 'nao-e-ip' }));
    expect(req.ip).toBe('10.0.0.1');
  });
});
