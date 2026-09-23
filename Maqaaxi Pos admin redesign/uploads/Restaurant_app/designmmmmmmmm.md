# Maqaaxi Pos — Multi-Tenant SaaS Design Spec

Design contract for the new SaaS surfaces: **superadmin dashboard**, **manager multi-restaurant dashboard + switcher**, **restaurant onboarding/CRUD**, and the **apex landing page**. Derived from the ui-ux-pro-max design database (SaaS product pattern: *Hero + Features + CTA* landing, *data-dense* dashboard, minimal/Swiss discipline) and the existing Maqaaxi brand system. Frontend work MUST follow this doc.

## 1. Brand tokens (already in `tailwind.config.js` — reuse, never redefine)

| Token | Value | Use |
|---|---|---|
| Primary maroon | `#850D33` (`--blue` legacy name) | Headers, active nav, links, focus rings |
| CTA maroon | `#A31743` (`green` legacy name) | Primary buttons, key CTAs |
| Deep maroon | `#6E0B2A` | Hover/pressed states, dark accents |
| Cream | `#FAFAF8` | Page background (public + landing) |
| Fonts | Cormorant Garamond (display), Inter (UI) | Display for hero/brand/big numbers, Inter for everything else |

The admin dashboard has its own semantic component classes in `globals.css` (`.jz`, `.side`, `.topbar`, `.nav-group`, `.nav-label`, `.btn .btn-primary`, `.icon-btn`, `.avatar`, `.tb-title`, card/table classes used by existing pages). **New admin/superadmin pages reuse these classes** — do not invent a parallel style system. Light + dark themes both exist (`data-theme`); every new surface must render correctly in both.

## 2. Global UX rules (from the skill database — binding)

1. **Accessibility**: text contrast ≥ 4.5:1 (check maroon-on-cream: `#850D33` on `#FAFAF8` passes); every icon-only button gets `aria-label`; sequential heading levels; visible focus rings (never `outline: none` without replacement).
2. **Touch**: interactive targets ≥ 44×44px, ≥ 8px apart. Mobile-first — most traffic is phones.
3. **Never color alone**: status (ACTIVE/SUSPENDED, paid/unpaid) always = color + label text or icon.
4. **Forms**: visible labels above fields (never placeholder-as-label); inline validation with the error text next to the offending field; helper text for non-obvious fields (subdomain, API keys); `font-size ≥ 16px` on every input (iOS zoom rule — project law).
5. **Navigation**: active nav item visually marked; URLs reflect state (deep-linkable pages, not modal-only flows); browser back always works.
6. **Feedback**: every mutation gets a loading state on its button and a success/error toast (sonner is already in the stack); no instant 0ms state jumps — 150–300ms transitions, `transform/opacity` only.
7. **Tables**: right-align numbers, left-align text; wrap wide tables in `overflow-x-auto`; skeleton or spinner while loading; explicit empty states with a next-action hint.

## 3. Restaurant switcher (manager, in the dashboard sidebar/topbar)

- Placement: directly under the brand block in the sidebar (`.side-head` area) — it is the highest-context decision a manager makes.
- Control: a select-style button showing the **active restaurant name** + chevron; opens a dropdown listing all owned ACTIVE restaurants plus a pinned **"All restaurants (combined)"** entry at top and **"+ New restaurant"** at bottom.
- The active choice persists in `localStorage` (`mx_restaurant`) and is sent as `x-restaurant-id` by the shared fetch wrapper. Default on first login: first owned restaurant; if none → redirect to onboarding.
- In "All restaurants" mode: pages that can aggregate (Overview, Insights) show combined data + a per-restaurant comparison table; pages that cannot (POS, Orders, Menu, Staff, Settings) show a slim inline notice "Select a restaurant to manage X" with the switcher focused — never a dead error screen.
- Staff (cashier/waiter) never see the switcher — their restaurant name renders as static text in the same slot (brand continuity, zero confusion).

## 4. Manager — Restaurants pages (`/admin/dashboard/restaurants`)

