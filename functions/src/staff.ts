/**
 * Multi-branch staff provisioning — owner-only callables.
 *
 * These move branch-user creation off the client (where the previous
 * `Auth.createStaff` helper used a secondary Firebase app in the owner's
 * browser) and onto the Admin SDK, so:
 *   - the caller is verified by ID token, not by "who opened the page",
 *   - custom claims + users/{uid} doc are written atomically,
 *   - every provisioning action lands in the auditLogs collection.
 *
 * All callables here require the caller's custom claim role === 'owner'.
 * A branch admin cannot create or edit users, cannot change their own
 * branchId, cannot reset another user's password.
 */

import { onCall, HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

type Role = 'owner' | 'branch' | 'staff' | 'none';

interface RoleClaim {
  role: Role;
  branchId?: string;
}

async function requireOwner(auth: CallableRequest['auth']): Promise<{ uid: string }> {
  if (!auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const user = await getAuth().getUser(auth.uid);
  const claim = (user.customClaims || {}) as Partial<RoleClaim>;
  let role = claim.role;
  if (role !== 'owner') {
    // Fallback: some legacy owner accounts only have the users/{uid} doc.
    const doc = await getFirestore().doc(`users/${auth.uid}`).get();
    role = (doc.exists ? (doc.data() as Partial<RoleClaim>).role : undefined) || 'none';
  }
  if (role !== 'owner') throw new HttpsError('permission-denied', 'Owner only.');
  return { uid: auth.uid };
}

async function writeAudit(entry: {
  actorUid: string;
  action: string;
  targetUid?: string;
  branchId?: string | null;
  details?: Record<string, unknown>;
}): Promise<void> {
  await getFirestore().collection('auditLogs').add({
    ...entry,
    at: FieldValue.serverTimestamp(),
  });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-zA-Z0-9_.-]{2,32}$/;

interface CreateBranchUserData {
  email: string;
  password: string;
  username?: string;         // displayName in Firebase Auth
  branchId: string;
  role?: 'branch' | 'staff'; // default 'branch'
}

/**
 * Owner-only: provision a new branch/staff user. Sets email + password +
 * displayName, writes users/{uid} with {role, branchId, username}, mints
 * the custom claim so branch rules gate correctly on first sign-in, and
 * logs the action.
 */
export const createBranchUser = onCall<CreateBranchUserData>(
  async (req: CallableRequest<CreateBranchUserData>) => {
    const { uid: actorUid } = await requireOwner(req.auth);
    const { email, password, username, branchId, role: roleIn } = req.data ?? ({} as CreateBranchUserData);
    const role: 'branch' | 'staff' = roleIn === 'staff' ? 'staff' : 'branch';

    if (typeof email !== 'string' || !EMAIL_RE.test(email)) {
      throw new HttpsError('invalid-argument', 'Valid email required.');
    }
    if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
      throw new HttpsError('invalid-argument', 'Password must be 8–128 characters.');
    }
    if (typeof branchId !== 'string' || branchId.length === 0 || branchId.length > 40) {
      throw new HttpsError('invalid-argument', 'branchId required.');
    }
    if (username != null && (typeof username !== 'string' || !USERNAME_RE.test(username))) {
      throw new HttpsError('invalid-argument', 'Username may be 2–32 chars of letters, digits, . _ -');
    }

    // Reject creating a duplicate email. getUserByEmail throws when not found,
    // which is what we want — the "already exists" branch is the error path.
    try {
      await getAuth().getUserByEmail(email);
      throw new HttpsError('already-exists', 'A user with that email already exists.');
    } catch (e: any) {
      if (e instanceof HttpsError) throw e;
      if (e && e.code !== 'auth/user-not-found') {
        throw new HttpsError('internal', 'Auth lookup failed.');
      }
    }

    // Verify branch exists so the user isn't stranded on a typo'd branchId.
    const branchSnap = await getFirestore().doc(`branches/${branchId}`).get();
    if (!branchSnap.exists) throw new HttpsError('not-found', 'Branch does not exist.');

    const created = await getAuth().createUser({
      email,
      password,
      emailVerified: false,
      disabled: false,
      displayName: username || email.split('@')[0],
    });

    await getAuth().setCustomUserClaims(created.uid, { role, branchId });
    await getFirestore().doc(`users/${created.uid}`).set(
      {
        email,
        username: username || null,
        role,
        branchId,
        status: 'active',
        createdAt: FieldValue.serverTimestamp(),
        createdBy: actorUid,
      },
      { merge: true },
    );

    await writeAudit({
      actorUid,
      action: 'staff.create',
      targetUid: created.uid,
      branchId,
      details: { email, username: username || null, role },
    });

    return { ok: true, uid: created.uid, email, branchId, role };
  },
);

interface ResetBranchUserPasswordData {
  targetUid: string;
  newPassword: string;
}

/**
 * Owner-only direct password reset. Does not send an email — the owner
 * hands the new credential to the branch manager in person / on a call.
 * Firebase's sendPasswordResetEmail flow is still available client-side
 * as a fallback for staff who know their own email.
 */
export const resetBranchUserPassword = onCall<ResetBranchUserPasswordData>(
  async (req: CallableRequest<ResetBranchUserPasswordData>) => {
    const { uid: actorUid } = await requireOwner(req.auth);
    const { targetUid, newPassword } = req.data ?? ({} as ResetBranchUserPasswordData);
    if (typeof targetUid !== 'string' || !targetUid) {
      throw new HttpsError('invalid-argument', 'targetUid required.');
    }
    if (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 128) {
      throw new HttpsError('invalid-argument', 'Password must be 8–128 characters.');
    }
    await getAuth().updateUser(targetUid, { password: newPassword });
    await writeAudit({ actorUid, action: 'staff.resetPassword', targetUid });
    return { ok: true };
  },
);

interface SetBranchUserStatusData {
  targetUid: string;
  disabled: boolean;
}

/**
 * Owner-only enable / disable of a staff account. Disabling revokes the
 * user's refresh tokens so any active session is cut on next token refresh.
 * Refuses to disable the last remaining owner.
 */
export const setBranchUserStatus = onCall<SetBranchUserStatusData>(
  async (req: CallableRequest<SetBranchUserStatusData>) => {
    const { uid: actorUid } = await requireOwner(req.auth);
    const { targetUid, disabled } = req.data ?? ({} as SetBranchUserStatusData);
    if (typeof targetUid !== 'string' || !targetUid) {
      throw new HttpsError('invalid-argument', 'targetUid required.');
    }
    if (typeof disabled !== 'boolean') {
      throw new HttpsError('invalid-argument', 'disabled must be boolean.');
    }

    if (disabled) {
      const target = await getAuth().getUser(targetUid);
      const claim = (target.customClaims || {}) as Partial<RoleClaim>;
      if (claim.role === 'owner') {
        const owners = await getFirestore().collection('users').where('role', '==', 'owner').get();
        if (owners.size <= 1) {
          throw new HttpsError('failed-precondition', 'Refusing to disable the only owner.');
        }
      }
    }

    await getAuth().updateUser(targetUid, { disabled });
    if (disabled) await getAuth().revokeRefreshTokens(targetUid);
    await getFirestore().doc(`users/${targetUid}`).set(
      { status: disabled ? 'disabled' : 'active', updatedAt: FieldValue.serverTimestamp(), updatedBy: actorUid },
      { merge: true },
    );
    await writeAudit({ actorUid, action: disabled ? 'staff.disable' : 'staff.enable', targetUid });
    return { ok: true };
  },
);

interface DeleteBranchUserData {
  targetUid: string;
}

/**
 * Owner-only hard delete. Removes the Auth user and the users/{uid} doc.
 * The audit log entry survives — that's the point of the audit log.
 */
export const deleteBranchUser = onCall<DeleteBranchUserData>(
  async (req: CallableRequest<DeleteBranchUserData>) => {
    const { uid: actorUid } = await requireOwner(req.auth);
    const { targetUid } = req.data ?? ({} as DeleteBranchUserData);
    if (typeof targetUid !== 'string' || !targetUid) {
      throw new HttpsError('invalid-argument', 'targetUid required.');
    }
    if (targetUid === actorUid) {
      throw new HttpsError('failed-precondition', 'Refusing to delete yourself.');
    }
    const target = await getAuth().getUser(targetUid);
    const claim = (target.customClaims || {}) as Partial<RoleClaim>;
    if (claim.role === 'owner') {
      const owners = await getFirestore().collection('users').where('role', '==', 'owner').get();
      if (owners.size <= 1) {
        throw new HttpsError('failed-precondition', 'Refusing to delete the only owner.');
      }
    }
    await getAuth().deleteUser(targetUid);
    await getFirestore().doc(`users/${targetUid}`).delete();
    await writeAudit({ actorUid, action: 'staff.delete', targetUid, details: { email: target.email || null } });
    return { ok: true };
  },
);
