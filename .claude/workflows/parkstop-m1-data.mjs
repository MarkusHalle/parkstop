export const meta = {
  name: 'parkstop-m1-data',
  description: 'ParkStop M1: research legal basis, district agreements, authority contacts and offence references, each checked by a sceptic',
  whenToUse: 'ParkStop milestone M1 (tasks 1.1, 1.2, 1.3, 1.6). Pass args {today: "YYYY-MM-DD"}.',
  phases: [
    { title: 'Research', detail: 'five researchers on official Hungarian sources' },
    { title: 'Verify', detail: 'one sceptic per researcher re-opens every source' },
  ],
}

const TODAY = (args && args.today) || 'unknown-date'

const COMMON = `
You work on ParkStop: a static web app that helps a person in Budapest report an illegally
parked car to the responsible authority by e-mail. Read SPEC.md sections 1, 4.2, 5, 6 and 7,
docs/DATA-SOURCES.md (its rules are binding) and docs/DECISIONS.md (O1, D8) before starting.
Today is ${TODAY}; use it as the verification date.
Hard rules: official sources only (the body's own site, district municipality sites,
police.hu, fori.hu, njt.jog.gov.hu, net.jogtar.hu, einfoszab.budapest.hu, budapest.hu).
News, Járókelő and directories may point the way but are never the cited source.
Never derive an e-mail address from a pattern or from memory. An honest gap is a correct
answer. For every fact give the exact URL and a short verbatim quote (max 25 words) from
that page showing it. Do NOT write or edit any project file — return data only.
Hungarian text stays in Hungarian; your explanations in English.`

const SOURCE = {
  type: 'object',
  properties: {
    url: { type: 'string' },
    quote: { type: 'string' },
  },
  required: ['url', 'quote'],
}

const RESEARCH_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          ref: { type: 'string', description: 'stable id, e.g. "XIII-enforcement-email" or "Q1"' },
          subject: { type: 'string', description: 'what this item is about (district, body, question, offence)' },
          field: { type: 'string', description: 'which fact (email, phone, address, answer, legalRef, …)' },
          value: { type: 'string', description: 'the fact itself; empty string if not found' },
          sources: { type: 'array', items: SOURCE },
          confidence: { type: 'string', enum: ['verified-on-page', 'inferred', 'not-found'] },
          note: { type: 'string' },
        },
        required: ['ref', 'subject', 'field', 'value', 'sources', 'confidence'],
      },
    },
    summary: { type: 'string', description: 'plain-English summary of the main conclusions (max 200 words)' },
    gaps: { type: 'array', items: { type: 'string' } },
  },
  required: ['items', 'summary', 'gaps'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          ref: { type: 'string' },
          verdict: { type: 'string', enum: ['CONFIRMED', 'REFUTED', 'UNVERIFIABLE'] },
          evidence: { type: 'string', description: 'what you checked and what you found, with URL' },
          correctedValue: { type: 'string', description: 'only when REFUTED and the right value is on an official page' },
        },
        required: ['ref', 'verdict', 'evidence'],
      },
    },
    missed: { type: 'array', items: { type: 'string' }, description: 'important facts the researcher missed or got from a non-official source' },
    summary: { type: 'string' },
  },
  required: ['verdicts', 'missed', 'summary'],
}

const DISTRICTS_A = 'I, II, III, IV, V, VI, VII, VIII, IX, X, XI, XII'
const DISTRICTS_B = 'XIII, XIV, XV, XVI, XVII, XVIII, XIX, XX, XXI, XXII, XXIII'

