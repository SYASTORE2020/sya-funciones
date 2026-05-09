# SyA Funciones — Netlify Functions

Funciones serverless para SyA Store. Siempre activas, sin servidor.

## Función: mp-crear-preferencia

Crea una preferencia de pago en MercadoPago y devuelve el `init_point`.

**URL en producción:**
```
https://[TU-SITE].netlify.app/.netlify/functions/mp-crear-preferencia
```

## Variables de entorno requeridas

| Variable | Descripción |
|----------|-------------|
| `MP_ACCESS_TOKEN` | Access Token de producción de MercadoPago |
