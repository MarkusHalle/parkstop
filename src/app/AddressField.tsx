// The street address line: shown as text with "Módosítás", editable by hand (F-MAP-5).
import { useId, useState } from 'react'
import { hu } from '../i18n/hu'
import type { AddressState } from '../map/types'

interface Props {
  address: string
  status: AddressState['status']
  districtRoman: string | null
  onChange: (address: string) => void
  /** Show the input straight away (no address yet, or the form flagged it). */
  forceEdit?: boolean
  invalid?: boolean
  inputId?: string
}

export function AddressField({ address, status, districtRoman, onChange, forceEdit, invalid, inputId }: Props) {
  const [editing, setEditing] = useState(false)
  const autoId = useId()
  const id = inputId ?? autoId
  const showInput = editing || forceEdit || (address === '' && status !== 'loading')

  if (!showInput) {
    const district = districtRoman ? `, ${hu.mailTemplate.district(districtRoman)}` : ''
    return (
      <div className="address-line">
        <span>{status === 'loading' && address === '' ? hu.address.looking : `${address}${district}`}</span>
        <button type="button" className="btn-link" onClick={() => setEditing(true)}>{hu.address.edit}</button>
      </div>
    )
  }
  return (
    <div className="field">
      <label htmlFor={id} className="field-label">{hu.address.label}</label>
      <div className="address-edit">
        <input
          id={id}
          className={`input${invalid ? ' input-invalid' : ''}`}
          type="text"
          value={address}
          placeholder={hu.address.placeholder}
          autoComplete="street-address"
          aria-invalid={invalid || undefined}
          onChange={(e) => { setEditing(true); onChange(e.target.value) }}
          onBlur={() => { if (address.trim() !== '') setEditing(false) }}
          onKeyDown={(e) => { if (e.key === 'Enter' && address.trim()) setEditing(false) }}
        />
        {editing && address.trim() !== '' && (
          <button type="button" className="btn btn-secondary btn-small" onClick={() => setEditing(false)}>{hu.address.done}</button>
        )}
      </div>
      {status === 'error' && address === '' && <p className="field-help">{hu.address.notFound}</p>}
      {invalid && <p className="field-error">{hu.address.missing}</p>}
    </div>
  )
}
