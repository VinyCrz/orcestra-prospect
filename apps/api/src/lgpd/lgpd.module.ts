import { Global, Module } from '@nestjs/common';
import { LgpdController } from './lgpd.controller';
import { LgpdService } from './lgpd.service';
import { SupressaoService } from './supressao.service';

@Global()
@Module({
  controllers: [LgpdController],
  providers: [SupressaoService, LgpdService],
  exports: [SupressaoService],
})
export class LgpdModule {}
