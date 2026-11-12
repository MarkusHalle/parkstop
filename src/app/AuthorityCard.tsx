// Roadmap 2.4: the responsible-authority card with alternatives and manual override
// (SPEC 4.2, D20, D21). Lives in app/ because src/authority/ is pure (SPEC 8 rules).
import { hu } from '../i18n/hu'
import authoritiesData from '../data/authorities.json'
import type { Authority, Confidence, Reason, Resolution } from '../authority/types'
import type { AddressState } from '../map/types'
import { AddressField } from './AddressField'
import { shortDate, telHref } from './format'
import { IconCheck, IconInfo, IconPhone, IconWarn } from './icons'

type Resolved = Extract<Resolution, { kind: 'resolved' }>

export function reasonText(r: Reason): string {
  const t = hu.authority.reason
  const road = (x: { name: string; section: string | null }) => (x.section ? `${x.name}, ${x.section}` : x.name)
  switch (r.code) {
    case 'district-street': return t.districtStreet
    case 'no-own-body': return t.noOwnBody
    case 'capital-road': return t.capitalRoad(road(r.road))
    case 'capital-road-edge': return t.capitalRoadEdge(road(r.road), Math.round(r.road.distanceM))
    case 'capital-road-unplaced': return t.capitalRoadUnplaced(road(r.road))
    case 'capital-square': return t.capitalSquare(road(r.road))
    case 'district-acts-on': return t.districtActsOn(road(r.road))
    case 'district-acts-on-partial': return t.districtActsOnPartial(r.road.name, r.sectionText)
    case 'no-district': return t.noDistrict(r.areaName)
  }
}

export function ConfidenceChip({ value }: { value: Confidence }) {
  const cls = value === 'biztos' ? 'chip-ok' : value === 'valószínű' ? 'chip-info' : 'chip-warn'
  return (
    <span className={`chip ${cls}`}>
      {value === 'biztos' ? <IconCheck /> : value === 'valószínű' ? <IconInfo size={14} /> : <IconWarn size={14} />}
      {hu.authority.confidence[value]}
    </span>
  )
}

/** All recipients the user can pick, primary first. */
export function recipients(r: Resolved): { authority: Authority; hint: string }[] {
  return [
    { authority: r.primary, hint: hu.authority.role.recommended },
    ...r.alternatives.map((a) => ({ authority: a.authority, hint: hu.authority.role[a.role] })),
  ]
}

interface Props {
  resolution: Resolution | null
  loadError: boolean
  address: string
  addressStatus: AddressState['status']
  onAddressChange: (a: string) => void
  selectedId: string | null
  onSelect: (id: string) => void
  onMovePin: () => void
}

export function AuthorityCard(p: Props) {
  if (p.loadError) {
    return (
      <div className="notice notice-error notice-action" role="alert">
        <p>{hu.authority.loadError}</p>
        <button type="button" className="btn btn-secondary btn-small" onClick={() => window.location.reload()}>{hu.authority.reload}</button>
      </div>
    )
  }
  if (!p.resolution) return <p className="muted" role="status">{hu.authority.loading}</p>

  if (p.resolution.kind === 'outside') {
    return (
      <section className="card-plain" aria-live="polite">
        <div className="notice notice-warn">
          <IconWarn size={20} />
          <div>
            <h2 className="notice-title">{hu.authority.outsideTitle}</h2>
            <p>{hu.authority.outsideBody}</p>
          </div>
        </div>
        <button type="button" className="btn btn-secondary" onClick={p.onMovePin}>{hu.authority.outsideMove}</button>
      </section>
    )
  }

  const r = p.resolution
  const list = recipients(r)
  const selected = list.find((x) => x.authority.id === p.selectedId)?.authority ?? r.primary

  return (
    <section className="authority" aria-live="polite">
      <div className="row-between">
        <span className="eyebrow">{hu.authority.heading}</span>
        <ConfidenceChip value={r.confidence} />
      </div>
      <h1 className="title">{r.primary.name}</h1>
      <AddressField address={p.address} status={p.addressStatus} districtRoman={r.districtRoman} onChange={p.onAddressChange} />
      <p className="notice notice-info">{reasonText(r.reason)}</p>
      {r.nearBorder?.roman && <p className="notice notice-info">{hu.authority.nearBorder(r.nearBorder.roman)}</p>}
      {r.stale && <p className="notice notice-warn"><IconWarn />{hu.authority.stale}</p>}

      <fieldset className="choices">
        <legend className="eyebrow">{hu.authority.chooseLegend}</legend>
        {list.map(({ authority, hint }) => (
          <label key={authority.id} className="choice">
            <input type="radio" name="recipient" value={authority.id} checked={authority.id === selected.id}
              onChange={() => p.onSelect(authority.id)} />
            <span className="choice-text">
              <span className="choice-name">{authority.name}</span>
              <span className="choice-hint">{hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <Contact authority={selected} />
    </section>
  )
}

function Contact({ authority: a }: { authority: Authority }) {
  return (
    <div className="contact">
      {a.prefersPhone && a.phone && <p className="notice notice-warn"><IconPhone />{hu.authority.phoneFirst}</p>}
      {a.phone && (
        <div className="phone-box">
          <div>
            <p className="phone-title">{hu.authority.phoneTitle}</p>
            <p className="muted small">{hu.authority.phoneHint}</p>
          </div>
          <a className={`btn ${a.prefersPhone ? 'btn-primary' : 'btn-secondary'} btn-small`} href={telHref(a.phone)}>
            <IconPhone />{hu.authority.call(a.phone)}
          </a>
          {a.phoneNote && <p className="muted small">{a.phoneNote}</p>}
        </div>
      )}
      <p className="small">
        <span className="contact-email">{a.email ?? hu.authority.noEmail}</span>
        {a.email && a.emailNote && <span className="muted"> · {a.emailNote}</span>}
      </p>
      {a.type === 'police' && (
        <p className="notice notice-info small">
          {hu.authority.policeChosen} {authoritiesData.policeNote.hu}
        </p>
      )}
      <p className="muted small">
        {hu.authority.verified(shortDate(a.verifiedOn))} · <a className="source-link" href={a.sourceUrl} target="_blank" rel="noopener noreferrer">{hu.authority.source}</a>
      </p>
    </div>
  )
}
