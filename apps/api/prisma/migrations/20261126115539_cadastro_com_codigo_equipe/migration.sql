-- CreateTable
CREATE TABLE "config_sistema" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "codigoCadastroHash" TEXT,
    "codigoCadastroAlteradoEm" TIMESTAMP(3),
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "config_sistema_pkey" PRIMARY KEY ("id")
);
