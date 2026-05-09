// ─────────────────────────────────────────────────────────────────────────────
//  SyA Store — Notificación Telegram al admin
//  Usado por: checkout.html (contra entrega) y mp-webhook.js (MP aprobado)
//  Env variables: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
// ─────────────────────────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin' : '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type'                : 'application/json'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST')   return { statusCode: 405, headers: CORS, body: 'ok' };

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId   = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) {
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: false, reason: 'Telegram no configurado' }) };
  }

  let data;
  try { data = JSON.parse(event.body || '{}'); }
  catch(e) { return { statusCode: 400, headers: CORS, body: 'JSON inválido' }; }

  const { order_id, items, customer, total, payment_method } = data;
  const isMP       = payment_method === 'mercadopago';
  const shortId    = String(order_id || '').slice(-6).toUpperCase();

  // ── Armar mensaje ────────────────────────────────────────────────────────────
  const itemLines = (items || [])
    .map(i => `  • ${i.title || i.name} x${i.quantity || i.qty} — $${Number(i.unit_price || i.price || 0).toLocaleString('es-CL')}`)
    .join('\n');

  const header  = isMP
    ? `✅ *PAGO CONFIRMADO — MercadoPago*`
    : `📦 *NUEVO PEDIDO — Contra Entrega*`;

  const address = customer?.address
    ? `\n🏠 ${customer.address}, ${customer.commune || ''}`
    : '';

  const msg =
    `${header}\n` +
    `────────────────────\n` +
    `📋 Orden: *#${shortId}*\n` +
    `👤 ${customer?.name || 'Cliente'}\n` +
    `📞 ${customer?.phone || '-'}\n` +
    `📧 ${customer?.email || '-'}` +
    `${address}\n\n` +
    `📦 *Productos:*\n${itemLines || '  (sin detalle)'}\n\n` +
    `💰 *Total: $${Number(total || 0).toLocaleString('es-CL')} CLP*\n` +
    `────────────────────\n` +
    (isMP ? `✔ Pago verificado por MercadoPago` : `⚡ Preparar y coordinar envío`);

  // ── Enviar a Telegram ────────────────────────────────────────────────────────
  try {
    const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({ chat_id: chatId, text: msg, parse_mode: 'Markdown' })
    });
    const tgData = await tgRes.json();
    console.log('Telegram:', tgData.ok ? '✓ enviado' : tgData.description);
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: tgData.ok }) };
  } catch(e) {
    console.error('Telegram error:', e.message);
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: false }) };
  }
};
