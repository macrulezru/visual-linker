import { expect, test, type Page } from '@playwright/test'

interface StandEngine {
  startConnect(from: object): boolean
  completeConnect(to: object): boolean
  isConnecting(): { active: boolean }
}

interface LoggedEvent {
  type: string
  payload: Record<string, unknown>
}

const setup = (page: Page, connect: object = {}, connections: object[] = []) =>
  page.evaluate(
    ([c, list]) =>
      (window as unknown as { __stand: { setup(c: object, l: object[]): void } }).__stand.setup(
        c as object,
        list as object[],
      ),
    [connect, connections] as const,
  )

const events = (page: Page) =>
  page.evaluate(() => (window as unknown as { __stand: { events: LoggedEvent[] } }).__stand.events.slice()) as Promise<
    LoggedEvent[]
  >

const center = (page: Page, key: string) =>
  page.evaluate(
    (k) =>
      (window as unknown as { __stand: { handleCenter(k: string): { x: number; y: number } } }).__stand.handleCenter(k),
    key,
  )

async function drag(page: Page, from: string, to: { x: number; y: number }, release = true) {
  const start = await center(page, from)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move((start.x + to.x) / 2, (start.y + to.y) / 2, { steps: 4 })
  await page.mouse.move(to.x, to.y, { steps: 4 })
  if (release) await page.mouse.up()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/connect-stand.html')
  await page.waitForFunction(() => Boolean((window as unknown as { __stand?: unknown }).__stand))
})

test('a drag from a port to a valid port emits exactly one create-request and adds no line', async ({ page }) => {
  await drag(page, 'src:p1', await center(page, 'dst:q2'))
  const log = await events(page)
  expect(log.map((event) => event.type)).toEqual(['connect:start', 'connection:create-request'])
  expect(log[1]!.payload).toMatchObject({
    from: { blockId: 'src', portId: 'p1' },
    to: { blockId: 'dst', portId: 'q2' },
    via: 'drag',
  })
  const left = await page.evaluate(() =>
    (window as unknown as { __stand: { leftovers(): object } }).__stand.leftovers(),
  )
  expect(left).toEqual({ connecting: null, states: 0, previews: 0, paths: 0 })
})

test('released on empty space, on an invalid port, with Escape or with pointercancel: one cancel with the reason', async ({
  page,
}) => {
  await drag(page, 'src:p1', { x: 380, y: 300 })
  expect((await events(page)).map((event) => event.type)).toEqual(['connect:start', 'connection:create-cancel'])
  expect((await events(page))[1]!.payload).toMatchObject({ reason: 'no-target' })

  await setup(page, { reject: 'not allowed' })
  await drag(page, 'src:p1', await center(page, 'dst:q1'))
  expect((await events(page)).map((event) => event.type)).toEqual(['connect:start', 'connection:create-cancel'])
  expect((await events(page))[1]!.payload).toMatchObject({ reason: 'invalid', message: 'not allowed' })
  expect(
    await page.evaluate(() => (window as unknown as { __stand: { liveText(): string } }).__stand.liveText()),
  ).toContain('not allowed')

  await setup(page)
  await drag(page, 'src:p1', await center(page, 'dst:q1'), false)
  await page.keyboard.press('Escape')
  await page.mouse.up()
  expect((await events(page)).map((event) => event.type)).toEqual(['connect:start', 'connection:create-cancel'])
  expect((await events(page))[1]!.payload).toMatchObject({ reason: 'escape' })

  await setup(page)
  await drag(page, 'src:p1', await center(page, 'dst:q1'), false)
  await page.evaluate(() => (window as unknown as { __stand: { cancelPointer(): void } }).__stand.cancelPointer())
  await page.mouse.up()
  expect((await events(page)).map((event) => event.type)).toEqual(['connect:start', 'connection:create-cancel'])
  expect((await events(page))[1]!.payload).toMatchObject({ reason: 'pointer-cancel' })
})

test('two clicks create a request, a click on empty space cancels', async ({ page }) => {
  await setup(page, { mode: 'click' })
  const a = await center(page, 'src:p2')
  const b = await center(page, 'dst:q3')
  await page.mouse.click(a.x, a.y)
  await page.mouse.click(b.x, b.y)
  let log = await events(page)
  expect(log.map((event) => event.type)).toEqual(['connect:start', 'connection:create-request'])
  expect(log[1]!.payload).toMatchObject({ via: 'click', from: { portId: 'p2' }, to: { portId: 'q3' } })

  await setup(page, { mode: 'click' })
  await page.mouse.click(a.x, a.y)
  await page.mouse.click(380, 330)
  log = await events(page)
  expect(log.map((event) => event.type)).toEqual(['connect:start', 'connection:create-cancel'])
  expect(log[1]!.payload).toMatchObject({ reason: 'no-target' })
})

