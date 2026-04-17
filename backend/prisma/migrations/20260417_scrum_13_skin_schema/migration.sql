-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "color_equipo" AS ENUM ('ROJO', 'AZUL', 'VERDE', 'AMARILLO', 'MORADO', 'BLANCO');

-- CreateEnum
CREATE TYPE "estado_deduccion" AS ENUM ('NEUTRO', 'DUDA', 'DESCARTADO');

-- CreateEnum
CREATE TYPE "tipo_evento" AS ENUM ('MOVIMIENTO', 'SUGERENCIA', 'REFUTACION', 'ACUSACION', 'SISTEMA');

-- CreateEnum
CREATE TYPE "tipo_elemento" AS ENUM ('SUJETO', 'OBJETO', 'ESPACIO');

-- CreateTable
CREATE TABLE "cluedo_skin" (
    "id_skin" UUID NOT NULL,
    "nombre" VARCHAR(120) NOT NULL,
    "titulo_partida" VARCHAR(120) NOT NULL,
    "objetivo" TEXT NOT NULL,
    "duracion_minutos" INTEGER NOT NULL DEFAULT 60,
    "imagen_central_url" TEXT,
    "categoria_sujeto" VARCHAR(80) NOT NULL DEFAULT 'Sujetos',
    "categoria_objeto" VARCHAR(80) NOT NULL DEFAULT 'Objetos',
    "categoria_espacio" VARCHAR(80) NOT NULL DEFAULT 'Espacios',
    "tiene_motivos" BOOLEAN NOT NULL DEFAULT false,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cluedo_skin_pkey" PRIMARY KEY ("id_skin")
);

-- CreateTable
CREATE TABLE "elemento" (
    "id_elem" UUID NOT NULL,
    "tipo" "tipo_elemento" NOT NULL,
    "codigo" VARCHAR(50),
    "nombre_base" VARCHAR(120) NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "elemento_pkey" PRIMARY KEY ("id_elem")
);

-- CreateTable
CREATE TABLE "descripcion_elemento" (
    "id_descripcion" UUID NOT NULL,
    "id_skin" UUID NOT NULL,
    "id_elem" UUID NOT NULL,
    "nombre_visible" VARCHAR(120) NOT NULL,
    "descripcion" TEXT NOT NULL,
    "imagen_url" TEXT,
    "motivo" TEXT,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "descripcion_elemento_pkey" PRIMARY KEY ("id_descripcion")
);

-- CreateTable
CREATE TABLE "solucion" (
    "id_solucion" UUID NOT NULL,
    "id_sujeto" UUID NOT NULL,
    "id_objeto" UUID NOT NULL,
    "id_espacio" UUID NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "solucion_pkey" PRIMARY KEY ("id_solucion")
);

-- CreateTable
CREATE TABLE "partida" (
    "id_partida" UUID NOT NULL,
    "codigo_acceso" VARCHAR(6) NOT NULL,
    "estado" VARCHAR(30) NOT NULL DEFAULT 'LOBBY',
    "id_skin" UUID NOT NULL,
    "id_solucion" UUID NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "partida_pkey" PRIMARY KEY ("id_partida")
);

-- CreateTable
CREATE TABLE "equipo" (
    "id_equipo" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "id_partida" UUID,
    "nombre" VARCHAR(20) NOT NULL,
    "color" "color_equipo" NOT NULL,
    "pos_x" INTEGER DEFAULT 0,
    "pos_y" INTEGER DEFAULT 0,
    "acusacion_falsa" BOOLEAN DEFAULT false,

    CONSTRAINT "equipo_pkey" PRIMARY KEY ("id_equipo")
);

-- CreateTable
CREATE TABLE "tabla_razonamiento" (
    "id_tabla" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "id_equipo" UUID,
    "progreso" DECIMAL(5,2) DEFAULT 0.00,

    CONSTRAINT "tabla_razonamiento_pkey" PRIMARY KEY ("id_tabla")
);

-- CreateTable
CREATE TABLE "anotacion" (
    "id_anotacion" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "id_tabla" UUID,
    "contenido" TEXT,

    CONSTRAINT "anotacion_pkey" PRIMARY KEY ("id_anotacion")
);

