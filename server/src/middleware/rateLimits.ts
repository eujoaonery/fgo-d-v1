import rateLimit from 'express-rate-limit'

export const loginLimiter = rateLimit({
  windowMs: 60_000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de login. Aguarde.' },
})

export const authEventsLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Aguarde um minuto.' },
})

export const ingestLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Limite de ingestão excedido' },
})

export const apiAuthedLimiter = rateLimit({
  windowMs: 60_000,
  max: Number(process.env.FOGO_API_RATE_LIMIT ?? 600),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Limite de requisições excedido' },
  skip: (req) => req.path === '/api/health' || req.path === '/api/events/stream',
})
