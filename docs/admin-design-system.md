# Maqaaxi Pos: Admin Design System (v1, light)

This is the reference for **every** admin and back-office screen (`/admin/*`). Read it before you design or build any admin UI.

- **Source:** `docs/design/Maqaaxi Design System.dc.html` (tokens and components) and `docs/design/Maqaaxi Admin Redesign.dc.html` (every page). Open them in a browser; `support.js` renders the `.dc.html` files.
- **Code:** the tokens are in `apps/web/tailwind.config.js` under the `mq` namespace. The shared pieces are in `apps/web/src/components/admin/ui/`. Build pages from those pieces. Don't hand-roll a button, card or table.
- **Scope:** admin only. The public menu keeps its own maroon system (`globals.css` `@layer components`).

> **Principle.** A neutral, slightly warm base carries the data. Goodir maroon is only for identity, primary actions and the active state. It is never used for status. Status colour is a separate channel of four hues, so a red row always means something is wrong, never that something is branded.

---

## 1. Colour

### Brand

| Token (`mq-…`) | Hex | Use |
|---|---|---|
| `primary` | `#850D33` | identity, active nav, links, selected chip, chart series 1 |
| `cta` | `#A31743` | primary button fill (hover → `primary`) |
| `deep` | `#6E0B2A` | avatar tile, deep accents |
| `soft` | `#F6E8EC` | active nav background, soft button, selected row |
| `soft-2` | `#EFD8DF` | soft-button hover, inactive mini-bars |
| `soft-line` | `#EBD2D9` | border of maroon-soft chips |
| `focus` | `#D9A8B8` | focused input border (+ ring `rgba(133,13,51,.12)`, 3px) |
| `cream` | `#FAFAF8` | table/card header strip, text on maroon |

### Neutral ramp (light to dark)

| Token | Hex | Use |
|---|---|---|
| `white` | `#FFFFFF` | cards, inputs, sidebar |
| `cream` | `#FAFAF8` | header strips, row hover |
| `canvas` | `#F4F4F2` | page background |
| `chip` | `#EFEFEA` | segmented track, grey chips, inner rules |
| `line` | `#E5E5E0` | borders |
| `line-2` | `#D5D5CE` | strong rule, chart axis, secondary hover border |
| `faint` | `#9A9A93` | icon strokes, disabled glyphs; **never text** |
| `muted` | `#6E6E68` | lightest allowed text (5.2:1 on white) |
| `on-tint` | `#57574F` | text on `chip` or `soft` grounds |
| `chip-ink` | `#5E5E57` | grey chip text |
| `body` | `#3D3D3A` | secondary text, secondary button text |
| `ink` | `#1A1A18` | primary text |
| `disabled` | `#8E8E86` | disabled button text |
| `prev` | `#B8B8B0` | previous-period line in charts |
| `shimmer` | `#F7F7F4` | skeleton highlight |

**Contrast rules**
- `muted` is the lightest text colour you may use.
- On `chip` or `soft` grounds, use `on-tint`.
- Never put white text on warning amber `#B06A00`. Solid amber fills use `#8A5300`.

### Status channel (four hues, never brand)

| Status | Solid / dot | Soft bg | Border | Text | Meaning |
|---|---|---|---|---|---|
| `ok` | `#0E7C5A` | `#E4F2EC` | `#C6E4D8` | `#0A5C43` | paid, settled, in stock, positive delta |
| `warn` | `#B06A00` (fill `#8A5300`) | `#FBF0DB` | `#F0DDB6` | `#8A5300` | awaiting, low stock, not closed |
| `danger` | `#C8321F` (hover `#A62717`) | `#FCEAE6` (hover `#F8DCD5`) | `#F4D3CB` | `#9E2717` | stuck payment, void, out of stock, negative delta |
| `info` | `#1F6FB2` | `#E6EFF7` | `#C9DCEE` | `#185788` | open or in-kitchen order, live, informational |
| off | `#9A9A93` | `#EFEFEA` | — | `#5E5E57` | voided, hidden, inactive |

