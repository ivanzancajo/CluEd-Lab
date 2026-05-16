CREATE TABLE "carta_publica" (
  "id_partida" UUID NOT NULL,
  "id_elem"    UUID NOT NULL,
  "revelada_en" TIMESTAMP(6) DEFAULT NOW(),

  CONSTRAINT "carta_publica_pkey" PRIMARY KEY ("id_partida", "id_elem")
);

CREATE INDEX "carta_publica_id_partida_idx" ON "carta_publica" ("id_partida");

ALTER TABLE "carta_publica"
  ADD CONSTRAINT "carta_publica_id_partida_fkey"
  FOREIGN KEY ("id_partida") REFERENCES "partida"("id_partida")
  ON DELETE CASCADE
  ON UPDATE NO ACTION;

ALTER TABLE "carta_publica"
  ADD CONSTRAINT "carta_publica_id_elem_fkey"
  FOREIGN KEY ("id_elem") REFERENCES "elemento"("id_elem")
  ON DELETE NO ACTION
  ON UPDATE NO ACTION;
