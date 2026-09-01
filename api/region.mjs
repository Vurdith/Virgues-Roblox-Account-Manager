function readHeader(request, name) {
  if (request?.headers && typeof request.headers.get === 'function') return request.headers.get(name) || ''
  return request?.headers?.[name] || request?.headers?.[name.toLowerCase()] || ''
}

export default function handler(request, response) {
  const value = String(readHeader(request, 'x-vercel-ip-country')).trim().toUpperCase()
  const country = /^[A-Z]{2}$/.test(value) ? value : null

  response.setHeader('Cache-Control', 'private, no-store')
  response.status(200).json({ country })
}