const JOBS = [
  {
    key: 'legal',
    label: 'legal basis (task 1.1, O1)',
    model: undefined, effort: 'high', sceptEffort: 'high',
    prompt: `${COMMON}

TASK 1.1 — legal basis of a citizen's photo report about illegal stopping/parking in Budapest.
Answer each question as items with ref Q1…Q6 (field "answer"), each with official sources:
Q1. When the driver is not present, which bodies may act on a stopping/waiting (megállás/várakozás)
    violation: the public-space enforcement body (1999. évi LXIII. törvény a közterület-felügyeletről),
    the police, others? Under which procedure (helyszíni bírság távollévővel szemben, közigazgatási
    bírság / üzembentartói felelősség — Kkt. and 410/2007. Korm. rendelet —, szabálysértési eljárás)?
Q2. Can any of them fine on the basis of a private person's photo and report, without an officer
    witnessing it? Quote the rule. If they cannot fine, what CAN a report achieve (e.g. patrol, warning,
    szabálysértési feljelentés with the reporter as witness)?
Q3. Who is the correct addressee for an after-the-fact photo report: the district enforcement body,
    FÖRI, or the police? What do these bodies' own websites say about receiving such reports?
Q4. What must the report contain to be acted on (reporter's name and address? time, place, plate,
    photos, witness statement)? Is plain e-mail accepted, or is a formal channel (e-Papír, Ügyfélkapu+,
    signed form) required?
Q5. Consequences for the reporter: becoming a witness, data protection (GDPR), sending photos of
    other people/plates to an authority.
Q6. Based on Q1–Q5: the recommended default addressee rule for ParkStop and any wording ParkStop's
    e-mail must use or avoid (it must never promise a fine). Mark this item confidence "inferred".`,
  },
  {
    key: 'agreements',
    label: 'district agreements (task 1.3)',
    model: undefined, effort: 'high', sceptEffort: 'high',
    prompt: `${COMMON}

TASK 1.3 — who patrols where, district by district, for all 23 Budapest districts (I–XXIII).
For EACH district return these items (ref "<district>-<field>"):
- field "ownBody": "yes"/"no" — does the district run its own közterület-felügyelet / önkormányzati
  rendészet; value also gives the body's exact official name.
- field "capitalRoads": who acts on roads managed by the capital (Decree 432/2012 annexes) in this
  district: "FÖRI", "district body", "both", or "unknown".
- field "agreement": any agreement between the capital, the district, FÖRI and the district body
  that shifts competence (e.g. the four-party agreements of 2014 and their later changes, such as the
  2021–2022 change for the V. district), with its reference number and date, or "none found".
Start from fori.hu, einfoszab.budapest.hu (Fővárosi Közgyűlés documents) and each district's own site.
Also return one item ref "FORI-scope" describing FÖRI's general competence with sources.`,
  },
  {
    key: 'directoryA',
    label: `contacts, districts ${DISTRICTS_A} + FÖRI (task 1.2)`,
    model: 'sonnet', effort: 'medium', sceptEffort: 'medium',
    prompt: `${COMMON}

TASK 1.2 (part A) — contact details for districts ${DISTRICTS_A}, plus FÖRI.
For each district, two bodies:
1. The district's public-space enforcement body (közterület-felügyelet / önkormányzati rendészet;
   if the district has none, say so and skip to the police).
2. The district police station (BRFK … Kerületi Rendőrkapitányság) covering that district.
For each body return items (ref "<district>-<enforcement|police>-<field>"), field one of:
"name", "email" (the address the body publishes for reports from the public — prefer a dedicated
reporting address; give the general one only if no reporting address exists, and say which in note),
"phone" (prefer a 24-hour or dispatcher line, note which), "address", "reportPage" (URL of the page
that explains how to report problems). For FÖRI use ref "FORI-<field>" with the same fields.
Police e-mail addresses are often not published for public reports — if so, value "" and note
where police.hu says reports should go.`,
  },
  {
    key: 'directoryB',
    label: `contacts, districts ${DISTRICTS_B} (task 1.2)`,
    model: 'sonnet', effort: 'medium', sceptEffort: 'medium',
    prompt: `${COMMON}

TASK 1.2 (part B) — contact details for districts ${DISTRICTS_B}.
For each district, two bodies:
1. The district's public-space enforcement body (közterület-felügyelet / önkormányzati rendészet;
   if the district has none, say so and skip to the police).
2. The district police station (BRFK … Kerületi Rendőrkapitányság) covering that district.
For each body return items (ref "<district>-<enforcement|police>-<field>"), field one of:
"name", "email" (the address the body publishes for reports from the public — prefer a dedicated
reporting address; give the general one only if no reporting address exists, and say which in note),
"phone" (prefer a 24-hour or dispatcher line, note which), "address", "reportPage" (URL of the page
that explains how to report problems).
Police e-mail addresses are often not published for public reports — if so, value "" and note
where police.hu says reports should go.`,
  },
  {
    key: 'offences',
    label: 'offence types and legal references (task 1.6)',
    model: undefined, effort: 'medium', sceptEffort: 'high',
    prompt: `${COMMON}

TASK 1.6 — the offence pick-list in SPEC section 6 and the e-mail template in SPEC section 7.
For each offence type in SPEC section 6 return items (ref "OFF-<n>"):
- field "legalRef": the exact provision of KRESZ (1/1975. (II. 5.) KPM–BM együttes rendelet), e.g.
  "40. § (5) b)", from the CURRENT consolidated text on njt.jog.gov.hu or net.jogtar.hu, with a quote.
- field "sentence": one neutral Hungarian sentence for the e-mail describing the offence
  (e.g. "a jármű a járdán várakozott"), and in note any distance rule (5 m, 15 m, …) that applies.
Also check: whether "Zöldterületen" and "Rakodóhelyen" are KRESZ matters or local municipal rules
(name the decree), and add any common Budapest stopping/waiting offence that is missing (ref "OFF-new-<n>").
Finally item ref "TEMPLATE": read the template in SPEC section 7 and report anything legally wrong or
risky in its Hungarian wording (it must not promise or demand a fine). The owner already corrected the
closing sentence to "…valamint tájékoztatást az eljárás menetéről." — keep that.`,
  },
]

