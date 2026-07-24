import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import type { RouteLocationMatched, RouteLocationNormalizedLoaded } from 'vue-router'

// The component derives its trail from useRoute(); mock it per-test.
const currentRoute = { value: {} as RouteLocationNormalizedLoaded }
vi.mock('vue-router', () => ({
  useRoute: () => currentRoute.value,
}))

import AdminBreadcrumbs from './AdminBreadcrumbs.vue'

function matched(entries: { path: string; breadcrumb?: unknown }[]): RouteLocationMatched[] {
  return entries.map((e) => ({ path: e.path, meta: { breadcrumb: e.breadcrumb } })) as unknown as RouteLocationMatched[]
}

function makeRoute(
  matchedEntries: { path: string; breadcrumb?: unknown }[],
  params: Record<string, string> = {},
): RouteLocationNormalizedLoaded {
  return { matched: matched(matchedEntries), params } as unknown as RouteLocationNormalizedLoaded
}

function mountCrumbs() {
  return mount(AdminBreadcrumbs, {
    global: { stubs: { 'router-link': { template: '<a><slot /></a>' } } },
  })
}

describe('AdminBreadcrumbs', () => {
  it('renders nothing when no matched route carries a breadcrumb', () => {
    currentRoute.value = makeRoute([{ path: '/admin' }])
    const wrapper = mountCrumbs()
    expect(wrapper.find('nav').exists()).toBe(false)
  })

  it('builds a trail from matched routes that declare a string breadcrumb', () => {
    currentRoute.value = makeRoute([
      { path: '/admin', breadcrumb: 'Dashboard' },
      { path: '/admin/products', breadcrumb: 'Products' },
    ])
    const wrapper = mountCrumbs()
    // Non-first crumbs include a "/" separator span; strip it for the label check.
    const items = wrapper.findAll('li').map((li) => li.text().replace(/^\/\s*/, ''))
    expect(items).toEqual(['Dashboard', 'Products'])
  })

  it('resolves a function-form breadcrumb against the current route params', () => {
    currentRoute.value = makeRoute(
      [
        { path: '/admin', breadcrumb: 'Dashboard' },
        { path: '/admin/products', breadcrumb: 'Products' },
        {
          path: '/admin/products/:id/edit',
          breadcrumb: (route: RouteLocationNormalizedLoaded) => `Edit product #${route.params.id}`,
        },
      ],
      { id: '42' },
    )
    const wrapper = mountCrumbs()
    expect(wrapper.text()).toContain('Edit product #42')
  })

  it('renders the final crumb as plain text (not a link) and earlier crumbs as links', () => {
    currentRoute.value = makeRoute([
      { path: '/admin', breadcrumb: 'Dashboard' },
      { path: '/admin/products', breadcrumb: 'Products' },
    ])
    const wrapper = mountCrumbs()
    // One link (Dashboard) + one plain span (Products, the last crumb).
    expect(wrapper.findAll('a')).toHaveLength(1)
    expect(wrapper.find('a').text()).toBe('Dashboard')
  })
})
