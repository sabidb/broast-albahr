/**
 * Broast Al Bahr — Cloud Functions
 *
 * Wave 2.1 (post-Blaze). Callables that need privileged Admin-SDK access:
 *   - setRole:  owner assigns role + branchId to a Firebase Auth user. Sets
 *               a custom claim AND mirrors it into `users/{uid}` so today's
 *               rules (which read the users doc) continue to work while the
 *               ecosystem migrates to claim-based checks.
 *   - whoami:   returns the caller's own role + branchId from their custom
 *               claim, so the admin UI can gate itself without an extra
 *               Firestore read on every screen.
 *
 * Every write here comes through the Admin SDK, which bypasses Firestore
 * rules. That's the point — this is the one place role state is minted.
 *
 * Region: me-west1 (co-located with Firestore). Runtime: Node 22.
 */

import { onCall, HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

initializeApp();
setGlobalOptions({ region: 'me-west1', maxInstances: 10 });

type Role = 'owner' | 'branch' | 'staff' | 'none';
const VALID_ROLES: readonly Role[] = ['owner', 'branch', 'staff', 'none'] as const;

interface SetRoleData {
  targetUid: string;
  role: Role;
  branchId?: string;
}

interface RoleClaim {
  role: Role;
  branchId?: string;
}

/**
 * Read the caller's role from BOTH their custom claim AND their users/{uid}
 * doc, returning the strongest. The doc is a bootstrap fallback so the
 * original owner (seeded via scripts/set-owner-role.mjs) can invoke this
 * callable BEFORE their custom claim has been minted for the first time.
 */
async function readCallerRole(uid: string): Promise<RoleClaim> {
  const [userRecord, docSnap] = await Promise.all([
    getAuth().getUser(uid),
    getFirestore().doc(`users/${uid}`).get(),
  ]);
  const claim = (userRecord.customClaims || {}) as Partial<RoleClaim>;
  const doc = docSnap.exists ? (docSnap.data() as Partial<RoleClaim>) : {};
  const role = (claim.role || doc.role || 'none') as Role;
  const branchId = claim.branchId || doc.branchId;
  return { role, branchId };
}

export const setRole = onCall<SetRoleData>(async (req: CallableRequest<SetRoleData>) => {
  if (!req.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const caller = await readCallerRole(req.auth.uid);
  if (caller.role !== 'owner') {
    throw new HttpsError('permission-denied', 'Only owners can assign roles.');
  }

  const { targetUid, role, branchId } = req.data ?? ({} as SetRoleData);
  if (typeof targetUid !== 'string' || targetUid.length === 0 || targetUid.length > 128) {
    throw new HttpsError('invalid-argument', 'targetUid must be a non-empty string up to 128 chars.');
  }
  if (!VALID_ROLES.includes(role)) {
    throw new HttpsError('invalid-argument', `role must be one of ${VALID_ROLES.join(', ')}.`);
  }
  if (role === 'branch') {
    if (typeof branchId !== 'string' || branchId.length === 0 || branchId.length > 40) {
      throw new HttpsError('invalid-argument', 'branchId is required for role="branch".');
    }
  }

  // Prevent the last owner from demoting themselves. A restaurant with zero
  // owners has no way to promote anyone back — this callable itself refuses
  // to run without an owner caller.
  if (targetUid === req.auth.uid && role !== 'owner') {
    const staff = await getFirestore()
      .collection('users')
      .where('role', '==', 'owner')
      .get();
    if (staff.size <= 1) {
      throw new HttpsError(
        'failed-precondition',
        'Refusing to demote the only owner. Promote another user to owner first.',
      );
    }
  }

  const claim: RoleClaim = { role };
  if (role === 'branch' && branchId) claim.branchId = branchId;

  // Custom claim on the Auth user + mirror the same shape into the users doc
  // so the current rule set (which reads the doc) keeps working. Both writes
  // are best-effort atomic — if either throws, the caller can retry safely
  // (both writes are idempotent for the same input).
  await getAuth().setCustomUserClaims(targetUid, claim);
  await getFirestore().doc(`users/${targetUid}`).set(
    {
      role,
      branchId: role === 'branch' ? branchId : FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: req.auth.uid,
    },
    { merge: true },
  );

  return {
    ok: true,
    targetUid,
    role,
    branchId: role === 'branch' ? branchId : null,
    // The custom claim only lands in the target user's ID token after they
    // sign out and back in (or after their token refreshes ~1h later). The
    // admin UI shows this note on success.
    signOutRequired: true,
  };
});

export const whoami = onCall(async (req) => {
  if (!req.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const { role, branchId } = await readCallerRole(req.auth.uid);
  return { uid: req.auth.uid, role, branchId: branchId ?? null };
});
