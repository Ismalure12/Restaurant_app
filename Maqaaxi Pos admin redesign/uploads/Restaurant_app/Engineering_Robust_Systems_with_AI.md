# Engineering Robust Enterprise Systems with AI

> **A field manual for the AI-first engineer** — Goodir Technology
> System design, security, scaling, testing & agentic engineering — the judgment you need to direct AI and still own what ships.
> Prepared for Goodir · PERN stack (PostgreSQL · Express · React · Node) · Self-contained course & reference

---

## What this course covers

Read it once front-to-back to build the mental model; keep it open as a reference and checklist while you and your agents build. Every part ends with how to direct and verify AI on that topic.

| Part | Topic | Covers |
|---|---|---|
| 1 | From Coder to Architect — the AI-First Mindset | Why understanding still matters · the trust-but-verify loop · how to read code you didn't write · failure modes of "leap of faith" |
| 2 | System Design Fundamentals | Requirements → architecture · modular monolith vs microservices · the request lifecycle · API contracts · statelessness |
| 3 | Database Engineering — where most "slow" comes from | Modelling · indexing · EXPLAIN ANALYZE · the N+1 trap · transactions · connection pooling · safe migrations |
| 4 | Backend Robustness | Layered architecture · validation · error handling · idempotency · caching · background jobs · rate limiting |
| 5 | Security You Cannot Skip | OWASP Top 10 in PERN · authN vs authZ · JWT & refresh rotation · injection, XSS, CSRF · secrets |
| 6 | Testing as Your Safety Net | The pyramid · what to test · tests as the contract you give the AI · integration tests with a real database |
| 7 | Scaling & Performance | Scale up → out → split · load balancing · read replicas · queues · the numbers every engineer should know |
| 8 | Production & Operations | CI/CD gates · environments · health checks · observability · backups & disaster recovery · incidents |
| 9 | Agentic Engineering — doing all of this through AI | Specifying work · decomposition · the verification loop · reviewing AI code · ADRs · prompt patterns |
| 10 | Capstone: A Reference Architecture + 90-Day Plan | Putting it together · the production-readiness checklist · a concrete path to mastery |

---

# PART 1 — From Coder to Architect

*Your job didn't disappear when you stopped typing the code — it moved up a level. This part is about that level.*

You told me the truth most engineers won't say out loud: you set up the database and the repo, you tell Claude what to do, and you take it on faith. The worry that follows — "is this efficient, secure, scalable enough for an enterprise system?" — is not a beginner's worry. It is the exact question a senior engineer asks about every pull request, whether a human or an AI wrote it.

So this course is not going to send you back to memorising syntax. It is going to give you the thing that actually separates a junior from a principal engineer: **judgment about systems**. The ability to look at a design or a diff and know what will break at 10,000 users, where the security hole is, and which "it works" is hiding a time bomb. With that judgment, AI becomes a force multiplier. Without it, AI just lets you generate bugs faster than you can find them.

## The role swap, stated plainly

A pilot doesn't fly a modern jet by manually adjusting control surfaces — the autopilot does that. But the pilot is still fully responsible for the flight, knows what every instrument means, and can take over the instant something is wrong. That is your job now. **You are pilot, not engine.** The autopilot (the AI) is fast and tireless and occasionally, confidently, catastrophically wrong.

**The loop you live in now:**

1. **SPECIFY** — context · constraints · done-criteria
2. **GENERATE** — AI writes code in small steps
3. **VERIFY** — tests · types · lint · YOU review
4. **INTEGRATE** — merge · deploy · observe · learn

You own steps 1, 3, and 4 — specification, verification, and integration. The AI owns step 2. Most disasters come from teams that only do step 2. *You stay the architect + reviewer.*

## What AI is genuinely great at — and what it quietly fails at

| AI is reliably strong at | AI is unreliable at — you must verify |
|---|---|
| Boilerplate, CRUD endpoints, glue code | **Authorization logic** — "can this user do this?" It will happily write an endpoint with no ownership check. |
| Translating a clear spec into working code | **Performance at scale** — it writes code that works on 10 rows and melts on 10 million (the N+1 problem, missing indexes). |
| Explaining code, writing tests, refactoring | **Security boundaries** — trusting input, leaking secrets, weak token handling, over-permissive CORS. |
| Known patterns it has seen thousands of times | **Your specific business invariants** — "an appointment can't be double-booked" is your rule; it can't infer it. |
| Suggesting libraries and approaches | **Knowing when it's wrong** — it states wrong answers with the same confidence as right ones. |

Notice the pattern: AI is strong on the mechanical and weak on the **contextual** and the **adversarial**. The whole rest of this course is teaching you to supply the context and think adversarially — because that is precisely the gap.

## You do have to read code again — but not the way you think

You don't need to read every line the way you'd write it from scratch. You need to **review** — a different, faster skill. A reviewer scans a diff with a mental checklist and pattern-matches for danger, not for elegance. After this course you'll be able to open a 200-line AI-generated PR and within two minutes ask the five questions that matter:

1. Where does untrusted input enter, and is it validated at that boundary?
2. Is every data access **authorized** for the current user — not just authenticated?
3. Does any database call run inside a loop? (The single most common performance killer.)
4. What happens on the error path — is the failure swallowed, logged, and does it leak anything?
5. Is there a test that would fail if this logic broke?

> **◆ The one habit that changes everything**
> Never accept code you can't explain back in one sentence. If you can't say "this endpoint lets a logged-in patient cancel only their own appointment, and rejects everything else", you don't yet understand it well enough to ship it. Ask the AI to explain it until you can. That sentence is your spec, your test, and your review criterion all at once.

## The failure modes of a pure 'leap of faith'

These are the real ways AI-built systems fail in production. You will recognise each one again in later parts — this is the map of where the bodies are buried.

**The bug you cannot see by "it works":**

```js
// 1) The missing authorization check — looks fine, is a data breach.
//    AI wrote: "get an appointment by id". It did exactly that.
app.get("/appointments/:id", auth, async (req, res) => {
  const appt = await prisma.appointment.findUnique({ where: { id: req.params.id } });
  res.json(appt);                       // ❌ ANY logged-in user reads ANY appointment
});

// What it must be: scope every read to the caller.
app.get("/appointments/:id", auth, async (req, res) => {
  const appt = await prisma.appointment.findFirst({
    where: { id: req.params.id, patientId: req.user.id },   // ✓ ownership enforced
  });
  if (!appt) return res.status(404).json({ error: "not_found" });
  res.json(appt);
});
```

**The performance bomb:**

```js
// 2) The N+1 query — works on demo data, dies under load.
const doctors = await prisma.doctor.findMany();
for (const d of doctors) {
  d.hospital = await prisma.hospital.findUnique({ where: { id: d.hospitalId } });
}                                         // ❌ 1 + N queries (501 round-trips for 500 doctors)

// Fix: let the database do the join, once.
const doctors = await prisma.doctor.findMany({ include: { hospital: true } }); // ✓ 1 query
```

Other classics you'll learn to catch: secrets hard-coded instead of read from the environment; errors caught and silently dropped so failures are invisible; no input validation so a malformed request crashes the process; unbounded queries with no pagination; and dependency sprawl that drags in vulnerable packages. None of these throw an error in development. All of them are found by **judgment plus tooling**, which is what you're building here.

> **⚙ How to use this course with your agents**
> Each part ends with a **Directing & Verifying** box: the prompts that get good output, and the checks that catch bad output. Treat the checklists in Part 10 as literal review gates — paste them to your agent as acceptance criteria before it writes code, and run through them yourself before you merge. The goal is that nothing reaches production on faith alone; it reaches production because it passed a gate.

---

# PART 2 — System Design Fundamentals

*Before any code exists, the shape of the system is decided. Get the shape right and everything downstream gets easier.*

## Start with requirements — and don't skip the boring half

Every system has two kinds of requirements. **Functional requirements** are what it does ("a patient can book an appointment"). **Non-functional requirements (NFRs)** are the constraints it must satisfy while doing it — and this is where "enterprise" actually lives. NFRs are the difference between a school project and a system a ministry will run for ten years.

| NFR | The question it answers | Example target |
|---|---|---|
| Performance | How fast, under what load? | p95 API response < 300 ms at 100 req/s |
| Availability | How much downtime is acceptable? | 99.9% (~8.7 h/year) |
| Scalability | What's the growth path? | 10× users without re-architecting |
| Security | What must never leak or be tampered with? | PII encrypted, audited access |
| Durability | Can we lose data? How much? | RPO ≤ 5 min, RTO ≤ 1 h |
| Maintainability | Can a new dev (or agent) safely change it? | tests + docs + clear layering |

