import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PaginationComponent from './PaginationComponent.vue'
import { buildPagination } from '@/utils/pagination'

function mountPager(page: number, totalItems: number, pageSize = 10, maxButtons = 5) {
  return mount(PaginationComponent, {
    props: { pagination: buildPagination(page, pageSize, totalItems), maxButtons },
  })
}

function pageButtons(wrapper: ReturnType<typeof mountPager>) {
  return wrapper
    .findAll('button')
    .filter((b) => /^\d+$/.test(b.text().trim()))
    .map((b) => b.text().trim())
}

describe('PaginationComponent', () => {
  it('hides the nav bar when there is only a single page', () => {
    const wrapper = mountPager(1, 5) // total_pages = 1
    expect(wrapper.find('button').exists()).toBe(false)
  })

  it('renders a windowed range of page buttons around the current page', () => {
    // 100 items / 10 per page = 10 pages, current page 5, window of 5
    const wrapper = mountPager(5, 100, 10, 5)
    expect(pageButtons(wrapper)).toEqual(['3', '4', '5', '6', '7'])
  })

  it('clamps the window at the start', () => {
    const wrapper = mountPager(1, 100, 10, 5)
    expect(pageButtons(wrapper)).toEqual(['1', '2', '3', '4', '5'])
  })

  it('clamps the window at the end', () => {
    const wrapper = mountPager(10, 100, 10, 5)
    expect(pageButtons(wrapper)).toEqual(['6', '7', '8', '9', '10'])
  })

  it('emits change with the target page when a page button is clicked', async () => {
    const wrapper = mountPager(5, 100, 10, 5)
    const target = wrapper.findAll('button').find((b) => b.text().trim() === '7')!
    await target.trigger('click')
    expect(wrapper.emitted('change')).toEqual([[7]])
  })

  it('does not emit change when clicking the current page', async () => {
    const wrapper = mountPager(5, 100, 10, 5)
    const current = wrapper.findAll('button').find((b) => b.text().trim() === '5')!
    await current.trigger('click')
    expect(wrapper.emitted('change')).toBeUndefined()
  })

  it('emits the previous and next pages via the prev/next controls', async () => {
    const wrapper = mountPager(5, 100, 10, 5)
    const prev = wrapper.findAll('button').find((b) => b.text().includes('Previous'))!
    const next = wrapper.findAll('button').find((b) => b.text().includes('Next'))!

    await prev.trigger('click')
    await next.trigger('click')

    expect(wrapper.emitted('change')).toEqual([[4], [6]])
  })

  it('disables Previous on the first page and Next on the last page', () => {
    const first = mountPager(1, 100, 10, 5)
    const firstPrev = first.findAll('button').find((b) => b.text().includes('Previous'))!
    expect(firstPrev.attributes('disabled')).toBeDefined()

    const last = mountPager(10, 100, 10, 5)
    const lastNext = last.findAll('button').find((b) => b.text().includes('Next'))!
    expect(lastNext.attributes('disabled')).toBeDefined()
  })
})
