import { useState } from 'react';
import { restoreEntry } from '../api.js';
import { canRestore, entryPeople, formatMoney } from '../logic.js';
import { Modal } from './ui.jsx';

function when(ts) {
  const d = ts?.toDate?.();
  return d ? d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '';
}

/** Soft-deleted expenses and payments, with Restore. Nothing is ever permanently deleted. */
export default function Deleted({ code, entries, people, byId, me, currency, onClose, flash }) {
  const [busy, setBusy] = useState(null);
  const name = (id) => byId[id]?.name || 'someone';
  const active = new Set(people.map((p) => p.id));
  const gone = (e) => entryPeople(e).filter((id) => !active.has(id)).map(name);

  async function restore(e) {
    setBusy(e.id);
    try {
      await restoreEntry(code, e.id, me);
      flash(e.type === 'payment' ? 'Payment restored' : 'Expense restored');
      if (entries.length === 1) onClose();
    } catch (er) {
      flash(`Couldn't restore: ${er.message}`);
    }
    setBusy(null);
  }

  return (
    <Modal title="Recently deleted" onClose={onClose}>
      <p className="muted small">Deleted expenses and payments stay here so a mistake (or a prank) can always be undone.</p>
      <ul className="list deleted-list">
        {entries.map((e) => {
          const ok = canRestore(e, people);
          const missing = ok ? [] : [...new Set(gone(e))];
          const by = e.deletedBy && byId[e.deletedBy]?.name;
          return (
            <li key={e.id} className="list-item">
              <div className="grow">
                <div className="strong clamp-2">
                  {e.type === 'payment' ? `${name(e.from)} paid ${name(e.to)}` : e.title}
                </div>
                <div className="muted small">
                  {formatMoney(e.amount, currency)} · deleted {when(e.deletedAt)}{by ? ` by ${by}` : ''}
                </div>
                {!ok && (
                  <div className="small neg">
                    {missing.join(', ')} {missing.length > 1 ? 'were' : 'was'} removed from the trip. Bring them back in People to restore this.
                  </div>
                )}
              </div>
              <button className="btn small-btn" disabled={!ok || busy === e.id} onClick={() => restore(e)}>Restore</button>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
