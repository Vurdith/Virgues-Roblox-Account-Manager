import { handleBillingRequest } from '../../billing-api/server.mjs'

export const config = {
  api: {
    bodyParser: false,
  },
}

export default function handler(request, response) {
  return handleBillingRequest(request, response)
}
