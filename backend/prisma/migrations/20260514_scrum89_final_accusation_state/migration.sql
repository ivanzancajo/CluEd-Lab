CREATE TYPE "razon_eliminacion_equipo" AS ENUM ('ACUSACION_FALSA');

ALTER TABLE "partida"
  ADD COLUMN "finalizada_en" TIMESTAMP(6),
  ADD COLUMN "id_equipo_ganador" UUID;

ALTER TABLE "equipo"
  ADD COLUMN "eliminado_en" TIMESTAMP(6),
  ADD COLUMN "razon_eliminacion" "razon_eliminacion_equipo";

CREATE INDEX "partida_id_equipo_ganador_idx"
  ON "partida" ("id_equipo_ganador");

ALTER TABLE "partida"
  ADD CONSTRAINT "partida_id_equipo_ganador_fkey"
  FOREIGN KEY ("id_equipo_ganador") REFERENCES "equipo"("id_equipo")
  ON DELETE SET NULL
  ON UPDATE NO ACTION;