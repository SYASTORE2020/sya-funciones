// netlify/functions/mp-webhook.js
// Recibe notificaciones de MercadoPago y notifica por Telegram

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

exports.handler = async (event) => {
  // Responder OPTIONS (preflight)
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }

  // MP envía GET con ?topic=payment&id=... o POST con body JSON
  const topic = event.queryStringParameters?.topic || event.queryStringParameters?.type;
  const paymentId = event.queryStringParameters?.id ||
                    event.queryStringParameters?.['data.id'];

  let pid = paymentId;

  // Si viene como POST (formato nuevo de MP)
  if (!pid && event.body) {
    try {
      const body = JSON.parse(event.body);
      pid = body?.data?.id || body?.id;
    } catch (_) {}
  }

  // Solo procesar notificaciones de pagos
  if (!pid || (topic && !['payment', 'merchant_order'].includes(topic))) {
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true }) };
  }

  try {
    const token = process.env.MP_ACCESS_TOKEN;
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    // Obtener detalles del pago desde la API de MP
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${pid}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!mpRes.ok) {
      console.error('MP API error:', mpRes.status);
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true }) };
    }

    const payment = await mpRes.json();
    const status = payment.status;

    // Solo notificar pagos aprobados
    if (status !== 'approved') {
      console.log(`Pago ${pid} con status: ${status} — ignorado`);
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true }) };
    }

    // Formatear monto
    const amount = new Intl.NumberFormat('es-CL', {
      style: 'currency', currency: 'CLP', maximumFractionDigits: 0
    }).format(payment.transaction_amount || 0);

    // Datos del comprador
    const payer = payment.payer || {};
    const payerName = `${payer.first_name || ''} ${payer.last_name || ''}`.trim() || 'Desconocido';
    const payerEmail = payer.email || '-';

    // Descripción del producto
    const description = payment.description || payment.additional_info?.items?.[0]?.title || 'Sin descripción';

    // Referencia de orden
    const orderId = payment.external_reference || pid;

    // Método de pago
    const payMethod = payment.payment_type_id === 'credit_card' ? '💳 Tarjeta de crédito'
                    : payment.payment_type_id === 'debit_card'  ? '💳 Tarjeta de débito'
                    : payment.payment_type_id === 'account_money' ? '💰 Saldo MercadoPago'
                    : payment.payment_type_id || 'Otro';

    // Mensaje Telegram
    const msg = `🛒 *¡NUEVA VENTA! SyA Store*\n\n` +
      `✅ Pago *APROBADO*\n\n` +
      `📦 *Producto:* ${description}\n` +
      `💵 *Monto:* ${amount}\n` +
      `💳 *Medio:* ${payMethod}\n\n` +
      `👤 *Cliente:* ${payerName}\n` +
      `📧 *Email:* ${payerEmail}\n\n` +
      `🔖 *Orden:* #${String(orderId).slice(-8).toUpperCase()}\n` +
      `🆔 *Pago MP:* ${pid}`;

    // Enviar a Telegram
    if (botToken && chatId) {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: msg,
          parse_mode: 'Markdown'
        })
      });
      console.log(`✅ Notificación Telegram enviada para pago ${pid}`);
    } else {
      console.warn('TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID no configurados');
    }

    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true }) };

  } catch (err) {
    console.error('Error en mp-webhook:', err.message);
    // Siempre devolver 200 a MP para que no reintente
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true }) };
  }
};
