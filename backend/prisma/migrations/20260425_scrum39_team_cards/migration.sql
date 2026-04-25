CREATE TABLE "carta_equipo" (
    "id_equipo" UUID NOT NULL,
    "id_elem" UUID NOT NULL,
    "asignada_en" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "carta_equipo_pkey" PRIMARY KEY ("id_equipo","id_elem")
);

CREATE INDEX "carta_equipo_id_elem_idx" ON "carta_equipo"("id_elem");

ALTER TABLE "carta_equipo" ADD CONSTRAINT "carta_equipo_id_equipo_fkey" FOREIGN KEY ("id_equipo") REFERENCES "equipo"("id_equipo") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "carta_equipo" ADD CONSTRAINT "carta_equipo_id_elem_fkey" FOREIGN KEY ("id_elem") REFERENCES "elemento"("id_elem") ON DELETE RESTRICT ON UPDATE CASCADE;