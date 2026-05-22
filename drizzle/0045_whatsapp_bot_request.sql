-- whatsapp bot self-service request (#53)
--
-- El barbero rellena un form en /dashboard/marketing/whatsapp con el número
-- que quiere usar para el bot, el nombre legal del negocio y opcionalmente
-- su Facebook Business ID. Guardamos la solicitud cruda en jsonb +
-- timestamp. Cuando el admin completa el alta en Meta Business Manager y
-- escribe `whatsappPhoneNumberId`, la solicitud queda "atendida" y el
-- banner pasa de "En cola" a "Bot activo".
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "whatsapp_bot_request" jsonb;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "whatsapp_bot_requested_at" timestamp with time zone;