Write these down for every project, even a one-page version. They are the questions you'll later ask the AI to satisfy. "Build me a booking API" produces mediocre output; "Build me a booking API where no patient can ever read another patient's data, p95 under 300ms, and every write is in a transaction" produces something you can ship.

## Back-of-the-envelope: think in numbers before you build

You don't need to be precise; you need to be in the right order of magnitude. A municipal portal serving a city of 400,000 with maybe 5,000 daily active users and 50 requests per second at peak is a single modest server problem — not a microservices problem. Knowing this stops you from over-engineering (the most common way small teams waste months) and from under-provisioning. A useful reflex: **estimate daily users → peak requests/second → data growth per year.** If those numbers are small, keep the architecture small.

> **⚠ The number-one architecture mistake for a small team**
> Choosing microservices because it sounds enterprise. Microservices solve an *organisational* problem (many teams shipping independently), not a technical one, and they multiply your operational burden — now you have network calls, distributed transactions, and five things to deploy and monitor instead of one. For Goodir-sized projects the right default is almost always a **modular monolith**: one deployable app, cleanly separated inside into modules. You get most of the structure with a fraction of the pain, and you can extract a service later if a real bottleneck proves you need to.

## Choosing an architecture style

| Style | Use it when | Cost |
|---|---|---|
| **Modular monolith** | Almost always, for a small team. One Express app, internal modules (auth, billing, appointments) with clear boundaries. | Low. Your default. |
| **Microservices** | Multiple teams need to deploy independently, or one component has a wildly different scaling profile. | High ops + complexity. |
| **Serverless functions** | Spiky, event-driven workloads; you want zero idle cost. | Cold starts, harder local dev, vendor lock-in. |

## The anatomy of a PERN request

This is the spine of every backend you'll build. Memorise the order — it's also the order in which things should **fail fast**. Reject a bad request as early and as cheaply as possible.

**A single request, end to end:**

1. **Edge / LB** receives HTTPS, terminates TLS, routes to a healthy app instance
2. **Middleware:** request-id, CORS, security headers, body parse, rate-limit check (Redis)
3. **AuthN** — verify JWT / session; **AuthZ** — does this user have permission for this action?
4. **Validation** — schema-check & coerce input (zod) at the boundary; reject early
5. **Controller → Service** (business logic) **→ Repository** (data access, transactions)
6. **DB query** (parameterised) · cache read/write · enqueue background jobs
7. **Serialise response** (no secrets/over-fetching), set status code, structured log line

Each stage is a place where a check belongs. Authorization comes before validation comes before business logic comes before the database.

**The production shape of even a "simple" system:**

```
Clients — Browser (React) / Mobile (React Native)
        ↓
CDN + Load Balancer (TLS termination)
        ↓
Node/Express #1 · #2 · #3   (stateless)
   ↓            ↓             ↓
Redis (cache · sessions · rate-limit)
PostgreSQL (primary) + read replicas
Job Queue (email · reports · webhooks) → Worker processes
Observability — structured logs · metrics · traces · alerts
```

Statelessness in the app tier is what makes horizontal scaling possible.

## Statelessness: the property that unlocks scaling

An app server is **stateless** when any request can be handled by any instance, because the server keeps no per-user memory between requests. Session data lives in Redis or a signed token, not in a variable on one machine. This sounds abstract until you scale out: if instance #2 holds a user's session in memory, a load balancer sending their next request to instance #3 logs them out. Statelessness is what lets you run three identical copies behind a load balancer and add a fourth under load without anyone noticing.

```js
// ❌ Stateful — breaks the moment you run more than one instance
let loginAttempts = {};                 // lives in THIS process's memory only
app.post("/login", (req, res) => {
  loginAttempts[req.ip] = (loginAttempts[req.ip] || 0) + 1;
  // instance #2 has no idea this IP is being brute-forced
});

// ✓ Stateless — shared state lives in Redis; every instance sees the same truth
app.post("/login", async (req, res) => {
  const key = `login:${req.ip}`;
  const attempts = await redis.incr(key);
  if (attempts === 1) await redis.expire(key, 900);   // 15-min window
  if (attempts > 5) return res.status(429).json({ error: "too_many_attempts" });
});
```

## API design: the contract is the product

Your API is a promise to every client (your React app, your React Native app, future integrations). A good REST API is predictable: resources are nouns, HTTP verbs are the actions, status codes mean what they say, and errors have one consistent shape. Predictability is what lets clients — and your future self, and the AI — reason about it without re-reading the code.

| Verb | Path | Meaning | Success code |
|---|---|---|---|
| GET | /appointments | list (paginated, filtered) | 200 |
| POST | /appointments | create one | 201 + Location |
| GET | /appointments/:id | read one | 200 / 404 |
| PATCH | /appointments/:id | partial update | 200 |
| DELETE | /appointments/:id | remove / cancel | 204 |

> **◆ Pick one error shape and never deviate**
> Every error your API returns should look the same, so clients write one handler instead of ten. A machine-readable code, a human message, and optional field-level details. Decide it once, put it in a shared error handler, and the AI will follow the pattern for every new endpoint.

```js
// One consistent error shape, produced by one central handler.
// { "error": { "code": "validation_failed", "message": "...", "details": {...} } }
function errorHandler(err, req, res, next) {
  const status = err.statusCode || 500;
  // Log the full error server-side WITH the request id; never send internals to the client.
  req.log.error({ err, requestId: req.id }, "request_failed");
  res.status(status).json({
    error: {
      code: err.code || "internal_error",
      message: status === 500 ? "Something went wrong" : err.message, // don't leak stack traces
      details: err.details,
      requestId: req.id,            // so a user can quote it in a support ticket
    },
  });
}
app.use(errorHandler);              // mounted last, catches everything
```

Three more contract rules that prevent real pain: **version your API** (prefix routes with `/v1`) so you can evolve without breaking existing mobile apps that users haven't updated; **paginate every list** (never return an unbounded array — it's a performance and memory bomb waiting for the table to grow); and **make writes idempotent** where you can, so a client that retries after a dropped connection doesn't create two appointments. (Deeper on idempotency in Part 4.)

> **⚙ Directing & Verifying — system design**
> **Direct:** Before any code, ask the AI to produce a one-page design: the NFR targets, the data entities and their relationships, the API endpoints with their error shape, and the trade-offs of two alternative approaches. Make it defend the choice. This is a cheap, fast document and it catches bad decisions before they cost you weeks.
> **Record it:** Save that as an Architecture Decision Record (ADR) — a short markdown file per significant decision: context, options, decision, consequences. ADRs are how you keep a coherent mental model of a system you didn't hand-write, and how the next agent session picks up where the last left off.
> **Verify:** Does every list endpoint paginate? Is there exactly one error shape? Is the app tier stateless (no per-user data in module-level variables)? Is anything microservice-shaped that a monolith would do more simply?

---

# PART 3 — Database Engineering

*When someone says an app is 'slow', it is the database roughly 90% of the time. This is the highest-leverage chapter in the book.*

You can write flawless application code and still have a system that collapses, because the database is the one component you can't just scale by adding more copies. PostgreSQL is superb — but it does exactly what you ask, including the slow thing. Your job is to ask well.

## Model the data correctly first

Good schema design is mostly one idea: **store each fact once** (normalization), and connect facts with foreign keys. If a doctor's hospital name is copied into every appointment row, renaming the hospital means updating thousands of rows and risking inconsistency. Instead, store the hospital once and reference it by id. The database enforces the relationship for you.

**A normalized schema for the booking domain** (each entity stored once; relationships as foreign keys; the high-traffic query supported by a deliberate index):

```
users:        id (PK, uuid) · email (UNIQUE) · password_hash · role (enum) · created_at (timestamptz)
hospitals:    id (PK, uuid) · name · city · created_at
doctors:      id (PK, uuid) · full_name · specialty · hospital_id (FK) · active (bool)
appointments: id (PK, uuid) · patient_id (FK→users) · doctor_id (FK) · hospital_id (FK)
              · starts_at (timestamptz) · status (enum) · price_cents (int)

Relationships: hospitals 1─N doctors · doctors 1─N appointments · users 1─N appointments
Every foreign key is indexed. status+starts_at carry a composite index for the common calendar query.
```

