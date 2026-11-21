import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';

@Injectable()
export class SenhaService {
  private ficticio?: Promise<string>;

  /** Hash de uma senha aleatória, usado para equalizar o tempo de resposta quando o e-mail não existe. */
  hashFicticio(): Promise<string> {
    this.ficticio ??= this.hash(randomBytes(16).toString('hex'));
    return this.ficticio;
  }

  hash(senha: string): Promise<string> {
    return argon2.hash(senha, { type: argon2.argon2id });
  }

  async verificar(hash: string, senha: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, senha);
    } catch {
      return false;
    }
  }
}