**List page**: card grid (1-col mobile → 2-col ≥760px → 3-col ≥1024px). Each card: logo (or placeholder initial), name (display font), `subdomain.maqaaxipos.com` as a copyable link, status pill (`ACTIVE` maroon-tinted / `SUSPENDED` gray + label), payments badge ("Payments configured ✓" / "No payment credentials ⚠" — icon + text), Edit button. Top-right page action: `+ New restaurant` (`.btn .btn-primary`).

**Onboarding form** (create): single column, max-w ~560px, grouped into three titled sections with progressive disclosure — don't overwhelm:
1. **Basics** — Name; Subdomain with live prefix UI (`[input] .maqaaxipos.com`), helper text "lowercase letters, numbers, hyphens", inline availability error on 409/reserved.
2. **Branding** — Logo upload (reuse existing upload flow), brand color picker (optional, default `#850D33`).
3. **Payments (Waafi)** — Merchant UID, API User ID, API Key. Password-type inputs. Helper: "Stored encrypted. Never shown again — re-enter to replace." Section is optional at creation (can be added later) but the list card shows the ⚠ badge until configured.

**Edit page**: same sections; subdomain shown read-only (change = support action); Waafi section shows only `hasWaafiCreds` state + "Replace credentials" fields; danger zone at bottom (suspend) styled with restraint — outline red button, confirm dialog.

## 5. Superadmin (`/superadmin`)

Reuses the same shell classes as the admin dashboard (sidebar + topbar) but with its own NAV: Overview, Managers, Restaurants, Activity. Brand block reads "Maqaaxi Pos · Platform" — no restaurant switcher, ever.

- **Overview**: stat tile row (4 tiles: Restaurants, Managers, Orders 30d, Revenue 30d) — big number in display font, small Inter label, subtle delta if available. Below: per-tenant activity table (restaurant, owner, subdomain, orders 30d, status) — aggregates only, no drill-down into tenant records.
- **Managers**: table (name, email, restaurants count, status pill, created) + `+ New manager` action → modal/inline form (name, email, temp password with generate button). Row actions: Suspend/Activate (confirm dialog; explains staff+subdomain lockout consequence).
- **Restaurants**: read-only table (name, subdomain link, owner, status, orders count, created) + Suspend/Activate action.
- **Activity**: paginated log table (time, actor, restaurant, action, entity) with a load-more cursor; monospace-ish small text is fine, still ≥ 12px.

## 6. Apex landing page (`/`)

Pattern: **Hero + Features + CTA** (SaaS default from the design DB), single scroll page, cream background, generous whitespace:
1. **Hero**: logo, display-font headline ("Your restaurant's menu, orders & POS — on your own subdomain"), one-line sub, primary CTA `Staff & manager login` (+ optional secondary "See a demo menu" → demo subdomain if configured).
2. **Features** (3 cards): QR digital menu · Full POS + staff roles · Multi-restaurant dashboard. Icon + title + 1 line each. SVG icons only (reuse the dashboard's inline-SVG style — no emoji).
3. **Footer**: brand, "powered by Maqaaxi Pos", minimal links.
Keep it fast and static — no client JS beyond the links.

## 7. Component conventions for new code

- Buttons: `.btn .btn-primary` (CTA maroon), `.btn` neutral; destructive = outline + red text, always behind a confirm.
- Status pills: shared small component pattern — `rounded-full px-2.5 py-0.5 text-xs font-semibold` + tint background + **text label**.
- Stat tiles, cards, tables on new pages: match the Overview/Insights pages' existing markup patterns (copy their class usage; don't restyle).
- Modals: only for short single-step actions (create manager); anything longer is a page with a URL.
- Loading: skeleton rows for tables, spinner-in-button for submits; empty states = icon + one sentence + primary action.
- All new admin fetches go through `src/lib/adminFetch.js` (injects `x-restaurant-id`, handles 401 → login redirect).

## 8. Pre-delivery checklist (run per page)

- [ ] Mobile 360px, tablet 760px, desktop 1024px+ all clean (no horizontal scroll)
- [ ] Dark theme verified (`data-theme="dark"`)
- [ ] Focus visible + tab order logical; icon buttons have `aria-label`
- [ ] Status conveyed by text+color, never color alone
- [ ] Inputs ≥ 16px font; targets ≥ 44px
- [ ] Loading, error, and empty states all present
- [ ] Toast on every mutation success/failure
