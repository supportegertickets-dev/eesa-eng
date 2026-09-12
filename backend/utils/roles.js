/**
 * Single source of truth for roles.
 *
 * The role list was previously duplicated across the User schema, the auth
 * middleware, the users route and the frontend portal layout, which meant
 * adding a role required four edits and any missed one silently failed.
 */

const ROLES = {
  MEMBER: 'member',
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

/** Roles allowed to create and edit association content. */
const LEADERSHIP_ROLES = [
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

/** Roles allowed to approve content, verify payments and manage members. */
const POWER_ROLES = [ROLES.ADMIN, ROLES.CHAIRPERSON];

/** Human-readable labels, shared with the frontend via GET /api/auth/roles. */
const ROLE_LABELS = {
  [ROLES.MEMBER]: 'Member',
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
const isPower = (role) => POWER_ROLES.includes(role);
const labelFor = (role) => ROLE_LABELS[role] || role;

module.exports = {
  ROLES, ALL_ROLES, LEADERSHIP_ROLES, POWER_ROLES, ROLE_LABELS,
  isLeadership, isPower, labelFor
};
