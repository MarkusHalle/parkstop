// Roadmap 4.2: "Súgó" (help), opened from the ? icon in the header (owner, M4 mockups).
// Native <details> sections: keyboard and screen-reader friendly without extra code.
import authorities from '../data/authorities.json'
import { hu } from '../i18n/hu'
import { APP_VERSION } from '../settings'
import { oldestVerifiedOn } from './dataDate'
import './help.css'

const t = hu.help
const dataDate = oldestVerifiedOn(authorities)

export function HelpPage({ onPrivacy }: { onPrivacy: () => void }) {
  return (
    <div className="help-page">
      <p className="help-lead">{t.lead}</p>
      <div className="help-card">
        {t.sections.map((s) => (
          <details key={s.title} className="help-section">
            <summary>{s.title}</summary>
            <div className="help-body">
              {s.paras.map((p) => <p key={p}>{p}</p>)}
              {'steps' in s && (
                <ol>{s.steps.map((x) => <li key={x}>{x}</li>)}</ol>
              )}
              {'items' in s && (
                <ul>{s.items.map((x) => <li key={x}>{x}</li>)}</ul>
              )}
              {'after' in s && <p>{s.after}</p>}
            </div>
          </details>
        ))}
        <button type="button" className="help-link-row" onClick={onPrivacy}>
          <span>{hu.privacy.title}</span>
          <svg className="help-chevron" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      <p className="help-footer">
        {t.version(APP_VERSION)}
        {dataDate && <><br />{t.dataChecked(dataDate.replaceAll('-', '. ') + '.')}</>}
      </p>
    </div>
  )
}
