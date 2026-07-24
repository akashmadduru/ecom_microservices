import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useConfirmAction } from './useConfirmAction'
import { useEcommerceStore } from '@/stores/ecommerce'

interface Row {
  id: number
  name: string
}

const row: Row = { id: 1, name: 'Acme' }

describe('useConfirmAction', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('runs the happy path: perform, onSuccess, success toast, reset state', async () => {
    const store = useEcommerceStore()
    const toast = vi.spyOn(store, 'showToast')
    const perform = vi.fn<(row: Row) => Promise<void>>().mockResolvedValue(undefined)
    const onSuccess = vi.fn<(row: Row) => void>()

    const action = useConfirmAction<Row>({
      perform,
      label: (r) => r.name,
      onSuccess,
    })

    action.ask(row)
    expect(action.pendingDelete.value).toEqual(row)
    expect(action.confirmOpen.value).toBe(true)

    await action.confirm()

    expect(perform).toHaveBeenCalledWith(row)
    expect(onSuccess).toHaveBeenCalledWith(row)
    expect(toast).toHaveBeenCalledWith('Deleted Acme.', 'success')
    expect(action.confirmOpen.value).toBe(false)
    expect(action.pendingDelete.value).toBeNull()
    expect(action.deleting.value).toBe(false)
  })

  it('keeps the dialog open and shows an error toast when perform rejects', async () => {
    const store = useEcommerceStore()
    const toast = vi.spyOn(store, 'showToast')
    const perform = vi.fn<(row: Row) => Promise<void>>().mockRejectedValue(new Error('boom'))

    const action = useConfirmAction<Row>({
      perform,
      label: (r) => r.name,
      errorMessage: () => 'Custom failure.',
    })

    action.ask(row)
    await action.confirm()

    expect(toast).toHaveBeenCalledWith('Custom failure.', 'error')
    expect(action.confirmOpen.value).toBe(true)
    expect(action.pendingDelete.value).toEqual(row)
    expect(action.deleting.value).toBe(false)
  })

  it('ignores cancel() while a delete is in flight', async () => {
    useEcommerceStore()
    let resolvePerform: (() => void) | undefined
    const perform = vi.fn<() => Promise<void>>(
      () =>
        new Promise<void>((resolve) => {
          resolvePerform = resolve
        }),
    )

    const action = useConfirmAction<Row>({ perform, label: (r) => r.name })

    action.ask(row)
    const pending = action.confirm()
    expect(action.deleting.value).toBe(true)

    action.cancel()
    expect(action.confirmOpen.value).toBe(true)
    expect(action.pendingDelete.value).toEqual(row)

    resolvePerform?.()
    await pending
    expect(action.deleting.value).toBe(false)
  })
})