> **◆ Three schema rules that pay for themselves**
> 1. **Every foreign key gets an index** — Postgres does not create one automatically, and joins on un-indexed FKs are a top cause of slowness.
> 2. **Use the right types:** `timestamptz` for time (never a string), `numeric` or integer cents for money (never floats — 0.1 + 0.2 ≠ 0.3), real enums for fixed sets.
> 3. **Add database-level constraints** (UNIQUE, NOT NULL, CHECK). They are your last line of defense when application code — or an AI — forgets a rule.

## Indexes: the single biggest performance lever

An index is to a table what the index at the back of a book is to its pages: instead of reading every page to find a topic, you jump straight to it. Without an index, finding one appointment in a million-row table means Postgres reads all million rows (a "sequential scan"). With an index on the column you filter by, it reads a handful. The cost: indexes take space and slightly slow down writes (the index must be updated too). The rule of thumb: **index the columns you filter, join, or sort by; don't index everything.**

```sql
-- The query your calendar screen runs constantly:
SELECT * FROM appointments
WHERE doctor_id = $1 AND starts_at >= $2
ORDER BY starts_at;

-- A composite index that matches it exactly. Column order matters:
-- put the equality column (doctor_id) first, the range column (starts_at) second.
CREATE INDEX idx_appt_doctor_time ON appointments (doctor_id, starts_at);
-- Now Postgres can seek directly to this doctor's rows, already in time order.
```

## Read the database's mind: EXPLAIN ANALYZE

This is the one database skill that will make you dangerous. `EXPLAIN ANALYZE` tells you exactly how Postgres ran a query — whether it used your index, how many rows it touched, and how long each step took. You don't guess about performance; **you measure it**. When an AI writes a query and you wonder if it's efficient, you don't argue with it — you run `EXPLAIN ANALYZE` and read the verdict.

```sql
EXPLAIN ANALYZE
SELECT * FROM appointments WHERE doctor_id = 'abc' AND starts_at >= now();

-- ❌ BAD — the words you do NOT want to see on a big table:
--   Seq Scan on appointments  (cost=0.00..18234  rows=1  ... actual time=142ms)
--   "Seq Scan" = it read the whole table. Add an index.

-- ✓ GOOD — after creating idx_appt_doctor_time:
--   Index Scan using idx_appt_doctor_time  (... actual time=0.08ms)
--   "Index Scan" + sub-millisecond = it jumped straight to the rows.
```

> **→ What to look for in the output**
> **Seq Scan** on a large table you filter often → you're probably missing an index. **Rows removed by filter** is huge → the index isn't selective or isn't used. **Nested Loop** with a big inner count → possible N+1-style join blow-up. You don't need to master the planner — just learn to spot a full-table read where there shouldn't be one.

## The N+1 problem — the bug AI loves to write

You met it in Part 1; here's why it's so dangerous. The code looks completely reasonable — a loop that fetches related data — and it's fast in development because dev data is tiny. Then real data arrives and each page load fires hundreds of database round-trips. ORMs like Prisma make it especially easy to write by accident, because the database call hides inside an innocent-looking property access or loop.

```js
// ❌ N+1: one query for the list, then one MORE per item. 1 + N total.
const appts = await prisma.appointment.findMany({ where: { hospitalId } });
const out = [];
for (const a of appts) {
  const doctor  = await prisma.doctor.findUnique({ where: { id: a.doctorId } });  // +1 each
  const patient = await prisma.user.findUnique({ where: { id: a.patientId } });   // +1 each
  out.push({ ...a, doctor, patient });
}
// 200 appointments → 401 queries. This is the "why is it slow?" you'll hit most.

// ✓ Fix: ask for the related data up front; the ORM emits efficient joined queries.
const appts = await prisma.appointment.findMany({
  where: { hospitalId },
  include: { doctor: true, patient: true },     // resolved together, not in a loop
});
```

> **⚙ The review reflex that catches 90% of slow code**
> When you read any AI-generated data-access code, scan for **a database call inside a loop** — an `await prisma...` or `await db...` inside a `for`, `map`, or `forEach`. That single pattern is the most common performance defect in AI output. Ask the agent: "does this issue one query or one-per-row? rewrite to a single query with a join."

## Transactions: all-or-nothing for related writes

Some operations must happen completely or not at all. Booking an appointment might mean: insert the appointment, decrement the doctor's available slots, and create a payment record. If the server crashes after step 2, you have a corrupt state — a slot consumed with no appointment. A **transaction** wraps these so they commit together or roll back together. The database guarantees you never see a half-finished state.

```js
// All three writes succeed together, or none of them apply.
await prisma.$transaction(async (tx) => {
  const appt = await tx.appointment.create({ data: { patientId, doctorId, startsAt } });
  await tx.doctorSlot.update({
    where: { id: slotId },
    data: { remaining: { decrement: 1 } },
  });
  await tx.payment.create({ data: { appointmentId: appt.id, amountCents } });
  // If any line throws, Prisma rolls the whole thing back automatically.
});
```

Closely related: **race conditions**. If two patients book the last slot at the same moment, naive code can sell it twice. The transaction above with an atomic decrement plus a `CHECK (remaining >= 0)` constraint — or a conditional update that only succeeds when a slot is free — is how you make concurrent booking safe. This is exactly the kind of business invariant the AI cannot infer; **you have to state it**.

## Connection pooling: don't open a new door for every guest

Opening a database connection is expensive, and Postgres has a hard limit on how many it allows (often ~100). If every request opens its own connection, a traffic spike exhausts the limit and the whole app starts erroring with "too many connections". A **connection pool** keeps a small set of reusable connections; requests borrow and return them. On serverless platforms this is critical — each function instance can otherwise hold its own connections and overwhelm the database. The standard answer is a pooler like **PgBouncer** (or your provider's built-in pooler, e.g. Supabase/Neon pooling, Upstash for Redis).

> **⚠ The serverless connection trap**
> If you deploy Express or API routes to a serverless platform (Vercel, Lambda) and connect Prisma straight to Postgres, a burst of traffic spins up many instances that each grab connections and exhaust the limit — an outage that only appears under load, never in testing. The fix is to connect through a **pooler endpoint** and keep one Prisma client per instance. This is a known footgun the AI won't warn you about unless you ask.

## Migrations: change the schema without breaking production

A migration is a versioned, repeatable change to your schema, checked into git like code. Prisma Migrate generates them from your schema file. Two rules keep them safe: **migrations run automatically in CI/CD before the new code deploys** (never edit the production schema by hand), and **destructive changes are done in expand-then-contract steps** — add the new column, deploy code that writes to both old and new, backfill, then later remove the old column. Dropping a column in one step while old code still reads it is a self-inflicted outage.

> **⚙ Directing & Verifying — databases**
> **Direct:** Hand the AI the actual queries your screens need, and ask it to design the schema and the indexes to match those queries. Ask explicitly: "which indexes does this query need, and show me the EXPLAIN ANALYZE plan."
> **Verify:** (1) Every foreign key indexed? (2) Any DB call inside a loop? (3) Are multi-step writes wrapped in a transaction? (4) Money stored as integer cents or numeric, not float? (5) Does a list endpoint have a LIMIT? (6) Did the migration get reviewed for destructive steps? Run EXPLAIN ANALYZE on your top three queries with realistic data volume — not ten rows.

---

# PART 4 — Backend Robustness

*Robust means: predictable under bad input, honest about failure, and fast under repeated load. These are the patterns that get you there.*

## Layer your code so each part has one job

The most maintainable backends separate three concerns. The **controller** deals only with HTTP — read the request, call a service, shape the response. The **service** holds your business logic and knows nothing about HTTP. The **repository** is the only code that touches the database. This isn't ceremony: it means your business rules are testable without a web server, your data layer can be optimised without touching logic, and an AI can change one layer without risking the others.

```
Route / Controller     — HTTP only: parse request, call service, shape response. No business rules.
Service (business)     — The rules of your domain. Pure, testable, framework-agnostic. Owns transactions.
Repository (Prisma)    — The only layer that talks to the database. Hides query details from the rest.
PostgreSQL
```

Each layer depends only on the one below it. Business rules live in the middle, isolated from both HTTP and SQL — which is exactly what makes them easy to test and hard to break.

```js
// controller — HTTP only
async function cancelAppointment(req, res) {
  const result = await appointmentService.cancel(req.params.id, req.user.id);
  res.status(200).json(result);
}

// service — the business rules. No req/res here. Pure, testable.
async function cancel(appointmentId, userId) {
  const appt = await appointmentRepo.findOwnedBy(appointmentId, userId);
  if (!appt) throw new AppError("not_found", 404);
  if (appt.startsAt < addHours(new Date(), 24))         // YOUR invariant, stated explicitly
    throw new AppError("too_late_to_cancel", 409, "Cancellations need 24h notice");
  return appointmentRepo.markCancelled(appointmentId);
}

// repository — the only place that knows about Prisma
function findOwnedBy(id, userId) {
  return prisma.appointment.findFirst({ where: { id, patientId: userId } });
}
```

## Validate at the boundary — trust nothing from outside

Every byte that arrives from a client is hostile until proven otherwise — not because your users are malicious, but because bugs, old app versions, and attackers all send malformed data. Validation at the edge means a bad request is rejected with a clean 400 **before** it can reach your logic or your database. Use a schema validator (**zod** is the PERN standard) so the rule is declared once and enforced consistently.

```js
import { z } from "zod";

const createAppointment = z.object({
  doctorId:  z.string().uuid(),
  startsAt:  z.coerce.date().min(new Date(), "must be in the future"),
  notes:     z.string().max(500).optional(),
});

// Reusable middleware: validate, coerce, and reject early with your standard error shape.
const validate = (schema) => (req, res, next) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: { code: "validation_failed", details: parsed.error.flatten().fieldErrors },
    });
  }
  req.body = parsed.data;          // now strongly shaped & safe to use downstream
  next();
};

app.post("/v1/appointments", auth, validate(createAppointment), createAppointment_ctrl);
```

## Handle errors honestly — the silent catch is the enemy

The worst error handling isn't a crash; it's a crash that pretends nothing happened. A catch block that swallows the error and returns 200 turns a clear failure into a silent data-corruption mystery you'll debug for days. Distinguish two kinds: **operational errors** (expected — bad input, not found, conflict; handle gracefully) and **programmer errors** (bugs — let them surface loudly, log with full context, and don't leak internals to the client).