phase('Research')
const results = await pipeline(
  JOBS,
  (job) => agent(job.prompt, {
    label: `research: ${job.label}`,
    phase: 'Research',
    agentType: 'researcher',
    schema: RESEARCH_SCHEMA,
    ...(job.model ? { model: job.model } : {}),
    effort: job.effort,
  }),
  (research, job) => {
    if (!research) { log(`research for ${job.key} returned nothing — skipped its sceptic`); return null }
    log(`${job.key}: ${research.items.length} items, ${research.gaps.length} gaps — verifying`)
    return agent(`${COMMON}

You are the sceptic for ParkStop ${job.label}. Below is a researcher's JSON result. Try to prove each
item wrong. For EVERY item with a non-empty value, re-open its source URL yourself and check the exact
value (e-mail addresses and phone numbers character by character) and that the source is official.
For legal claims, read the cited provision in its current consolidated text. Items with an empty value:
check briefly whether an official page does give the value (if so, REFUTED with correctedValue).
Return one verdict per item ref. List in "missed" anything important the researcher overlooked.

RESEARCHER RESULT:
${JSON.stringify(research)}`, {
      label: `sceptic: ${job.label}`,
      phase: 'Verify',
      agentType: 'sceptic',
      schema: VERDICT_SCHEMA,
      effort: job.sceptEffort,
    }).then((verdicts) => ({ key: job.key, label: job.label, research, verdicts }))
  },
)

const done = results.filter(Boolean)
for (const r of done) {
  const v = (r.verdicts && r.verdicts.verdicts) || []
  const count = (k) => v.filter((x) => x.verdict === k).length
  log(`${r.key}: ${count('CONFIRMED')} confirmed, ${count('REFUTED')} refuted, ${count('UNVERIFIABLE')} unverifiable`)
}
if (done.length < JOBS.length) log(`${JOBS.length - done.length} job(s) produced no result`)
return done