test('the keyboard connects with Enter, Tab and cancels with Escape', async ({ page }) => {
  await page.locator('#p1').focus()
  await page.keyboard.press('Enter')
  await page.keyboard.press('Tab')
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('q1')
  await page.keyboard.press('Tab')
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('q2')
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Enter')
  let log = await events(page)
  expect(log.map((event) => event.type)).toEqual(['connect:start', 'connection:create-request'])
  expect(log[1]!.payload).toMatchObject({ via: 'keyboard', to: { blockId: 'dst', portId: 'q1' } })

  await setup(page)
  await page.locator('#p3').focus()
  await page.keyboard.press('Space')
  await page.keyboard.press('Escape')
  log = await events(page)
  expect(log.map((event) => event.type)).toEqual(['connect:start', 'connection:create-cancel'])
  expect(log[1]!.payload).toMatchObject({ reason: 'escape' })
})

test('one hundred gestures leave nothing behind', async ({ page }) => {
  for (let i = 0; i < 100; i++) {
    const to = await center(page, i % 2 ? 'dst:q1' : 'dst:q3')
    await drag(page, 'src:p1', i % 3 === 0 ? { x: 380, y: 330 } : to)
  }
  const log = await events(page)
  expect(log.filter((event) => event.type === 'connect:start')).toHaveLength(100)
  expect(log.filter((event) => event.type !== 'connect:start')).toHaveLength(100)
  const left = await page.evaluate(() =>
    (window as unknown as { __stand: { leftovers(): object } }).__stand.leftovers(),
  )
  expect(left).toEqual({ connecting: null, states: 0, previews: 0, paths: 0 })
})

test('the programmatic API starts, completes and cancels', async ({ page }) => {
  const result = await page.evaluate(() => {
    const engine = (window as unknown as { __stand: { engine(): StandEngine } }).__stand.engine()
    return {
      started: engine.startConnect({ blockId: 'src', portId: 'p1' }),
      active: engine.isConnecting().active,
      done: engine.completeConnect({ blockId: 'dst', portId: 'q2' }),
      after: engine.isConnecting().active,
      bad: engine.startConnect({ blockId: 'nope' }),
    }
  })
  expect(result).toEqual({ started: true, active: true, done: true, after: false, bad: false })
})

const setupWith = (page: Page, connect: object, connections: object[], extra: object) =>
  page.evaluate(
    ([c, list, e]) =>
      (window as unknown as { __stand: { setup(c: object, l: object[], e: object): void } }).__stand.setup(
        c as object,
        list as object[],
        e as object,
      ),
    [connect, connections, extra] as const,
  )

test('a button inside a block keeps its click and does not start a connection', async ({ page }) => {
  await setup(page, { from: 'block', to: 'block' })
  await page.click('#btn')
  expect(
    await page.evaluate(() => (window as unknown as { __stand: { clicks: { count: number } } }).__stand.clicks.count),
  ).toBe(1)
  expect(await events(page)).toEqual([])
  const active = await page.evaluate(
    () => (window as unknown as { __stand: { engine(): StandEngine } }).__stand.engine().isConnecting().active,
  )
  expect(active).toBe(false)
})

test('block attributes mark the source and the candidate during a drag, and the line stops short of the port', async ({
  page,
}) => {
  await setupWith(
    page,
    {},
    [{ id: 'x', from: { blockId: 'src', portId: 'p1' }, to: { blockId: 'dst', portId: 'q1' } }],
    { lines: { curve: 'straight', endGap: 8 }, ports: { show: 'all' } },
  )
  const d = await page.locator('path.vl-connection').first().getAttribute('d')
  const circle = await page.locator('circle.vl-port').first().getAttribute('cx')
  const [, startX] = /^M ([\d.]+)/.exec(d!)!
  expect(Number(startX) - Number(circle)).toBeCloseTo(8, 0)

  const start = await center(page, 'src:p2')
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + 100, start.y, { steps: 4 })
  expect(await page.locator('#src').getAttribute('data-vl-connect-state')).toBe('source')
  expect(await page.locator('#dst').getAttribute('data-vl-connect-state')).toBe('candidate')
  await page.mouse.up()
  expect(await page.locator('[data-vl-connect-state]').count()).toBe(0)
})