**Chart-only colours**
- Violet `#6B5CA5` (a third category).
- Maroon ramp for ranked bars: `#850D33` → `#A31743` → `#C0576F` → `#D68C9E` → `#E5C3CC`.
- On the dark tooltip: maroon `#E9A3B6`, green `#8FD3B6` / `#6ED3A6`.

---

## 2. Typography

| Family | Tailwind | Use |
|---|---|---|
| **Inter** 400/500/600/700 | `font-mq` | all UI |
| **JetBrains Mono** 400/500/600 | `font-mq-mono` + `tabular-nums` | every amount, count, receipt #, order code, time and date cell; right-align money |
| Cormorant Garamond | — | printed documents only (receipt, statement and Z-report headers), never UI chrome |

| Style | Spec |
|---|---|
| Display | 30 / 600, −.03em, lh 1.1 (single-KPI hero) |
| Page title (topbar) | 18 / 600, −.02em |
| Heading | 20 / 600, −.02em |
| Section / card title | 14–15 / 600, −.01em |
| Body | 14 / 400, `body` colour (13.5 in tables) |
| Small | 12.5, `muted` |
| Overline | 10.5–11 / 600, uppercase, letter-spacing .1–.13em, `muted` (table headers, group labels, form labels, crumb) |
| KPI value | mono 500, `clamp(20px,2vw,25px)` (Overview `clamp(22px,2.2vw,27px)`), −.03em |
| Money in lists | mono 13–14 / 500 |

**Every `<input>`, `<select>` and `<textarea>` is 16px** (iOS zoom rule).

---

## 3. Space, radius, elevation

- **Spacing:**
  - 4px base, steps 4 / 8 / 12 / 16 / 24 / 32.
  - Card padding 16–20.
  - Page padding 18–20 (desktop), 16 (tablet), 12 (phone).
  - Page max width 1400.
- **Radius:**
  - 6: segment item, small blocks.
  - 8: controls.
  - 12: cards, popovers.
  - 16: dialogs.
  - 999: chips and pills.
  - Extras seen in the design: 7 (small buttons), 9 (nav tiles), 10 (alerts, toasts), 14 (empty-state icon tile).
- **Elevation.** Borders do the work; shadow only lifts layers that float.

| Token | Value |
|---|---|
| `shadow-mq-card` | `0 1px 2px rgba(26,26,24,.04)` |
| `shadow-mq-sm` | `0 1px 2px rgba(26,26,24,.06)` |
| `shadow-mq-md` | `0 2px 4px rgba(26,26,24,.04), 0 8px 24px -12px rgba(26,26,24,.14)` |
| `shadow-mq-lg` (popover) | `0 18px 44px -18px rgba(26,26,24,.30)` |
| `shadow-mq-dialog` | `0 24px 60px -20px rgba(26,26,24,.4)` |
| `shadow-mq-drawer` | `-18px 0 44px -24px rgba(26,26,24,.2)` |
| `shadow-mq-toast` | `0 14px 36px -16px rgba(26,26,24,.5)` |
| focus ring | `0 0 0 3px rgba(133,13,51,.12)` |

---

## 4. Controls

Heights are 36–38 on desktop, **48 minimum on touch/tablet**.

**Buttons** (`ui/Button`)
- Base: radius 8, padding 0 14–16, 13.5 / 600, 7px icon gap.

| Variant | Background | Text | Border | Hover | Notes |
|---|---|---|---|---|---|
| primary | `cta` | `cream` | — | `primary` | shadow `0 1px 2px rgba(26,26,24,.10)` |
| secondary | white | `body` | `line` | bg `canvas`, border `line-2` | — |
| soft | `soft` | `primary` | — | `soft-2` | — |
| ghost | transparent | `muted` | — | bg `chip`, text `ink` | — |
| danger-soft | danger bg | danger text | danger line | `#F8DCD5` | — |
| danger (dialogs) | `#C8321F` | white | — | `#A62717` | put the amount in the label ("Void $31.00") |
| disabled | `canvas` | `disabled` | `line` | — | — |

- Sizes: 32 (card header), 36 (topbar, empty state), 38 (toolbar), 40 (dialog), 48 (login, touch).
- **Restricted actions are removed, not disabled** (`IfCan`).
- **Icon button:** 36–38 square, radius 8, white, 1px `line`, 16px icon, stroke 1.8, `muted`.

