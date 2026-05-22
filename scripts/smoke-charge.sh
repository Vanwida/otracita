#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# smoke-charge.sh — smoke test del endpoint POST /api/bookings/[id]/charge
# (épica Reni 2026-05-22, tasks #26+#27).
#
# Ejecuta 5 casos contra el dev server local + valida side-effects en DB.
# Sin dependencias externas: solo curl + psql + grep.
#
# PRERREQUISITOS (el script NO los crea — el operador prepara fixtures):
#   · Dev server arrancado:          npm run dev          (puerto 3000)
#   · Variables de entorno (export antes de correr el script):
#       TENANT_BASE_URL          URL base del tenant (default http://localhost:3000)
#       AUTH_COOKIE              Cookie de sesión dashboard válida del tenant
#                                (mirar DevTools > Application > Cookies tras login)
#       TEST_BOOKING_ID          UUID de un booking status='confirmed' con price=25
#                                en el tenant logueado por AUTH_COOKIE
#       TEST_BARBER_ID           UUID de un barbero activo del mismo tenant
#       DATABASE_URL             URL Postgres (se lee de .env.local si no se pasa)
#
# El script reusa el mismo TEST_BOOKING_ID para los 5 casos. Caso 1 lo deja
# completed → casos 2-5 esperan 400 (booking ya cobrado) si no se resetea.
# Por ello CADA caso resetea el booking a 'confirmed' antes de llamar.
#
# Uso:
#   AUTH_COOKIE='better-auth.session_token=xxx' \
#   TEST_BOOKING_ID='uuid' \
#   TEST_BARBER_ID='uuid' \
#   bash scripts/smoke-charge.sh
#
# Exit code: 0 si todos los casos pasan, 1 si alguno falla. Imprime ✓ o ✗
# por caso para auditoría rápida.
# -----------------------------------------------------------------------------

set -uo pipefail

# Carga DATABASE_URL desde .env.local si no está exportada.
if [[ -z "${DATABASE_URL:-}" ]] && [[ -f .env.local ]]; then
  DATABASE_URL=$(grep -E '^DATABASE_URL=' .env.local | head -1 | cut -d= -f2- | sed 's/^"//;s/"$//')
  export DATABASE_URL
fi

TENANT_BASE_URL="${TENANT_BASE_URL:-http://localhost:3000}"
AUTH_COOKIE="${AUTH_COOKIE:-}"
TEST_BOOKING_ID="${TEST_BOOKING_ID:-}"
TEST_BARBER_ID="${TEST_BARBER_ID:-}"

# -----------------------------------------------------------------------------
# Pre-flight: validar que las variables están seteadas y la API responde.
# -----------------------------------------------------------------------------
fail_preflight() {
  echo "✗ preflight: $1" >&2
  echo "" >&2
  echo "Setea las variables de entorno antes de correr este script:" >&2
  echo "  TENANT_BASE_URL=$TENANT_BASE_URL" >&2
  echo "  AUTH_COOKIE='better-auth.session_token=...'" >&2
  echo "  TEST_BOOKING_ID='<uuid de booking confirmed price=25>'" >&2
  echo "  TEST_BARBER_ID='<uuid de barbero activo>'" >&2
  echo "  DATABASE_URL='postgres://...' (o tener .env.local)" >&2
  exit 1
}

[[ -z "$AUTH_COOKIE" ]] && fail_preflight "AUTH_COOKIE no seteado"
[[ -z "$TEST_BOOKING_ID" ]] && fail_preflight "TEST_BOOKING_ID no seteado"
[[ -z "$TEST_BARBER_ID" ]] && fail_preflight "TEST_BARBER_ID no seteado"
[[ -z "${DATABASE_URL:-}" ]] && fail_preflight "DATABASE_URL no seteado y .env.local no encontrado"

# Verifica que el booking existe y tiene price=25.
BOOKING_PRICE=$(psql "$DATABASE_URL" -tAc "SELECT price FROM bookings WHERE id='$TEST_BOOKING_ID'" 2>/dev/null || true)
if [[ -z "$BOOKING_PRICE" ]]; then
  fail_preflight "TEST_BOOKING_ID '$TEST_BOOKING_ID' no existe en DB"
