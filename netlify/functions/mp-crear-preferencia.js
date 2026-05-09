// ─────────────────────────────────────────────────────────────────────────────
//  SyA Store — Crear preferencia MercadoPago
//  Netlify Function · Node 18+
//  Env variable requerida: MP_ACCESS_TOKEN
// ─────────────────────────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin' : '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type'                : 'application/json'
};

exports.handler = async (event) => {

  // ── Preflight CORS ──────────────────────────────────────────────────────────
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // ── Token ───────────────────────────────────────────────────────────────────
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) {
    console.error('MP_ACCESS_TOKEN no configurado');
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Token MP no configurado en Netlify' }) };
  }

  // ── Parsear body ────────────────────────────────────────────────────────────
  let data;
  try {
    data = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'JSON inválido' }) };
  }

  const { order_id, items, customer, back_urls } = data;

  if (!items || !items.length) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'items requeridos' }) };
  }

  // ── Armar preferencia MP ────────────────────────────────────────────────────
  const preference = {
    external_reference: order_id || Date.now().toString(),

    items: items.map(item => ({
      id          : String(item.id),
      title       : String(item.title).substring(0, 256),
      unit_price  : Math.round(Number(item.unit_price)),   // CLP = entero
      quantity    : Math.round(Number(item.quantity)),
      currency_id : 'CLP'
    })),

    payer: {
      name : customer?.name  || '',
      email: customer?.email || 'cliente@syastore.cl',
      phone: {
        area_code: '56',
        number   : String(customer?.phone || '').replace(/\D/g, '').slice(-9)
      }
    },

    back_urls: {
      success: back_urls?.success || '',
      failure: back_urls?.failure || '',
      pending: back_urls?.pending || ''
    },

    auto_return        : 'approved',
    statement_descriptor: 'SYA STORE',

    // Desactiva pagos en efectivo (Klap, etc.) — solo tarjeta y saldo MP
    payment_methods: {
      excluded_payment_types: [
        { id: 'ticket' },
        { id: 'atm' }
      ]
    }
  };

  // ── Llamar API MercadoPago ──────────────────────────────────────────────────
  try {
    const mpRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method : 'POST',
      headers: {
        'Authorization'    : `Bearer ${token}`,
        'Content-Type'     : 'application/json',
        'X-Idempotency-Key': order_id || Date.now().toString()
      },
      body: JSON.stringify(preference)
    });

    const mpData = await mpRes.json();

    if (!mpRes.ok) {
      console.error('MP API error:', JSON.stringify(mpData));
      return {
        statusCode: 502,
        headers   : CORS,
        body      : JSON.stringify({ error: 'Error de MercadoPago', detail: mpData })
      };
    }

    console.log(`✓ Preferencia creada: ${mpData.id} | Orden: ${order_id}`);

    return {
      statusCode: 200,
      headers   : CORS,
      body      : JSON.stringify({
        init_point        : mpData.init_point,
        sandbox_init_point: mpData.sandbox_init_point,
        id                : mpData.id
      })
    };

  } catch (err) {
    console.error('Error en función MP:', err.message);
    return {
      statusCode: 500,
      headers   : CORS,
      body      : JSON.stringify({ error: err.message })
    };
  }
};