```js
// ❌ The silent catch — looks defensive, is actually a cover-up.
try { await chargePayment(appt); }
catch (e) { /* ignore */ }          // money may have failed; nobody will ever know

// ✓ Catch the specific thing you can handle; rethrow what you can't.
try {
  await chargePayment(appt);
} catch (e) {
  if (e.code === "card_declined") throw new AppError("card_declined", 402);
  req.log.error({ err: e, apptId: appt.id }, "charge_failed");   // log with context
  throw e;                                                       // don't hide a real bug
}
```

## Idempotency: make retries safe

Networks drop. A client sends "create appointment", the response is lost, the client retries — and now there are two appointments. **Idempotency** means doing the same operation twice has the same effect as doing it once. The standard technique: the client sends an `Idempotency-Key` header; the server records it and, if it sees the same key again, returns the original result instead of acting twice. This is **non-optional for anything involving money**.

```js
async function createWithIdempotency(req, res) {
  const key = req.header("Idempotency-Key");
  if (key) {
    const seen = await redis.get(`idem:${key}`);
    if (seen) return res.status(200).json(JSON.parse(seen));   // replay the first result
  }
  const appt = await appointmentService.create(req.body, req.user.id);
  if (key) await redis.set(`idem:${key}`, JSON.stringify(appt), "EX", 86400);
  res.status(201).json(appt);
}
```

## Caching: stop asking the database the same question

If a hundred users request the list of hospitals every minute and it changes once a week, asking Postgres every time is waste. A cache (Redis) stores the answer so most requests never touch the database. The dominant pattern is **cache-aside**: check the cache; on a miss, read the database and populate the cache with a TTL (time-to-live) so stale data eventually expires. The hard part of caching is **invalidation** — when the underlying data changes, the cached copy must be refreshed or deleted.

```
App → 1. GET key → Redis
      2a. HIT  → return
      2b. MISS → query PostgreSQL → 3. SET key (TTL) → 4. return to client
```

The application, not the database, owns the cache. On write, update DB then invalidate/refresh the key. **Always set a TTL** so a forgotten invalidation can't serve stale data forever.

```js
async function getHospitals() {
  const cached = await redis.get("hospitals:all");
  if (cached) return JSON.parse(cached);                 // fast path: no DB hit
  const hospitals = await prisma.hospital.findMany();    // miss: read source of truth
  await redis.set("hospitals:all", JSON.stringify(hospitals), "EX", 3600); // 1h TTL
  return hospitals;
}
// On any write to hospitals, invalidate: await redis.del("hospitals:all");
```

> **⚠ Cache the right things, and never trust it blindly**
> Cache data that is **read often and changes rarely** (reference lists, public content). Be very careful caching per-user data — a cache key collision that serves one user's data to another is a serious breach. And never cache something as the source of truth: the database is the truth, the cache is a disposable copy that must survive being wiped at any moment.

## Background jobs: don't make the user wait for slow work

Sending a confirmation email, generating a PDF, calling a slow third-party API — these should not happen inside the request the user is waiting on. Push them onto a **queue** and return immediately; a separate **worker** process picks them up. This keeps your API fast, lets you retry failures automatically, and smooths out spikes (the queue absorbs a burst the workers drain steadily). For Node, **BullMQ** on Redis is the common choice.

```js
// In the request: enqueue and return fast.
await emailQueue.add("appointment_confirmation",
  { to: patient.email, apptId: appt.id },
  { attempts: 3, backoff: { type: "exponential", delay: 5000 } });   // auto-retry on failure
res.status(201).json(appt);          // user gets an instant response

// In a separate worker process: do the slow work, with retries handled for you.
new Worker("email", async (job) => {
  await resend.emails.send(buildConfirmation(job.data));
});
```

## Rate limiting: protect yourself from abuse and accidents

Without a limit, one buggy client in a loop — or one attacker — can hammer your API into the ground. Rate limiting caps how many requests an IP or user can make in a window. Because your app is stateless and multi-instance, **the counter must live in Redis, not in memory** (you saw why in Part 2). Apply stricter limits to expensive or sensitive endpoints like login and password reset.

> **⚙ Directing & Verifying — backend robustness**
> **Direct:** Give the AI the layering as a rule ("controllers call services, services call repositories, only repositories touch Prisma") and the standard error/validation middleware as patterns to follow. State your business invariants explicitly — they're the part it can't guess.
> **Verify:** Is input validated at the boundary before use? Are there any empty or swallowing catch blocks? Do money/booking operations use transactions and idempotency? Is slow work (email, PDF, external calls) off the request path? Is rate limiting backed by Redis, not memory?

---

# PART 5 — Security You Cannot Skip

*Security isn't a feature you add; it's a property of how you build. For government and client systems it's the difference between trust and a headline.*

AI is at its weakest exactly where security lives: it trusts input, it forgets authorization, and it states insecure code as confidently as secure code. So this is the part where your verification matters most. You don't need to memorise every attack — you need the small set of habits that close the doors attackers actually use.

## The OWASP Top 10, translated to your stack

| Risk | In your app it looks like | Defense |
|---|---|---|
| Broken access control | A user changes an id in the URL and reads someone else's data | Scope every query to the caller; check ownership, not just login |
| Injection (SQL) | Input concatenated into a query string | Parameterised queries always; the ORM does this if you don't bypass it |
| Cryptographic failures | Plain-text passwords; secrets in code; no HTTPS | Hash passwords (argon2/bcrypt); TLS everywhere; secrets in env |
| Security misconfiguration | Open CORS, verbose error stacks, default credentials | Locked-down CORS, security headers, no internals leaked |
| Vulnerable dependencies | An old npm package with a known CVE | `npm audit` in CI; keep deps current |
| Identification/auth failures | Weak tokens, no rate limit on login, no rotation | Short-lived JWTs, refresh rotation, login rate limiting |
| SSRF / XSS / CSRF | Rendering raw user HTML; forged cross-site requests | Escape output, sanitise HTML, SameSite cookies + CSRF tokens |

## Authentication vs authorization — the distinction AI forgets

**Authentication** answers "who are you?" — logging in, verifying a token. **Authorization** answers "are you allowed to do this specific thing?" Almost every data breach in small apps is a failure of the second, not the first. The user is correctly logged in — and then reads or edits a record that isn't theirs because the code only checked that they were *someone*, not that they were the *right someone*. Internalise it as a reflex: **authenticated is not authorized.**