fi
if [[ "$BOOKING_PRICE" != "25" ]]; then
  fail_preflight "TEST_BOOKING_ID debería tener price=25 (tiene $BOOKING_PRICE) para que los importes 2500 céntimos casen"
fi

# Helper: resetea el booking a 'confirmed', borra payments + tips del booking.
reset_booking() {
  psql "$DATABASE_URL" -q <<SQL
DELETE FROM payments WHERE booking_id='$TEST_BOOKING_ID';
DELETE FROM tips WHERE booking_id='$TEST_BOOKING_ID';
UPDATE bookings
   SET status='confirmed',
       payment_method=NULL,
       payment_received_at=NULL
 WHERE id='$TEST_BOOKING_ID';
SQL
}

# Helper: POST al charge endpoint con body JSON. Devuelve "STATUS\nBODY".
charge_request() {
  local body="$1"
  curl -s -o /tmp/smoke-charge-body.json -w "%{http_code}" \
    -X POST "$TENANT_BASE_URL/api/bookings/$TEST_BOOKING_ID/charge" \
    -H "Content-Type: application/json" \
    -H "Cookie: $AUTH_COOKIE" \
    -d "$body"
}

# Helper: ejecuta una assertion y guarda el resultado.
PASS=0
FAIL=0
assert() {
  local desc="$1"
  local cond="$2"
  if [[ "$cond" == "true" ]]; then
    echo "  ✓ $desc"
  else
    echo "  ✗ $desc"
    FAIL=$((FAIL + 1))
    return 1
  fi
  PASS=$((PASS + 1))
}

# -----------------------------------------------------------------------------
# Caso 1: cobro 100% cash 25€, sin tip.
# -----------------------------------------------------------------------------
echo "Caso 1 — cobro 100% cash 25€ (sin tip)"
reset_booking
HTTP=$(charge_request '{
  "payments": [{"method":"cash","amountCents":2500}],
  "idempotencyKey": "smoke-1-'"$(date +%s)"'"
}')
BODY=$(cat /tmp/smoke-charge-body.json)

[[ "$HTTP" == "200" ]] && assert "HTTP 200" true || assert "HTTP 200 (got $HTTP, body: $BODY)" false
echo "$BODY" | grep -q '"tipRecorded":false' && assert "tipRecorded=false" true || assert "tipRecorded=false" false
echo "$BODY" | grep -qv 'requiresOnlineCheckout' && assert "no requiresOnlineCheckout" true || assert "no requiresOnlineCheckout" false

STATUS=$(psql "$DATABASE_URL" -tAc "SELECT status FROM bookings WHERE id='$TEST_BOOKING_ID'")
PAYMENT_METHOD=$(psql "$DATABASE_URL" -tAc "SELECT payment_method FROM bookings WHERE id='$TEST_BOOKING_ID'")
PAYMENTS_COUNT=$(psql "$DATABASE_URL" -tAc "SELECT COUNT(*) FROM payments WHERE booking_id='$TEST_BOOKING_ID'")

[[ "$STATUS" == "completed" ]] && assert "bookings.status=completed" true || assert "bookings.status=completed (got $STATUS)" false
[[ "$PAYMENT_METHOD" == "cash" ]] && assert "bookings.payment_method=cash" true || assert "bookings.payment_method=cash (got $PAYMENT_METHOD)" false
[[ "$PAYMENTS_COUNT" == "1" ]] && assert "1 fila en payments" true || assert "1 fila en payments (got $PAYMENTS_COUNT)" false

# -----------------------------------------------------------------------------
# Caso 2: split cash 10€ + card_physical 15€ + tip 2€ cash al barbero.
# -----------------------------------------------------------------------------
echo "Caso 2 — split cash 10€ + card_physical 15€ + tip 2€ cash"
reset_booking
HTTP=$(charge_request '{
  "payments": [
    {"method":"cash","amountCents":1000},
    {"method":"card_physical","amountCents":1500}
  ],
  "tip": {"amountCents":200,"method":"cash","barberId":"'"$TEST_BARBER_ID"'"},
  "idempotencyKey": "smoke-2-'"$(date +%s)"'"
}')
BODY=$(cat /tmp/smoke-charge-body.json)

