import { handleBillingRequest } from '../billing-api/server.mjs'

export default function handler(request, response) {
  return handleBillingRequest(request, response)
}