```js
// Authentication middleware: proves WHO. (verifies the token)
function auth(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  try { req.user = jwt.verify(token, process.env.JWT_SECRET); next(); }
  catch { res.status(401).json({ error: { code: "unauthenticated" } }); }
}

// Authorization: proves ALLOWED. Two flavours — role-based and ownership-based.
const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next()
    : res.status(403).json({ error: { code: "forbidden" } });

// Ownership is enforced in the QUERY itself — the safest place, can't be forgotten downstream.
// where: { id, patientId: req.user.id }   ← seen throughout this book for a reason

app.delete("/v1/hospitals/:id", auth, requireRole("admin"), deleteHospital);
```

## Passwords and tokens, done right

Never store a password — store a slow, salted **hash** (argon2 is the modern choice; bcrypt is fine). "Slow" is the point: it makes brute-forcing a stolen database infeasible. For sessions, the robust pattern is a **short-lived access token** (a JWT, 10–15 minutes, kept in memory) plus a **long-lived refresh token** (stored in an httpOnly, Secure, SameSite cookie, hashed in your database) that mints new access tokens. The access token being short-lived limits the damage if it leaks; the refresh token being httpOnly keeps JavaScript — and therefore XSS — from stealing it.

**The access + refresh token pattern with rotation:**

- **Access token (JWT):** short-lived 10–15 min · in memory · sent on each request
- **Refresh token:** long-lived · httpOnly+Secure cookie · stored hashed server-side
- **Rotation on refresh:** access expired → client calls `/refresh` → verify refresh, issue a new pair & invalidate the old. **Reuse of an old refresh token = theft signal → revoke the whole token family.**
- **Logout / ban must kill the refresh token.**

```js
import argon2 from "argon2";

// Register: hash, never store the raw password.
const passwordHash = await argon2.hash(req.body.password);
await prisma.user.create({ data: { email, passwordHash } });

// Login: verify against the hash. A constant-time check — don't roll your own.
const user = await prisma.user.findUnique({ where: { email } });
const ok = user && await argon2.verify(user.passwordHash, req.body.password);
if (!ok) return res.status(401).json({ error: { code: "invalid_credentials" } });
// (Return the SAME error whether the email is unknown or the password is wrong —
//  a different message tells an attacker which emails are registered.)
```

> **⚠ Token mistakes that show up in AI output**
> Putting the JWT in localStorage (readable by any XSS), never expiring tokens, no rotation, and no server-side way to revoke a refresh token (so a logout or a ban does nothing). If your AI generates auth, check all four. **A token you cannot revoke is a key you can never take back.**

## Injection and XSS: never mix data with code

Both attacks come from the same root mistake: treating attacker-controlled data as trusted code. **SQL injection** happens when input is concatenated into a query; the defense is parameterised queries, which keep data and SQL strictly separate — Prisma does this for you unless you use raw string interpolation. **XSS** happens when user content is rendered as HTML; React escapes by default, so your danger zone is `dangerouslySetInnerHTML` and any server-rendered HTML — sanitise before rendering.

```js
// ❌ SQL injection — input becomes part of the query.
const q = `SELECT * FROM users WHERE email = '${req.body.email}'`;   // ' OR '1'='1
await prisma.$queryRawUnsafe(q);

// ✓ Parameterised — the value can never become SQL.
await prisma.$queryRaw`SELECT * FROM users WHERE email = ${req.body.email}`;
// Better: just use the query builder. await prisma.user.findUnique({ where: { email } })

// ✓ XSS — React escapes {userBio} automatically. The ONLY risk is this:
<div dangerouslySetInnerHTML={{ __html: sanitize(userBio) }} />  // sanitize first, always
```

## The configuration that ships secure

Three quick wins, all things AI tends to leave wide open. **Secrets in the environment**, never in code or git — if a secret is ever committed, rotate it; git history is forever. **CORS locked to your known origins** — not `*`. **Security headers via Helmet, and HTTPS enforced.** These take ten minutes and close a surprising number of doors.

```js
import helmet from "helmet";
import cors from "cors";

app.use(helmet());                                   // sane security headers by default
app.use(cors({
  origin: ["https://app.goodir.so", "https://admin.goodir.so"],  // explicit allow-list
  credentials: true,                                 // needed for the refresh cookie
}));

// Secrets: read from env, fail fast at boot if missing — don't discover it in prod.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET is required");
```

> **⚙ Directing & Verifying — security**
> **Direct:** Make security an explicit acceptance criterion in your spec, not an afterthought: "every data access must be scoped to the authenticated user; validate all input; no secret in code; passwords hashed with argon2." Ask the AI to audit its own code against the OWASP Top 10 and report what it found.
> **Verify:** Run through this five-point gate on every PR — (1) ownership checked on every read/write, (2) all input validated, (3) no raw string interpolation into SQL, (4) no secrets in the diff, (5) tokens short-lived, httpOnly refresh, revocable. Run `npm audit` in CI. When in doubt, assume the AI forgot the authorization check — it usually did.

---

# PART 6 — Testing as Your Safety Net

*For an AI-first engineer, tests aren't optional hygiene — they're the machine that lets you trust code you didn't write. This is your superpower.*

Here is the reframe that should change how you work: **a test is an executable specification.** When you write (or have the AI write) a test that says "cancelling within 24 hours must fail with 409", you've created a check that runs forever, on every change, automatically. You no longer need faith that the rule holds — you have proof, re-verified on every commit. This is exactly the safety net that makes "I don't read every line" a defensible strategy instead of a reckless one.

## The testing pyramid

Not all tests are equal. The pyramid tells you the right mix: many fast unit tests at the base, fewer integration tests in the middle, a handful of end-to-end tests at the top. The shape matters because the cheap, fast tests catch most bugs, while the slow, brittle ones are reserved for the few flows that truly need full-system confidence.

| Level | Tests | Speed | What it catches |
|---|---|---|---|
| Unit | One function/service in isolation | milliseconds | Logic bugs, your business invariants |
| Integration | API + real database together | seconds | Wiring, queries, auth, the seams between layers |
| End-to-end | Browser/app through the whole stack | slow | Critical user journeys (signup, book, pay) |

## What to actually test (and what to skip)

Don't chase a coverage percentage — **chase risk**. Test the things that would hurt if they broke: your business rules, your authorization, your money paths, your edge cases (empty input, the last available slot, the expired token). Don't waste effort testing framework code, trivial getters, or that Prisma can insert a row — those aren't your bugs. A good prompt to your agent: *"write tests for the failure and edge cases, not just the happy path."*

```js
// UNIT TEST — the business rule from Part 4, verified in isolation, no DB, no HTTP.
import { describe, it, expect, vi } from "vitest";

describe("appointmentService.cancel", () => {
  it("rejects cancellation inside the 24h window", async () => {
    const repo = { findOwnedBy: vi.fn().mockResolvedValue({
      id: "a1", startsAt: addHours(new Date(), 2),     // only 2h away
    })};
    await expect(cancel("a1", "user1", repo))
      .rejects.toMatchObject({ code: "too_late_to_cancel", statusCode: 409 });
  });

  it("rejects an appointment the user does not own", async () => {
    const repo = { findOwnedBy: vi.fn().mockResolvedValue(null) };  // not found for THIS user
    await expect(cancel("a1", "user1", repo))
      .rejects.toMatchObject({ statusCode: 404 });   // ← this test guards an authz hole
  });
});
```

## Integration tests: the highest value for your money

For backend work, integration tests give the most confidence per line. They run your real Express app against a real (test) Postgres database and exercise an endpoint exactly as a client would — through routing, middleware, auth, validation, the service, and the actual SQL. They catch the bugs unit tests can't: a missing index isn't tested here, but a broken auth check, a wrong status code, or an endpoint that returns another user's data absolutely is. Use **supertest** to drive the app and a disposable test database (a Docker Postgres or a per-test schema) that you reset between runs.

