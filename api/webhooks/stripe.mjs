import { handleBillingRequest } from '../../billing-api/server.mjs'

// Stripe signature verification requires the unparsed request body.
export const config = {
  api: {
    bodyParser: false,
  },
}

export default function handler(request, response) {
  return handleBillingRequest(request, response)
}
