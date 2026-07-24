import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ConfirmDialog from './ConfirmDialog.vue'

// jsdom does not implement the native <dialog> modal API, so stub the methods
// the component drives and have them keep `open` in sync like a real dialog.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn<(this: HTMLDialogElement) => void>(function (
    this: HTMLDialogElement,
  ) {
    this.open = true
  })
  HTMLDialogElement.prototype.close = vi.fn<(this: HTMLDialogElement) => void>(function (
    this: HTMLDialogElement,
  ) {
    this.open = false
  })
})

function mountDialog(props: Record<string, unknown> = {}) {
  return mount(ConfirmDialog, {
    props: { open: false, message: 'Delete this record?', ...props },
  })
}

describe('ConfirmDialog', () => {
  it('calls showModal() when open flips to true and close() when it flips back', async () => {
    const wrapper = mountDialog({ open: false })
    const dialog = wrapper.find('dialog').element as HTMLDialogElement

    await wrapper.setProps({ open: true })
    expect(dialog.showModal).toHaveBeenCalledTimes(1)

    await wrapper.setProps({ open: false })
    expect(dialog.close).toHaveBeenCalledTimes(1)
  })

  it('emits confirm when the confirm button is clicked', async () => {
    const wrapper = mountDialog({ open: true, confirmText: 'Delete' })
    await wrapper.setProps({ open: true })

    const buttons = wrapper.findAll('.modal-action button')
    await buttons[1]!.trigger('click') // confirm button

    expect(wrapper.emitted('confirm')).toHaveLength(1)
  })

  it('emits cancel and update:open=false when the cancel button is clicked', async () => {
    const wrapper = mountDialog({ open: true })
    const cancelBtn = wrapper.findAll('.modal-action button')[0]!

    await cancelBtn.trigger('click')

    expect(wrapper.emitted('cancel')).toHaveLength(1)
    expect(wrapper.emitted('update:open')).toEqual([[false]])
  })

  it('routes Escape (native cancel event) through onCancel instead of silently closing', async () => {
    const wrapper = mountDialog({ open: true })
    const dialog = wrapper.find('dialog')

    const event = new Event('cancel', { cancelable: true })
    dialog.element.dispatchEvent(event)
    await wrapper.vm.$nextTick()

    expect(event.defaultPrevented).toBe(true)
    expect(wrapper.emitted('cancel')).toHaveLength(1)
    expect(wrapper.emitted('update:open')).toEqual([[false]])
  })

  it('does not emit cancel while loading (interaction disabled)', async () => {
    const wrapper = mountDialog({ open: true, loading: true })
    const buttons = wrapper.findAll('.modal-action button')

    expect(buttons[0]!.attributes('disabled')).toBeDefined()
    expect(buttons[1]!.attributes('disabled')).toBeDefined()

    // Even if the click handler runs, onCancel bails out while loading.
    await buttons[0]!.trigger('click')
    expect(wrapper.emitted('cancel')).toBeUndefined()
  })
})