```js
import request from "supertest";
import { app } from "../app.js";

describe("GET /v1/appointments/:id", () => {
  it("returns 404 when the appointment belongs to another user", async () => {
    const { token } = await loginAs(userA);
    const apptOfUserB = await seedAppointment({ patientId: userB.id });

    const res = await request(app)
      .get(`/v1/appointments/${apptOfUserB.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(404);          // ✓ proves the ownership scope holds
    expect(res.body).not.toHaveProperty("patientId");   // ✓ no data leaked
  });
});
```

> **◆ Write the test for the bug you're afraid of**
> Your worry is "what if the AI wrote an endpoint that leaks data?" Turn that fear into a test: a test that logs in as user A and asserts they get a 404 when reaching for user B's record. Now that fear is a permanent, automated guard. Every security and business concern you have in this book can become a test — and a test that has never failed is cheap insurance that never sleeps.

## Make the suite run automatically, or it won't run

Tests only protect you if they run on every change without anyone remembering to. That's the job of CI (Part 8): the pipeline runs the whole suite on every pull request and **blocks the merge if anything fails**. This is the mechanism that lets you accept AI code with confidence — not because you read every line, but because no line reaches production without passing the checks you defined. The discipline is simple: **a bug fix comes with a test that would have caught it**, so the same bug can never silently return.

> **⚙ Directing & Verifying — testing**
> **Direct:** A powerful workflow is **test-first with AI**: describe the behaviour, ask the agent to write the tests (including edge and failure cases), confirm the tests encode what you actually want, then ask it to write the code that passes them. The tests become the contract the implementation must satisfy — and you reviewed the contract, which is far easier than reviewing the implementation.
> **Verify:** Are there tests for the failure paths and authorization, not just the happy path? Does the suite use a real database for integration tests? Do tests actually fail when you break the code on purpose (try it once — a test that can't fail is testing nothing)? Does CI block merges on a red suite?

---

# PART 7 — Scaling & Performance

*Scaling is not about doing complicated things early. It's about doing simple things in the right order, and only when the numbers say so.*

The biggest scaling mistake a small team makes is solving problems they don't have yet. You build the distributed, sharded, microservice system for a million users and ship it to four hundred. Real scaling is incremental and measured: you find the actual bottleneck, fix that one, and repeat. **Measure first. Optimise the thing that's actually slow.**

## The order of operations

**Three ways to grow — usually in this order:**

1. **Scale up** — bigger box: more CPU/RAM. It's a config change, costs nothing in complexity, and buys a lot of headroom. Do this first, always. Ceiling: one machine.
2. **Scale out** — run several **stateless** copies behind a load balancer (this is why Part 2 hammered statelessness). Now you have redundancy and capacity. Needs: no local state.
3. **Split the data** — the database is usually the last and hardest thing to scale, because you can't just clone it for writes. Add **read replicas** first, then partition or shard only if you must. Last resort — adds real complexity.

Each step up this ladder roughly triples your operational complexity, so climb only as far as the load demands. Most systems never need step 3 — and the ones that do should arrive there with evidence, not a hunch.

## Where systems actually bottleneck

| Symptom | Usual cause | Fix (in order of preference) |
|---|---|---|
| Slow endpoints under load | Database queries (N+1, missing index) | Index, fix N+1, then cache — before touching servers |
| "Too many connections" | No connection pool | PgBouncer / pooler endpoint |
| Reads fine, writes slow | Single primary saturated | Read replicas for reads; queue heavy writes |
| Spiky traffic causing timeouts | Synchronous slow work on the request path | Move to a queue + workers |
| One instance maxed, others idle | Stateful app / sticky sessions | Make it stateless; state to Redis |

Read that table again: **most "we need to scale" problems are actually database problems**, which is why Part 3 was the longest chapter. Adding servers in front of a slow query just gives you more servers waiting on the same slow query.

## The numbers every engineer should carry in their head

You don't need precision; you need intuition for what's fast and what's expensive. These orders of magnitude tell you instantly whether a design is reasonable.

| Operation | Rough cost | Implication |
|---|---|---|
| Read from memory (a variable) | nanoseconds | essentially free |
| Redis cache hit (same datacentre) | ~0.5–1 ms | cheap — cache the hot reads |
| Indexed Postgres query | ~1–10 ms | fine for most requests |
| Un-indexed query on a big table | 100 ms – seconds | this is your slowness; index it |
| External API call | 50–500+ ms | never on the critical path — queue it |
| Cross-region network round-trip | ~100 ms+ | keep app and DB in the same region |

> **◆ A budget for a single request**
> If you target a p95 response under 300 ms, you can afford a couple of indexed queries and a cache lookup — but not three sequential external API calls, and certainly not an N+1 loop. Thinking in a **time budget per request** makes performance concrete: when you add a step, ask "what does this cost against my 300 ms?" One un-indexed query or one synchronous email send blows the whole budget.

## Measure, don't guess

The cardinal rule of performance is that your intuition about where the slowness is will often be wrong — so you **instrument before you optimise**. Three cheap measurements catch almost everything: log the duration of every request (and flag the slow ones), track database query time, and watch the p95/p99 latency (the experience of your worst-served users, which averages hide). Optimise the top item on that list, then re-measure. Premature optimisation — rewriting code that was never the bottleneck — is wasted effort that often makes the code harder for your AI to work with.

> **⚙ Directing & Verifying — scaling**
> **Direct:** Resist asking the AI for "scalable" architecture in the abstract — it will gold-plate. Instead: "this serves ~5,000 daily users on one region; keep it a stateless monolith, make sure reads are cached and queries indexed, and tell me the single thing that would break first at 10× load." That last question surfaces the real bottleneck cheaply.
> **Verify:** Is the app genuinely stateless (can you run two copies)? Are the hot queries indexed and measured with EXPLAIN ANALYZE? Is slow/external work queued? Are you logging request and query durations so you can find the bottleneck instead of guessing? Has anyone added complexity (sharding, microservices) that the current load doesn't justify?

---

# PART 8 — Production & Operations

*Shipping is the start, not the finish. Production engineering is what keeps a system trustworthy at 3 a.m. when you're asleep.*

## CI/CD: the gate that lets you trust AI code

This is the most important operational idea in the whole book for someone in your position. A continuous integration / continuous delivery pipeline runs a fixed series of checks on every change, automatically, and **refuses to deploy anything that fails one**. It is the mechanism that converts "I have faith in the AI" into "nothing reaches production without passing lint, type-checks, the full test suite, and a staging smoke test." Your confidence stops being faith and becomes a property of the pipeline.

**The pipeline as a series of gates** (code flows left to right only if each gate passes):

```
Push (git → PR) → Lint+Types (eslint·tsc) → Test (unit·integ) → Build (artifact) → Staging (smoke test) → Prod (gated deploy)
```

```yaml
# .github/workflows/ci.yml — every gate must pass before merge/deploy
name: ci
on: [pull_request, push]
jobs:
  verify:
    runs-on: ubuntu-latest
    services:
      postgres:                       # a real DB for integration tests
        image: postgres:16
        env: { POSTGRES_PASSWORD: test }
        ports: ["5432:5432"]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run lint            # style + common-bug rules
      - run: npm run typecheck       # tsc / jsdoc types — catches whole classes of bugs
      - run: npx prisma migrate deploy  # apply migrations to the test DB
      - run: npm test                # unit + integration; FAILS the build if red
      - run: npm audit --audit-level=high   # known-vulnerable dependencies
```

> **◆ Make the pipeline the boss**
> Configure the repository so a pull request **cannot be merged while any check is red**. Now the rule isn't a habit you might forget under deadline pressure — it's enforced by the machine. This single setting is what makes AI-assisted development safe at scale: the AI can write anything, but only code that passes your gates ships.

## Environments & configuration

Keep at least three environments: **development** (your machine), **staging** (a production clone where changes are smoke-tested), and **production**. The same build artifact moves through them; only the configuration changes, and configuration lives entirely in **environment variables** — never in code, never branched on (`if (env === "prod")` littered through the code is a smell). This is the discipline that lets you deploy with confidence: what you tested in staging is byte-for-byte what runs in production.

## Health checks and graceful shutdown

Two small endpoints make your app a good citizen in a scaled environment. A **health check** lets the load balancer ask "are you ready for traffic?" and stop routing to an instance that isn't. **Graceful shutdown** means when the platform tells your app to stop (during a deploy), it finishes in-flight requests and closes the database pool cleanly instead of dropping users mid-request. Without these, every deploy causes a little burst of errors.

```js
app.get("/health", async (req, res) => {
  try { await prisma.$queryRaw`SELECT 1`;            // is the DB actually reachable?
    res.json({ status: "ok" });
  } catch { res.status(503).json({ status: "degraded" }); }
});

process.on("SIGTERM", async () => {                  // platform says "wrap up"
  server.close(async () => {                         // stop taking new requests
    await prisma.$disconnect();                      // finish cleanly
    process.exit(0);
  });
});
```

## Observability: you can't fix what you can't see

When something breaks in production, the difference between a five-minute fix and a five-hour outage is whether you can see what happened. Three pillars: **logs** (structured, JSON, with a request id threaded through so you can follow one request across every line it produced), **metrics** (request rate, error rate, p95 latency — the numbers you alert on), and **traces** (the breakdown of where a slow request spent its time). Start with structured logs and a couple of metrics; that alone puts you ahead of most small teams.

```js
import pino from "pino";
const logger = pino();