**Input / Select / Textarea** (`ui/Input`)
- 40 high (42 in dialogs and settings, 46 on login), 1px `line`, radius 8, white, padding 0 12, 16px text.
- Focus-within: border `focus` plus the ring.
- Label: overline 11 / 600 / .1em, `muted`.

**Segmented control** (`ui/Segmented`)
- Track `chip`, 1px `line`, radius 8, padding 3, gap 2.
- Item padding 7/13, radius 6, 13px.
- Active: white, `ink`, 600, shadow `0 1px 2px rgba(26,26,24,.08)`.
- Inactive: `on-tint`, 500.

**Underline tabs** (`ui/Tabs`)
- 14px, padding 10/14, min-height 40.
- Active: `primary`, 600, 2px bottom border. Inactive: `on-tint`, 500.

**Toggle** (`ui/Toggle`)
- Track 42×24, pill, `primary` when on, `line-2` when off.
- Knob 20px white, shadow `0 1px 2px rgba(26,26,24,.2)`.

**Chips**
- Filter chip: 30 high, pill, `soft` / `soft-line` / `primary`, with ✕.
- Selectable chip: 40 high, pill; active is solid `primary` with white text.

---

## 5. Status vocabulary

There are two axes, order status and payment status. The labels are exactly those in `components/admin/orders/orderUi.jsx`.

- Pill: padding 3/10 (2/9 inside tables), 12 / 600 (11.5 in tables), 6px dot, pill radius.
- A row or card can carry a **3px left rule** in the status colour.

| Label | Value | Tone | Notes |
|---|---|---|---|
| Awaiting | `pending` | warn | pulsing dot; counts toward the Orders badge |
| In kitchen / Unpaid | `open` | info | table, time open, Take payment |
| Completed / Paid | `confirmed` / pay `paid` | ok | the row recedes |
| Stuck payment | PaymentSession | danger | always sorted first; Recheck / Dismiss |
| Voided | `voided` | off | chip text struck through, row greyed |
| Declined | `declined` | white chip, `muted` text | — |
| On account / Refunded | payment | info / off | — |

---

## 6. KPI tile (`ui/Kpi`)

A KPI tile is always compared with the previous period and always drillable.

- **Card:** 1px `line`, radius 12, padding 16/17, gap 12, `shadow-mq-card`.
- **Grid:** `repeat(auto-fit, minmax(216px,1fr))` (180px on report pages).
- **Label:** 12.5 / 500 `muted`.
- **Delta pill:** 12 / 600, pill, padding 2/7, with an arrow.
  - up: `ok` text on `ok` bg
  - down: `danger` text on `danger` bg
  - flat: `on-tint` on `chip`
- **Value:** mono 500. **Footer:** 12px "vs $X previous 7 days".
- **Visual slot** (one of):
  - Sparkline: 2px `primary`; previous line 1.5px `line-2`, dashed 3 3.
  - Mini bars: 38px tall, gap 3, radius 2 2 0 0; inactive `soft-2`, current `primary`.
  - Progress bar: 6px on a `chip` track.
- **Needs-attention banner:**
  - `warn` bg and border, 32px icon tile `#B06A00`.
  - A title with a count, then pill buttons with mono counts.
  - Danger items use `danger` tones.

---

## 7. Table (`ui/Table`)

Tables have a sticky header, scroll inside their card, right-align money, and show row actions on hover.

- **Card:** `overflow-hidden`.
- **Header strip:** padding 13/16, `cream` bg, bottom border. Title 14 / 600, plus a mono count pill (`chip` / `chip-ink`) and 32px filter buttons.
- **`th`:**
  - sticky top 0, white
  - 11 / 600, uppercase, .1em, `muted`
  - padding 10/14, bottom border `line`, nowrap
- **`td`:** padding 11/14, bottom border `chip`, 13.5px.
  - Codes and receipt numbers: mono 12.5.
  - Money: mono, tabular, right-aligned.
- **Rows:**
  - Hover: `cream`.
  - Left rule: 3px in the status colour.
  - Voided row: `muted` text, amount struck through.
