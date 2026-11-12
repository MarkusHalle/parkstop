// Roadmap 4.2: "Adatkezelés" (SPEC 10). States what stays on the device and which hosts the
// app contacts. Keep in step with SPEC 10 and the end-to-end allow-list (5.1): if a host is
// added there, it must be added here.
import { hu } from '../i18n/hu'
import './help.css'

const t = hu.privacy

export function PrivacyPage() {
  const ownHost = typeof location !== 'undefined' ? location.host : ''
  return (
    <div className="help-page">
      <p className="help-lead">{t.lead}</p>

      <section className="help-block" aria-labelledby="pv-device">
        <h2 id="pv-device" className="help-h2">{t.deviceTitle}</h2>
        <ul>{t.deviceItems.map((x) => <li key={x}>{x}</li>)}</ul>
        <p>{t.deviceNote}</p>
      </section>

      <section className="help-block" aria-labelledby="pv-hosts">
        <h2 id="pv-hosts" className="help-h2">{t.hostsTitle}</h2>
        <p>{t.hostsIntro}</p>
        <dl className="help-hosts">
          <div>
            <dt><code>{ownHost || t.ownHostFallback}</code></dt>
            <dd>{t.ownHost}</dd>
          </div>
          <div>
            <dt><code>tiles.openfreemap.org</code></dt>
            <dd>{t.tiles}</dd>
          </div>
          <div>
            <dt><code>nominatim.openstreetmap.org</code></dt>
            <dd>{t.nominatim}</dd>
          </div>
        </dl>
        <p>{t.location}</p>
      </section>

      <section className="help-block" aria-labelledby="pv-mail">
        <h2 id="pv-mail" className="help-h2">{t.mailTitle}</h2>
        <p>{t.mail}</p>
        <p className="help-note">{t.othersPhotos}</p>
      </section>

      <section className="help-block" aria-labelledby="pv-none">
        <h2 id="pv-none" className="help-h2">{t.noneTitle}</h2>
        <ul>{t.noneItems.map((x) => <li key={x}>{x}</li>)}</ul>
      </section>
    </div>
  )
}