// Attach a request id to every request, and log start + outcome with timing.
app.use((req, res, next) => {
  req.id = crypto.randomUUID();
  req.log = logger.child({ requestId: req.id, path: req.path });
  const start = Date.now();
  res.on("finish", () => req.log.info({ status: res.statusCode, ms: Date.now() - start }));
  next();
});
// Now one grep on a requestId shows the entire story of a single failed request.
```

> **→ Set the alerts that wake you for the right reasons**
> Alert on symptoms users feel: error rate climbing, p95 latency spiking, the health check failing, the queue backing up. Don't alert on raw CPU — high CPU with happy users is fine. A good alert tells you something is wrong *for a user* and points you at the request id to investigate.

## Backups and disaster recovery — the part nobody tests until it's too late

Two terms define your data-loss risk. **RPO** (recovery point objective) is how much data you can afford to lose — it dictates how often you back up. **RTO** (recovery time objective) is how long you can be down — it dictates how fast you must be able to restore. Automated daily backups with point-in-time recovery (most managed Postgres offers this) covers most needs. But here's the rule that matters: **a backup you have never restored is not a backup — it's a hope.** Test a restore into a scratch database at least once, so you know it works before you need it.

> **⚙ Directing & Verifying — production**
> **Direct:** Ask the AI to set up the CI pipeline, health checks, graceful shutdown, and structured logging as part of the initial project scaffold — not bolted on later. Give it the pipeline gates as a checklist to implement.
> **Verify:** Does the pipeline block merges on failure? Are migrations applied automatically before deploy? Is config entirely in env vars? Do logs carry a request id? Are backups automated and has a restore been tested once? Can you deploy without a burst of errors (graceful shutdown working)?

---

# PART 9 — Agentic Engineering

*How to build production systems through an AI agent — without losing the plot*

This is the chapter that ties everything together — the one written for exactly how you work. You no longer type most of the code. You set up the database, the repo, the environment, and then you direct Claude Code and review what comes back. That is not a lesser way to build; it is a **different discipline**, and the engineers who master it will out-ship everyone else. But it only works if you bring something the agent cannot: a clear specification, the business invariants, the security boundaries, and a verification habit. The agent supplies fluency. **You supply judgment.** The previous eight chapters were really about giving you that judgment — this one is about how to apply it through an agent.

> **◆ The mental model: you are the architect, the agent is the builder**
> A great architect does not lay every brick. But they produce the drawings, choose the materials, set the load-bearing walls, and inspect the work before anyone moves in. If the drawings are vague, no amount of skilled bricklaying saves the building. Your leverage is entirely upstream — in how precisely you specify and how rigorously you verify. The typing in the middle is the part that's been automated.

## The loop: Specify → Generate → Verify → Integrate

The single biggest mistake is making the loop too big — "build me the whole booking system" — and then facing a thousand lines you cannot meaningfully review. The fix is to **shrink the loop** until each pass produces something you can verify. One endpoint. One service function with its tests. One migration. A loop you can verify in five minutes is a loop you can trust; a loop that produces a day's worth of code in one shot is a leap of faith.

> **⚙ A concrete cadence that works**
> 1. **Specify** — describe one slice: the endpoint, its inputs, its authorization rule, its business invariants, the error cases, and the shape of the response.
> 2. **Generate** — let the agent write the code **and the tests** in the same pass.
> 3. **Verify** — run the tests, read the diff against the five questions, check the one thing AI is weakest at for this slice (usually authorization or a query).
> 4. **Integrate** — commit through CI. Then the next slice. Small loops compound into large systems without ever requiring a leap of faith.

## How to specify so the agent builds the right thing

The quality of what comes back is almost entirely determined by the quality of what you send in. A vague prompt invites the agent to invent the parts you left out — and it will invent the plausible average, not your business rules. A good specification names the things the agent cannot guess: who is allowed to do this, what must never happen, and what the edges are.

```text
WEAK PROMPT (invites guessing):
  "Add an endpoint to cancel an appointment."

