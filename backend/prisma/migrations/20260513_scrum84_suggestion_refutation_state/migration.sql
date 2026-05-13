ALTER TABLE "partida"
  ADD COLUMN IF NOT EXISTS "id_evento_sugerencia_activa" UUID;

CREATE INDEX IF NOT EXISTS "partida_id_evento_sugerencia_activa_idx"
  ON "partida" ("id_evento_sugerencia_activa");

CREATE INDEX IF NOT EXISTS "evento_partida_tipo_timestamp_idx"
  ON "evento" ("id_partida", "tipo_evento", "timestamp");

CREATE INDEX IF NOT EXISTS "evento_receptor_timestamp_idx"
  ON "evento" ("id_receptor", "timestamp");