-- CreateTable
CREATE TABLE "celda_razonamiento" (
    "id_celda" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "id_tabla" UUID,
    "id_elem" UUID,
    "estado_deduc" "estado_deduccion" DEFAULT 'NEUTRO',

    CONSTRAINT "celda_razonamiento_pkey" PRIMARY KEY ("id_celda")
);

-- CreateTable
CREATE TABLE "evento" (
    "id_evento" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "id_partida" UUID,
    "id_emisor" UUID,
    "id_receptor" UUID,
    "tipo_evento" "tipo_evento" NOT NULL,
    "detalle" JSONB,
    "timestamp" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evento_pkey" PRIMARY KEY ("id_evento")
);

-- CreateIndex
CREATE UNIQUE INDEX "descripcion_elemento_skin_elemento_key" ON "descripcion_elemento"("id_skin", "id_elem");

-- CreateIndex
CREATE INDEX "partida_id_skin_idx" ON "partida"("id_skin");

-- CreateIndex
CREATE INDEX "partida_id_solucion_idx" ON "partida"("id_solucion");

-- CreateIndex
CREATE UNIQUE INDEX "partida_codigo_acceso_key" ON "partida"("codigo_acceso");

-- AddForeignKey
ALTER TABLE "descripcion_elemento" ADD CONSTRAINT "descripcion_elemento_id_skin_fkey" FOREIGN KEY ("id_skin") REFERENCES "cluedo_skin"("id_skin") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "descripcion_elemento" ADD CONSTRAINT "descripcion_elemento_id_elem_fkey" FOREIGN KEY ("id_elem") REFERENCES "elemento"("id_elem") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solucion" ADD CONSTRAINT "solucion_id_sujeto_fkey" FOREIGN KEY ("id_sujeto") REFERENCES "elemento"("id_elem") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solucion" ADD CONSTRAINT "solucion_id_objeto_fkey" FOREIGN KEY ("id_objeto") REFERENCES "elemento"("id_elem") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solucion" ADD CONSTRAINT "solucion_id_espacio_fkey" FOREIGN KEY ("id_espacio") REFERENCES "elemento"("id_elem") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partida" ADD CONSTRAINT "partida_id_skin_fkey" FOREIGN KEY ("id_skin") REFERENCES "cluedo_skin"("id_skin") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partida" ADD CONSTRAINT "partida_id_solucion_fkey" FOREIGN KEY ("id_solucion") REFERENCES "solucion"("id_solucion") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipo" ADD CONSTRAINT "equipo_id_partida_fkey" FOREIGN KEY ("id_partida") REFERENCES "partida"("id_partida") ON DELETE CASCADE;

-- AddForeignKey
ALTER TABLE "tabla_razonamiento" ADD CONSTRAINT "tabla_razonamiento_id_equipo_fkey" FOREIGN KEY ("id_equipo") REFERENCES "equipo"("id_equipo") ON DELETE CASCADE;

-- AddForeignKey
ALTER TABLE "anotacion" ADD CONSTRAINT "anotacion_id_tabla_fkey" FOREIGN KEY ("id_tabla") REFERENCES "tabla_razonamiento"("id_tabla") ON DELETE CASCADE;

-- AddForeignKey
ALTER TABLE "celda_razonamiento" ADD CONSTRAINT "celda_razonamiento_id_tabla_fkey" FOREIGN KEY ("id_tabla") REFERENCES "tabla_razonamiento"("id_tabla") ON DELETE CASCADE;

-- AddForeignKey
ALTER TABLE "celda_razonamiento" ADD CONSTRAINT "celda_razonamiento_id_elem_fkey" FOREIGN KEY ("id_elem") REFERENCES "elemento"("id_elem");

-- AddForeignKey
ALTER TABLE "evento" ADD CONSTRAINT "evento_id_partida_fkey" FOREIGN KEY ("id_partida") REFERENCES "partida"("id_partida") ON DELETE CASCADE;

-- AddForeignKey
ALTER TABLE "evento" ADD CONSTRAINT "evento_id_emisor_fkey" FOREIGN KEY ("id_emisor") REFERENCES "equipo"("id_equipo");

-- AddForeignKey
ALTER TABLE "evento" ADD CONSTRAINT "evento_id_receptor_fkey" FOREIGN KEY ("id_receptor") REFERENCES "equipo"("id_equipo");

