import {
  doc, collection, getDoc, setDoc, addDoc, updateDoc,
  onSnapshot, runTransaction, serverTimestamp, deleteField, query, orderBy,
} from 'firebase/firestore';
import { db, ensureUser, currentUid } from './firebase.js';
import { generateCode, newId, tripPeople } from './logic.js';

const tripRef = (code) => doc(db, 'trips', code);
const entriesRef = (code) => collection(db, 'trips', code, 'entries');

export async function createTrip({ name, currency, people }) {
  await ensureUser();
  // Retry in the (astronomically unlikely) event of a code collision.
  for (let i = 0; i < 5; i++) {
    const code = generateCode();
    const ref = tripRef(code);
    const created = await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists()) return false;
      tx.set(ref, {
        name: name.trim(),
        currency,
        people: people.map((n) => ({ id: newId(), name: n.trim() })),
        createdAt: serverTimestamp(),
        createdUid: currentUid(),
      });
      return true;
    });
    if (created) return code;
  }
  throw new Error('Could not create trip, please try again');
}

export async function tripExists(code) {
  const snap = await getDoc(tripRef(code));
  return snap.exists();
}

/**
 * onData(trip, { fromCache }): trip is null when the document doesn't exist.
 * A missing trip with fromCache=true means "couldn't reach the server yet", not "not found".
 */
export function watchTrip(code, onData, onError) {
  return onSnapshot(
    tripRef(code),
    { includeMetadataChanges: true },
    (snap) => onData(snap.exists() ? { code, ...snap.data() } : null, { fromCache: snap.metadata.fromCache }),
    onError,
  );
}

export function watchEntries(code, onData, onError) {
  return onSnapshot(
    query(entriesRef(code), orderBy('createdAt', 'desc')),
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }))),
    onError,
  );
}

export async function updateTrip(code, fields) {
  await ensureUser();
  return updateDoc(tripRef(code), fields);
}

/**
 * Add someone. The people list is append-only (the rules enforce it), so this appends in a
 * transaction. If a *removed* person has the same name, they're brought back instead, keeping
 * their id and history.
 */
export async function addPerson(code, rawName) {
  await ensureUser();
  const name = rawName.trim();
  return runTransaction(db, async (tx) => {
    const ref = tripRef(code);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Trip not found');
    const all = tripPeople(snap.data());
    const same = all.filter((p) => p.name.toLowerCase() === name.toLowerCase());
    if (same.some((p) => !p.removed)) throw new Error(`${name} is already in this trip`);
    if (same.length) {
      tx.update(ref, { [`personMeta.${same[0].id}.removed`]: deleteField() });
      return same[0].id;
    }
    const id = newId();
    tx.update(ref, { people: [...(snap.data().people || []), { id, name }] });
    return id;
  });
}

/** Renames are stored in personMeta; the original name in the people list never changes. */
export async function renamePerson(code, id, name) {
  await ensureUser();
  return updateDoc(tripRef(code), { [`personMeta.${id}.name`]: name.trim() });
}

/** Soft removal: hidden from the trip, but restorable (restorePerson) with their id intact. */
export async function removePerson(code, id) {
  await ensureUser();
  return updateDoc(tripRef(code), { [`personMeta.${id}.removed`]: true });
}

export async function restorePerson(code, id) {
  await ensureUser();
  return updateDoc(tripRef(code), { [`personMeta.${id}.removed`]: deleteField() });
}

export async function addEntry(code, entry) {
  await ensureUser(); // instant for a device that has signed in before, even offline
  const uid = currentUid();
  return addDoc(entriesRef(code), {
    ...entry,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy: entry.createdBy ?? null,
    createdUid: uid,
    updatedUid: uid,
  });
}

/** `by` = person id of whoever is making the edit (or null). createdAt/createdBy must be passed through unchanged. */
export async function updateEntry(code, id, entry, by) {
  await ensureUser();
  // setDoc (not merge) so switching split modes doesn't leave stale parts behind
  const { id: _omit, deletedAt: _d, deletedBy: _db, ...rest } = entry;
  return setDoc(doc(entriesRef(code), id), {
    ...rest,
    createdUid: entry.createdUid ?? null, // pass the original through; older entries have none
    updatedAt: serverTimestamp(),
    updatedBy: by ?? null,
    updatedUid: currentUid(),
  });
}

/** Soft delete: the rules forbid real deletes, so anything removed can be restored. */
export async function deleteEntry(code, id, by) {
  await ensureUser();
  return updateDoc(doc(entriesRef(code), id), {
    deletedAt: serverTimestamp(),
    deletedBy: by ?? null,
    updatedAt: serverTimestamp(),
    updatedBy: by ?? null,
    updatedUid: currentUid(),
  });
}

export async function restoreEntry(code, id, by) {
  await ensureUser();
  return updateDoc(doc(entriesRef(code), id), {
    deletedAt: deleteField(),
    deletedBy: deleteField(),
    updatedAt: serverTimestamp(),
    updatedBy: by ?? null,
    updatedUid: currentUid(),
  });
}
