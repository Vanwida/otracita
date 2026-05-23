-- 0054 — Limpia colorToken legacy de la paleta pastel (21 tokens) de los
-- servicios guardados en `clients.chatbot_services` (jsonb sin schema).
--
-- Contexto: la paleta nueva (#79) son 12 tokens SATURADOS (red/orange/.../
-- slate) más hex custom `#RRGGBB`. Los servicios con tokens viejos
-- (terracota/blush/coral/peach/oat/...) que ya no existen pintarían en la
-- agenda como "color desconocido" — el cliente cae al DEFAULT visual.
-- Esta migración elimina el campo `colorToken` (no lo nullifica: el
-- consumidor distingue "ausente" como señal de "usa el default"; un null
-- explícito en jsonb confunde al type guard).
--
-- Sólo toca entradas con un colorToken que NO sea:
--   · uno de los 12 tokens nuevos
--   · un hex `#RRGGBB` (6 chars hex tras #)
-- El resto se queda intacto.
--
-- Patrón: jsonb_agg sobre el array tras un jsonb operator. Es idempotente
-- — re-ejecutarla no causa cambios adicionales.

UPDATE clients
SET chatbot_services = (
  SELECT jsonb_agg(
    CASE
      WHEN (svc ? 'colorToken')
        AND NOT (
          svc->>'colorToken' IN (
            'red','orange','amber','olive','green','emerald',
            'cyan','blue','indigo','purple','pink','slate'
          )
          OR svc->>'colorToken' ~ '^#[0-9a-fA-F]{6}$'
        )
      THEN svc - 'colorToken'
      ELSE svc
    END
  )
  FROM jsonb_array_elements(chatbot_services) AS svc
)
WHERE jsonb_typeof(chatbot_services) = 'array'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(chatbot_services) AS svc
    WHERE (svc ? 'colorToken')
      AND NOT (
        svc->>'colorToken' IN (
          'red','orange','amber','olive','green','emerald',
          'cyan','blue','indigo','purple','pink','slate'
        )
        OR svc->>'colorToken' ~ '^#[0-9a-fA-F]{6}$'
      )
  );
