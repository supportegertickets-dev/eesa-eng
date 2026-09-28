const AuditLog = require('../models/AuditLog');

/**
 * Record a sensitive action in the audit log.
 *
 * Never throws: the action has already happened by the time it is recorded,
 * and failing the request over a log write would tell the administrator it
 * did not. A failed write is logged to the console instead.
 *
 * @param {object} req the request, for the actor and address; may be null for the server script
 * @param {object} entry
 * @param {string} entry.action dotted, category first, e.g. 'members.role'
 * @param {string} entry.summary one sentence a person can read
 * @param {{ type: string, id?: *, label?: string }} [entry.target]
 * @param {object} [entry.details]
 * @param {object} [entry.actor] overrides req.user, or `null` for no actor
 * @param {string} [entry.actorName] when there is no account, e.g. 'Server script'
 */
const recordAudit = async (req, { action, summary, target, details, actor, actorName }) => {
  const who = actor === undefined ? req?.user : actor;
  try {
    await AuditLog.create({
      action,
      category: action.split('.')[0],
      summary,
      actor: who?._id,
      actorName: who ? [who.firstName, who.lastName].filter(Boolean).join(' ') : actorName,
      actorRole: who?.role,
      targetType: target?.type,
      targetId: target?.id,
      targetLabel: target?.label,
      details,
      ip: req?.ip,
      userAgent: req?.get?.('user-agent')?.slice(0, 200)
    });
  } catch (error) {
    console.error(`Audit log write failed for ${action}:`, error.message);
  }
};

const nameOf = (user) => [user.firstName, user.lastName].filter(Boolean).join(' ');

/** An account as an audit target. */
const userTarget = (user) => ({ type: 'user', id: user._id, label: `${nameOf(user)}${user.email ? ` (${user.email})` : ''}` });

module.exports = { recordAudit, userTarget, nameOf };
