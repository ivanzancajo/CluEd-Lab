ALTER TABLE "partida"
  ADD COLUMN IF NOT EXISTS "id_equipo_turno_actual" UUID,
  ADD COLUMN IF NOT EXISTS "inicio_turno_actual" TIMESTAMP(6),
  ADD COLUMN IF NOT EXISTS "dado_activo_1" INTEGER,
  ADD COLUMN IF NOT EXISTS "dado_activo_2" INTEGER;

CREATE INDEX IF NOT EXISTS "partida_id_equipo_turno_actual_idx"
  ON "partida" ("id_equipo_turno_actual");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'partida_id_equipo_turno_actual_fkey'
  ) THEN
    ALTER TABLE "partida"
      ADD CONSTRAINT "partida_id_equipo_turno_actual_fkey"
      FOREIGN KEY ("id_equipo_turno_actual")
      REFERENCES "equipo" ("id_equipo")
      ON DELETE SET NULL
      ON UPDATE NO ACTION;
  END IF;
END $$;