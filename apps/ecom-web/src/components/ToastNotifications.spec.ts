import { describe, expect, it, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ToastNotifications from './ToastNotifications.vue'
import { useEcommerceStore } from '@/stores/ecommerce'

function mountToasts() {
  return mount(ToastNotifications)
}

function cardClasses(wrapper: ReturnType<typeof mountToasts>) {
  return wrapper.findAll('.toast-card').map((card) => card.classes())
}

describe('ToastNotifications', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    // showToast schedules a removal via window.setTimeout; use fake timers so
    // toasts stay put for the duration of each assertion.
    vi.useFakeTimers()
  })

  it('maps each toast type to its daisyUI semantic token classes', () => {
    const store = useEcommerceStore()
    store.showToast('Saved successfully', 'success')
    store.showToast('Heads up', 'info')
    store.showToast('Careful now', 'warning')
    store.showToast('Something broke', 'error')

    const wrapper = mountToasts()
    const classes = cardClasses(wrapper)

    // showToast unshifts, so toasts render newest-first: error, warning, info, success.
    expect(classes[0]).toEqual(expect.arrayContaining(['border-error/30', 'bg-error/10']))
    expect(classes[1]).toEqual(expect.arrayContaining(['border-warning/30', 'bg-warning/10']))
    expect(classes[2]).toEqual(expect.arrayContaining(['border-info/30', 'bg-info/10']))
    expect(classes[3]).toEqual(expect.arrayContaining(['border-success/30', 'bg-success/10']))

    // Guard against regressing back to the old hardcoded Tailwind palette classes.
    const flat = classes.flat()
    expect(flat).not.toEqual(
      expect.arrayContaining(['border-emerald-500/30', 'border-sky-500/30', 'border-amber-500/30', 'border-rose-500/30']),
    )
  })

  it('falls back to neutral base classes for an unrecognized toast type', () => {
    const store = useEcommerceStore()
    store.showToast('Unknown kind', 'weird' as never)

    const wrapper = mountToasts()
    expect(cardClasses(wrapper)[0]).toEqual(
      expect.arrayContaining(['border-base-300', 'bg-base-200']),
    )
  })

  it('removes a toast when its dismiss button is clicked', async () => {
    const store = useEcommerceStore()
    store.showToast('Dismiss me', 'success')

    const wrapper = mountToasts()
    expect(wrapper.findAll('.toast-card')).toHaveLength(1)

    await wrapper.find('button').trigger('click')

    expect(wrapper.findAll('.toast-card')).toHaveLength(0)
    expect(store.toasts).toHaveLength(0)
  })
})
