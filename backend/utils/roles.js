/**
 * Single source of truth for roles.
 *
 * The role list was previously duplicated across the User schema, the auth
 * middleware, the users route and the frontend portal layout, which meant
 * adding a role required four edits and any missed one silently failed.
 */

const ROLES = {
  MEMBER: 'member',
  SUPERADMIN: 'superadmin',
  ADMIN: 'admin',
  CHAIRPERSON: 'chairperson',
  VICE_CHAIRPERSON: 'vice_chairperson',
  ORGANIZING_SECRETARY: 'organizing_secretary',
  SECRETARY_GENERAL: 'secretary_general',
  PUBLICITY_MANAGER: 'publicity_manager',
  PROJECT_MANAGER: 'project_manager',
  PATRON: 'patron',
  FIRST_COHORT_REP: '1st_cohort_rep',
  TREASURER: 'treasurer'
};

const ALL_ROLES = Object.values(ROLES);

/**
 * The superadmin runs the platform itself: everything an admin can do, plus
 * maintenance mode, feature switches, the audit log and system health. It is
 * granted only by scripts/superadmin.js on the server, never through the API,
 * so a stolen admin session cannot escalate to it.
 */
const ASSIGNABLE_ROLES = ALL_ROLES.filter((role) => role !== ROLES.SUPERADMIN);

/** Roles allowed to create and edit association content. */
const LEADERSHIP_ROLES = [
  ROLES.SUPERADMIN,
  ROLES.ADMIN,
  ROLES.CHAIRPERSON,
  ROLES.VICE_CHAIRPERSON,
  ROLES.ORGANIZING_SECRETARY,
  ROLES.SECRETARY_GENERAL,
  ROLES.PUBLICITY_MANAGER,
  ROLES.PROJECT_MANAGER,
  ROLES.PATRON,
  ROLES.FIRST_COHORT_REP,
  ROLES.TREASURER
];

/** System roles rather than offices of the association. */
const SYSTEM_ROLES = [ROLES.SUPERADMIN, ROLES.ADMIN];

/**
 * The association's offices: every leadership role except the system roles.
 * Terms in these offices are recorded, and their holders can be given
 * leadership certificates.
 */
const OFFICE_ROLES = LEADERSHIP_ROLES.filter((role) => !SYSTEM_ROLES.includes(role));

/** Full administrators: role changes and other admins' accounts. */
const FULL_ADMIN_ROLES = [ROLES.SUPERADMIN, ROLES.ADMIN];

/** Roles allowed to approve content, verify payments and manage members. */
const POWER_ROLES = [ROLES.SUPERADMIN, ROLES.ADMIN, ROLES.CHAIRPERSON];

/** Roles that run the merchandise shop: products, orders and their payments. */
const MERCHANDISE_ROLES = [ROLES.SUPERADMIN, ROLES.ADMIN, ROLES.CHAIRPERSON, ROLES.TREASURER];

/** Human-readable labels, shared with the frontend via GET /api/auth/roles. */
const ROLE_LABELS = {
  [ROLES.MEMBER]: 'Member',
  [ROLES.SUPERADMIN]: 'Super Admin',
  [ROLES.ADMIN]: 'Admin',
  [ROLES.CHAIRPERSON]: 'Chairperson',
  [ROLES.VICE_CHAIRPERSON]: 'Vice Chairperson',
  [ROLES.ORGANIZING_SECRETARY]: 'Organizing Secretary',
  [ROLES.SECRETARY_GENERAL]: 'Secretary General',
  [ROLES.PUBLICITY_MANAGER]: 'Publicity Manager',
  [ROLES.PROJECT_MANAGER]: 'Project Manager',
  [ROLES.PATRON]: 'Patron',
  [ROLES.FIRST_COHORT_REP]: '1st Cohort Rep',
  [ROLES.TREASURER]: 'Treasurer'
};

const isLeadership = (role) => LEADERSHIP_ROLES.includes(role);
const isOffice = (role) => OFFICE_ROLES.includes(role);
const isPower = (role) => POWER_ROLES.includes(role);
const isMerchandise = (role) => MERCHANDISE_ROLES.includes(role);
const isFullAdmin = (role) => FULL_ADMIN_ROLES.includes(role);
const isSuperadmin = (role) => role === ROLES.SUPERADMIN;
const labelFor = (role) => ROLE_LABELS[role] || role;

module.exports = {
  ROLES, ALL_ROLES, ASSIGNABLE_ROLES, LEADERSHIP_ROLES, OFFICE_ROLES, SYSTEM_ROLES, FULL_ADMIN_ROLES, POWER_ROLES,
  MERCHANDISE_ROLES, ROLE_LABELS,
  isLeadership, isOffice, isPower, isMerchandise, isFullAdmin, isSuperadmin, labelFor
};