STRONG SPECIFICATION (removes the guesswork):
  "Add POST /appointments/:id/cancel.
   AUTHORIZATION: only the patient who owns the appointment, OR an admin.
                  A patient cancelling someone else's appointment must get 404
                  (not 403 - don't reveal the row exists).
   INVARIANTS:    cannot cancel an appointment that is already 'completed'
                  or already 'cancelled' -> 409 with a clear message.
                  Cancelling within 2 hours of start time is not allowed -> 422.
   SIDE EFFECTS:  set status='cancelled', record cancelled_at,
                  enqueue a notification job (do not send email inline).
   RESPONSE:      200 with the updated appointment in our standard envelope.
   TESTS:         write integration tests for each rule above, including the
                  404-for-other-users-appointment case.
   Use our existing controller/service/repository layering and zod validation."
```

> **◆ Specify the invariants, not the implementation**
> Notice the strong prompt never says *how* to write the query or which library to use — the agent is excellent at that. It pins down what the agent is bad at guessing: the authorization rule, the states that must be rejected, the 404-vs-403 decision, the fact that email is a background job. You are encoding business and security knowledge the model has no way to know. That is your irreplaceable contribution.

## Reviewing AI-generated code: the five questions, every time

You do not need to read every line the way you'd grade an exam. You need to read with **targeted suspicion** — knowing the specific places AI tends to go wrong and checking those first.

| Question | What you're actually checking | Where AI fails |
|---|---|---|
| 1. Authorization | Is there a check that this user may act on this row? | Often checks "logged in" but not "owns it". The most common AI security hole. |
| 2. Data access | Does this run one query, or one-per-row in a loop? | Cheerfully writes N+1 loops that pass tests and die under load. |
| 3. Failure | What happens when the DB/API/input is bad? Any silent catch? | Swallows errors to make code "work"; hides real failures. |
| 4. Invariants | Are the business rules I specified actually enforced — in the DB, not just the UI? | Validates in React, forgets the server/DB constraint. |
| 5. Boundaries | Is untrusted input validated? Are secrets/queries handled safely? | Trusts request bodies; occasionally string-builds SQL. |

> **✓ The one-sentence test that catches the most**
> Before you accept a non-trivial piece of code, make the agent **explain it back in one sentence**: "In one line, what does this function guarantee and what does it assume about its inputs?" If the answer is fuzzy, the code is fuzzy. If the answer reveals an assumption you didn't intend ("assumes the caller already checked ownership"), you just found the bug before it shipped.

## Tests, types, lint, and CI are how you safely stop reading every line

Here is the resolution to your core worry. You're right that blind faith in generated code is dangerous for enterprise systems. But the answer isn't to go back to hand-typing everything — it's to build a **machine that verifies the code for you**, so trust is earned by automation rather than granted by hope. Every layer from the previous chapters is part of that machine: types catch shape errors, lint catches sloppiness, tests catch broken behavior and missing authorization, and CI refuses to merge anything that fails. When the agent writes code and the test that pins its behavior, and CI runs that test on every change, you are no longer trusting the agent — **you're trusting a green pipeline you built**. That is a defensible foundation for an enterprise system.

> **⚙ Make the agent build its own guardrails**
> Always ask for the test in the same loop as the code: "write the function and the tests that prove the authorization rule and the two rejected states." Then **you run them** — never take "tests pass" on the agent's word; execute them yourself. A test you didn't watch go green is just another sentence of generated text. A test you ran is evidence.

## Keeping a coherent mental model across sessions

Agents forget. Each session starts fresh, and without an anchor the agent will happily re-invent a different error format, a new auth pattern, a second way of paginating — and your codebase fragments into five dialects. The fix is to make **the decisions live in the repository**, not in your memory or a lost chat. This is what the ADRs and conventions from Part 2 are for: they're not bureaucracy, they're the agent's long-term memory. Point every new session at them.

```text
# Keep a short, living conventions file the agent reads at the start of work.
# This is the cheapest, highest-leverage habit in agentic engineering.

/docs/CONVENTIONS.md
  - API responses use the envelope in src/lib/respond.js. Never invent another shape.
  - Errors flow through the central errorHandler. Throw AppError; never res.json an error inline.
  - Every endpoint that touches a user-owned row MUST scope the query by ownerId.
  - Validate every request body/params/query with zod at the controller boundary.
  - Money is stored as integer cents. Never floats.
  - Background work (email, notifications) goes through the queue, never inline.
  - Migrations are expand-then-contract. Never a destructive change in one deploy.

# Then, at the start of a session:
#   "Read /docs/CONVENTIONS.md and the relevant ADRs in /docs/adr before writing code.
#    Follow these patterns exactly; if something here conflicts with the task, flag it."
```

> **◆ You are the source of continuity**
> The agent provides bursts of fluent code; you provide the through-line that makes a thousand bursts into one coherent system. Architecture decisions, naming conventions, the error contract, the auth pattern — these are yours to hold and to enforce on every loop. An enterprise system isn't a pile of correct functions; it's a set of **consistent decisions applied everywhere**. That consistency is the part only you can guarantee.

## Prompt patterns for production-grade output

| Pattern | When to use it | The framing |
|---|---|---|
| **Spec-first** | Any new endpoint or feature | "Here are the inputs, authz rule, invariants, error cases, and response shape. Implement to this spec and write tests for each rule." |
| **Red-team** | Anything touching auth, money, or user data | "You just wrote this. Now act as an attacker: how would I access another user's data or break an invariant? Then fix what you find." |
| **Explain-back** | Before accepting non-trivial code | "In one sentence: what does this guarantee, and what does it assume about its inputs?" |
| **Bug-first** | Fixing a defect | "Write a failing test that reproduces this bug. Show it fails. Then fix the code so the test passes — change nothing else." |
| **Decision-log** | Any non-obvious technical choice | "Propose 2–3 options with trade-offs and recommend one. Write the choice as an ADR before implementing." |

> **⚠ The trap of the confident, plausible answer**
> The agent's most dangerous quality is that wrong code looks exactly as confident as right code. It will produce a beautifully formatted function with a reassuring explanation that is subtly, catastrophically missing an ownership check. **Fluency is not correctness.** This is precisely why your verification habit — the five questions, running the tests yourself, the red-team prompt on sensitive paths — is non-negotiable. The polish of the output tells you nothing about its safety.

> **⚙ Directing & Verifying — the whole discipline in one place**
> **Direct:** small loops; spec the invariants and authz, not the implementation; demand code-plus-tests together; point every session at CONVENTIONS.md and the ADRs; use red-team and explain-back on anything sensitive.
> **Verify:** run the tests yourself; walk the five questions on every diff; check authorization and query-shape first because that's where AI fails most; let CI be the final gate that no amount of confident prose can bypass. Do this and you are not taking a leap of faith — you are an architect inspecting verified work.

---

# PART 10 — Capstone: A Reference Architecture & 90-Day Plan

*Everything above, assembled into one picture and one path forward*

This final chapter does two things. First, it puts the whole system on one page — the reference architecture that every previous chapter was a piece of — so you can see how the parts connect. Second, it hands you the checklists and the plan to turn this knowledge into a standing capability. The checklists are not decoration: **paste them to your agent as acceptance criteria, and use them as the definition of "done" before anything ships.**

## The reference architecture

```
React web + React Native (Expo) · short-lived JWT in memory, refresh in httpOnly cookie
        ↓
CDN + Load Balancer + WAF (Vercel / AWS) — TLS, security headers
        ↓
Express API (stateless, N instances)
  middleware → authN/authZ → zod validation → controller → service → repository
  request-id on every log · graceful shutdown · /health
        ↓                        ↓                          ↓
Redis (Upstash)          PostgreSQL + Prisma          Queue + Workers
cache-aside · rate       primary + read replica ·     email (Resend) · PDFs ·
limit · sessions         PgBouncer pool               webhooks

Observability — structured JSON logs · metrics (p95 latency, error rate) · traces · alerting · uptime checks
CI/CD gate — lint · types · tests · migrations · staging smoke test → gated production deploy + automated DB backups
```

The client talks only to the API; the API enforces validation, authentication, and authorization at the edge; the service layer holds business rules; the repository layer owns data access; Postgres holds the source of truth with constraints; Redis handles cache, sessions, and rate limits; a queue absorbs slow work; and observability plus CI/CD wrap the whole thing. Every box maps to a chapter you've now read.

## The production-readiness checklist

Before any system carries real users and real data, walk this list. If you cannot tick a line, that's your next task. Hand it to your agent as the bar to clear.

- [ ] **Correctness:** business invariants enforced in the database (constraints), not only in the UI; tests cover the risky paths and pass in CI.
- [ ] **Data:** foreign keys indexed; columns are the right types (money as integer cents); migrations are expand-then-contract; automated backups exist and a restore has been tested once.
- [ ] **Performance:** no N+1 on hot paths (verified with logs/EXPLAIN); the queries behind your busiest endpoints use indexes; a per-request latency budget is defined.
- [ ] **Resilience:** external calls have timeouts; slow work runs in a queue, not inline; the app shuts down gracefully on SIGTERM; a health check reflects real dependency status.
- [ ] **Operations:** config is entirely in env vars; structured logs carry a request id; you alert on error rate and p95 latency; CI blocks merges on red and applies migrations before deploy.

## The security checklist

Security is where an enterprise reputation is won or lost in a single incident. This list is the minimum bar for a system holding other people's data.

- [ ] **AuthZ on every protected route:** not just "is logged in" but "may act on this resource" — ownership scoped in the query; return 404 (not 403) for rows the user shouldn't know exist.
- [ ] **Passwords:** hashed with argon2/bcrypt, never reversible; identical error for unknown email and wrong password.
- [ ] **Tokens:** short-lived access token; refresh token rotated and revocable; never stored where XSS can read it carelessly.
- [ ] **Input:** every body/param/query validated with zod at the boundary; all SQL parameterized (never string-built); user HTML sanitized before render.
- [ ] **Transport & config:** HTTPS only; CORS locked to known origins; security headers via Helmet; secrets in env vars, never in the repo; `npm audit` runs in CI.

## The code-review / pull-request checklist

This is the one you run on every diff the agent produces — the five questions made operational. Keep it visible while you review.

- [ ] 1. Does every protected query scope by owner id? *(authorization)*
- [ ] 2. Any query inside a loop, or any missing `include`? *(N+1)*
- [ ] 3. Any empty or swallowing catch? Are failures surfaced honestly? *(failure handling)*
- [ ] 4. Are the business rules I specified enforced server-side / in the DB? *(invariants)*
- [ ] 5. Is untrusted input validated and are queries parameterized? *(boundaries)*
- [ ] **+ Tests:** did the agent add tests for each rule, and did I run them and watch them pass?

## Your 90-day plan to standalone mastery

Knowledge becomes capability through deliberate practice on real systems. You already have the perfect laboratory — your own client and government projects. The plan below layers the disciplines from this course onto work you're doing anyway, so each phase makes a real system more robust while making you the engineer who can guarantee that robustness.

| Phase | Focus | What you actually do | You'll be able to… |
|---|---|---|---|
| **Days 1–30** — Foundations & sight | Database & review reflex | On one live project, turn on slow-query and request logging. Run EXPLAIN ANALYZE on your five busiest queries; add the missing FK and composite indexes. Start running the five-question review on every agent diff. | Read a query plan, spot an N+1, and catch a missing authz check on sight. |
| **Days 31–60** — Safety net | Testing & CI | Add a test database and write integration tests for the riskiest endpoints (auth, ownership, money, state transitions). Stand up a CI pipeline that runs lint + typecheck + tests + npm audit and blocks merges on red. | Ship agent-written code without a leap of faith — because a pipeline you built verifies it. |
| **Days 61–90** — Production hardening | Security, ops & resilience | Walk the security checklist across one system and close every gap. Move email/notifications to a queue. Add health checks, graceful shutdown, structured logs with request ids, automated backups — and test one restore. | Take a system from "it works on my machine" to "it survives real users, real load, and a bad day." |

> **◆ The habit that makes you standalone**
> Pick one real system and make it your **reference implementation** — the one where every pattern in this course is done right. Then every new project starts by copying those patterns, and every agent session points at them. You stop building one-off code and start applying a standard you own. That — a defensible standard, enforced through clear specs and rigorous verification — is what separates someone who *uses* AI from an engineer who *directs* it to build enterprise systems.

> **→ Where this leaves you**
> You started this course worried that not typing the code meant not understanding the system. You now have the opposite position available to you: you understand the system at the level that actually governs whether it survives production — its data model, its boundaries, its invariants, its failure modes — and you direct an agent to handle the mechanical translation into code, then verify the result against a standard. That is not a weaker kind of engineer. Done with this discipline, it is a stronger one. **The leap of faith becomes a chain of verified steps. Go build something robust.**

---

*Engineering Robust Enterprise Systems with AI — prepared for Goodir, Goodir Technology. A field guide for the architect-and-reviewer era of software engineering.*
