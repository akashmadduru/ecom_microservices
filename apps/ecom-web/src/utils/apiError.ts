import { AxiosError } from 'axios'
import type { ApiError } from '@/interfaces/api'

interface ValidationDetail {
  loc: (string | number)[]
  msg: string
}

function isValidationDetailList(detail: unknown): detail is ValidationDetail[] {
  return (
    Array.isArray(detail) &&
    detail.every((entry) => entry && typeof entry === 'object' && 'msg' in entry)
  )
}

export function normalizeApiError(error: unknown): ApiError {
  if (!(error instanceof AxiosError)) {
    return {
      message: error instanceof Error ? error.message : 'Unexpected error occurred.',
      status: null,
      fieldErrors: {},
    }
  }

  if (!error.response) {
    return {
      message: 'Network error. Please check your connection and try again.',
      status: null,
      fieldErrors: {},
    }
  }

  const status = error.response.status
  const data = error.response.data as Record<string, unknown> | undefined
  const fieldErrors: Record<string, string[]> = {}
  let message = error.message

  // ecom microservices wrap errors as { error: { code, message, details, correlation_id } }
  const errorEnvelope = data?.error as Record<string, unknown> | string | undefined
  const detail = data?.detail ?? (typeof errorEnvelope === 'object' ? errorEnvelope?.details : undefined)

  if (isValidationDetailList(detail)) {
    for (const entry of detail) {
      const field = String(entry.loc[entry.loc.length - 1] ?? 'form')
      fieldErrors[field] = [...(fieldErrors[field] ?? []), entry.msg]
    }
    message = detail[0]?.msg ?? 'Validation failed.'
  } else if (typeof detail === 'string') {
    message = detail
  } else if (typeof errorEnvelope === 'object' && typeof errorEnvelope?.message === 'string') {
    message = errorEnvelope.message
  } else if (typeof errorEnvelope === 'string') {
    message = errorEnvelope
  } else if (typeof data?.message === 'string') {
    message = data.message
  }

  return { message, status, fieldErrors }
}
