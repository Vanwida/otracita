-- WS-A · A2: ¿el cliente pidió a este barbero explícitamente?
--
-- bookings.barber_requested = true SOLO cuando createBooking recibió un
-- barberId explícito (el cliente PIDIÓ a esa persona) vs auto-asignado
-- por pickBarberForCustomer. Pinta el ♥ "Solicitado por el cliente" en
-- la agenda y el panel detalle.
--
-- Aditiva, default false NOT NULL → todos los bookings existentes quedan
-- en false (no se solicitó), los callers que no pasan barberId no se ven
-- afectados. Guard IF NOT EXISTS por convención #5 del repo (el snapshot
-- drizzle está desincronizado con la DB real en este proyecto).

ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "barber_requested" boolean DEFAULT false NOT NULL;