- **Row action:** text 12.5 / 600 `cta`.
- **Body max-height:** 340–480, scrolls inside the card.
- **Paging:** we use cursor paging. The footer bar (`cream`) shows "Showing N of TOTAL" and a Load more button (`ui/LoadMoreBar`). We don't use numbered pages.

---

## 8. Charts (`components/admin/reports/Charts.jsx`)

Solid line = this period. Dashed grey = previous period. Every series is clickable into its records.

- **Chart card:** padding 18, gap 14, title 14 / 600, subtitle 12.
- **Legend:**
  - Solid swatch 14×2, or dashed `prev`.
  - Category swatch 10×10, radius 3.
- **Line / area:**
  - grid `chip`, axis `line-2`
  - area `soft`, line `primary` 2.2, round caps
  - previous `prev` 1.8, dashed 4 4
  - hover marker: r4, white fill, 2.4 maroon stroke, plus a dashed guide
- **Bars:**
  - this period `primary`, others `soft-2`, radius 3 3 0 0
  - previous as a dashed `prev` line
- **Tooltip:**
  - `ink` bg, radius 8, padding 9/11
  - date as an overline at .6 opacity
  - rows with 7px dots and mono values
  - delta in `#8FD3B6`
- **Ranked horizontal bars:** 8px, radius 4, track `chip`, fills down the maroon ramp.
- **Donut:** r46, stroke 18, track `chip`. Centre shows a mono 17 / 500 value and a 9px overline label ("TAKINGS"). Top 5 plus "Other".
- **Axis ticks:** mono 10.5 `muted`.
- Categories use the maroon ramp first, then `info` `#1F6FB2`, `ok` `#0E7C5A`, violet `#6B5CA5` and warn `#B06A00`.

---

## 9. Feedback

Toasts are for outcomes, inline alerts for context, and dialogs for money.