[[ "$HTTP" == "200" ]] && assert "HTTP 200" true || assert "HTTP 200 (got $HTTP, body: $BODY)" false
echo "$BODY" | grep -q '"tipRecorded":true' && assert "tipRecorded=true" true || assert "tipRecorded=true" false

PAYMENTS_COUNT=$(psql "$DATABASE_URL" -tAc "SELECT COUNT(*) FROM payments WHERE booking_id='$TEST_BOOKING_ID'")
PAYMENT_METHOD=$(psql "$DATABASE_URL" -tAc "SELECT payment_method FROM bookings WHERE id='$TEST_BOOKING_ID'")
TIPS_COUNT=$(psql "$DATABASE_URL" -tAc "SELECT COUNT(*) FROM tips WHERE booking_id='$TEST_BOOKING_ID'")

[[ "$PAYMENTS_COUNT" == "2" ]] && assert "2 filas en payments" true || assert "2 filas en payments (got $PAYMENTS_COUNT)" false
[[ "$PAYMENT_METHOD" == "mixed" ]] && assert "bookings.payment_method=mixed" true || assert "bookings.payment_method=mixed (got $PAYMENT_METHOD)" false
[[ "$TIPS_COUNT" == "1" ]] && assert "1 fila en tips" true || assert "1 fila en tips (got $TIPS_COUNT)" false

# -----------------------------------------------------------------------------
# Caso 3: sum mismatch — pagas 20€ sobre un booking de 25€.
# -----------------------------------------------------------------------------
echo "Caso 3 — sum mismatch (20€ sobre 25€)"
reset_booking
HTTP=$(charge_request '{
  "payments": [{"method":"cash","amountCents":2000}],
  "idempotencyKey": "smoke-3-'"$(date +%s)"'"
}')
BODY=$(cat /tmp/smoke-charge-body.json)

[[ "$HTTP" == "400" ]] && assert "HTTP 400" true || assert "HTTP 400 (got $HTTP, body: $BODY)" false
echo "$BODY" | grep -q '"code":"sum_mismatch"' && assert "code=sum_mismatch" true || assert "code=sum_mismatch (body: $BODY)" false

# -----------------------------------------------------------------------------
# Caso 4: método inválido (no en whitelist).
# -----------------------------------------------------------------------------
echo "Caso 4 — método inválido (paypal)"
reset_booking
HTTP=$(charge_request '{
  "payments": [{"method":"paypal","amountCents":2500}],
  "idempotencyKey": "smoke-4-'"$(date +%s)"'"
}')
BODY=$(cat /tmp/smoke-charge-body.json)

[[ "$HTTP" == "400" ]] && assert "HTTP 400" true || assert "HTTP 400 (got $HTTP, body: $BODY)" false
echo "$BODY" | grep -q '"code":"invalid_method"' && assert "code=invalid_method" true || assert "code=invalid_method (body: $BODY)" false

# -----------------------------------------------------------------------------
# Caso 5: tip con barberId que no pertenece al tenant.
# -----------------------------------------------------------------------------
echo "Caso 5 — tip con barberId inválido (uuid all-zero)"
reset_booking
HTTP=$(charge_request '{
  "payments": [{"method":"cash","amountCents":2500}],
  "tip": {"amountCents":200,"method":"cash","barberId":"00000000-0000-0000-0000-000000000000"},
  "idempotencyKey": "smoke-5-'"$(date +%s)"'"
}')
BODY=$(cat /tmp/smoke-charge-body.json)

[[ "$HTTP" == "400" ]] && assert "HTTP 400" true || assert "HTTP 400 (got $HTTP, body: $BODY)" false
echo "$BODY" | grep -q '"code":"tip_without_barber"' && assert "code=tip_without_barber" true || assert "code=tip_without_barber (body: $BODY)" false

# -----------------------------------------------------------------------------
# Limpieza: dejar el booking de vuelta a 'confirmed' para futuras pasadas.
# -----------------------------------------------------------------------------
reset_booking

# -----------------------------------------------------------------------------
# Resumen.
# -----------------------------------------------------------------------------
echo ""
echo "─────────────────────────────────────────────────"
echo "  Resumen: $PASS pasaron, $FAIL fallaron"
echo "─────────────────────────────────────────────────"

if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
exit 0