- **Toast** (sonner, top-centre so it never covers the Register's Pay button):
  - `ink` bg, `cream` text, radius 10, padding 13/15, `shadow-mq-toast`
  - title 13.5 / 600, body 12.5 at .7 opacity
  - action `#E9A3B6`
  - success icon `#6ED3A6`
- **Inline alert** (`ui/Alert`, tones danger / warn / info / ok):
  - soft bg and border, radius 10
  - 17px icon, stroke 2.2
  - title 13.5 / 600, body 12.5 in the tone's text colour
  - optional action
- **Dialog** (`ui/Modal`):
  - Backdrop `rgba(26,26,24,.45)`, blur 3.
  - Panel radius 16, `shadow-mq-dialog`, width 440–560, max-height `100vh-32px`, animation `mq-in .2s`.
  - Head: padding 18/20/14, optional 34px icon tile (radius 10), title 15–16 / 600, text 13 `muted`.
  - Footer: top border `chip`, padding 14/20.
  - A destructive action sits on the left (danger-soft); Cancel and Submit sit on the right.
- **Drawer** (`ui/Drawer`):
  - Desktop (≥900px): a right side panel, 380px default, resizable 320–760, with a 10px drag handle (4×36 grip `#D5D5CF`; double-click resets). `shadow-mq-drawer`, animation `mq-slide .22s`.
  - Below 900px: a full-screen sheet.
  - Widths persist in localStorage `mq-panels`, read and written inside try/catch.

---

## 10. Empty, loading, no access

Every state names the next action.

- **Empty:**
  - padding 32/20, centred
  - 46px icon tile (radius 14, `chip`, 22px icon at stroke 1.6)
  - title 14.5 / 600, text 12.5 `muted`
  - one soft 36px button
- **Skeleton:**
  - `linear-gradient(90deg,#EFEFEA 25%,#F7F7F4 50%,#EFEFEA 75%)`, 200% size
  - `mq-shimmer 1.4s infinite`, radius 6–8
- **No access:**
  - `cream` card with a lock tile
  - text: "You don't have access to X". "Ask a manager to grant it in Settings › Staff access."
  - mono "role: cashier"
- **Period closed (409):** a danger alert. "Reopen the day in Cash & accounts › Day close."

---

## 11. Navigation and page anatomy

- **Sidebar** (236px, white, right border):
  - Head: 30px logo tile, "Maqaaxi Pos", and a collapse button.
  - Group labels: 10.5 / 600 / .13em uppercase.
  - Groups:
    - Home and Insights/System are fixed.
    - Sell, Money, Menu and Back office are **collapsible**. The chevron rotates −90° over .18s. The open state is saved per viewer.
  - Item: padding 8/10, radius 8, 13.5px, min-height 36 (48 on touch).
    - Active: `soft` bg, `primary` text, 600.
  - Badges: mono 11 / 600 pill. Orders: `#8A5300` solid. Tables: grey. Inventory: warn-soft.
  - Status dots are 7px (Cash: days not closed).
  - Footer: avatar (30px `deep`), name and role, Sign out (asks for confirmation).
  - Settings is **one link**. Its four sections are a left menu inside the page.
- **Icon rail:** 60px, 38px buttons (radius 9), 24×1 dividers, and 8px dot badges.
- **Phone:** the sidebar becomes a 264px overlay with a scrim `rgba(26,26,24,.42)`.
- **Topbar:**
  - sticky, min-height 60, bg `rgba(244,244,242,.88)` with blur 10
  - crumb as an overline above an 18px title
  - Live pill (ok tones, pulsing dot)
  - search (36px, ⌘K)
  - bell (36px, red dot)
  - "New order" primary button
- **Breakpoints:**

| Name | Width | Start state |
|---|---|---|
| phone | < 760 | drawer closed |
| tablet | 760–899 | icon rail |
| narrow | 900–1079 | icon rail |
| desktop | ≥ 1080 | full sidebar |

  Tailwind screens: `tab:` 760, `nar:` 900, `desk:` 1080.

- **Page anatomy** (top to bottom):
  1. Header (title and crumb in the topbar; period and primary action in the page toolbar).
  2. KPI strip: 3–5 numbers compared with the previous period.
  3. Toolbar: search, filters, view switch, export. **Filters:** one `Filters` control (`FiltersButton` + `FilterSelect` in `components/admin/reports/ReportKit.jsx`) sits beside the period control and holds every extra filter (category, people, account, channel, item, movement, role…); the active ones show as removable chips (`ActiveFilters`) under the toolbar. Never give a filter its own full-width row or a stand-alone select.
  4. Content, which scrolls inside its card.
  5. Detail: a right drawer on desktop, a sheet on smaller screens.
- **Test widths:** 1440, 1194, 834, 390.

---

## 12. Dark palette (future, not built)

The structure stays the same. Neutrals invert to warm tones, and the maroon lifts so it stays readable.

- **Ramp:** `#101012` · `#17171A` · `#1E1E22` · `#2A2A2E` · `#8A8A84` · `#D8D8D2` · `#F4F4F0`.
- **Primary button:** `#D9536F` with text `#17060B`.
- **Status:** text colour on a 14% fill with a 30% border.
  - Paid `#6ED6A8`
  - Awaiting `#E0A846`
  - Stuck `#E9745E`
  - In kitchen `#6AA6DE`

---

## 13. Motion

| Keyframes | Definition | Use |
|---|---|---|
| `mq-shimmer` | `to { background-position: -200% 0 }` | skeletons, 1.4s infinite |
| `mq-pulse` | opacity 1 → .3 → 1 | live and awaiting dots, 2s |
| `mq-in` | from opacity 0, translateY(6px) | popovers .15s, dialogs .2s |
| `mq-slide` | from translateX(16px), opacity 0 | drawer .22s |

All motion stops under `prefers-reduced-motion: reduce`.

---

## 14. Content rules (always)

- Money is shown as `$1,234.50` in mono. Order codes use the real `KFG-YYMMDD-NNNN` format from `serializeOrder`. Never show `Order.reference`.
- Labels come from data: account labels from Settings money accounts, people from `useStaffList`, categories and tags from the API. The design's mock names are only examples.
- "One number, one place." Before adding a KPI or chart, check which page owns that number. The allowed duplicates are listed in CLAUDE.md.
- Prices include tax. Never add a Tax row to a total; show "incl. tax X%" as a note.
