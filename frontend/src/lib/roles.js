/**
 * Role definitions, mirroring backend/utils/roles.js.
 *
 * Kept in one module so pages stop redeclaring the list inline; the portal
 * layout, members page and admin screens each had their own copy, and they had
 * already drifted apart.
 */

export const ROLE_LABELS = {
  member: 'Member',
  admin: 'Admin',
  chairperson: 'Chairperson',
  vice_chairperson: 'Vice Chairperson',
  organizing_secretary: 'Organizing Secretary',
  secretary_general: 'Secretary General',
  publicity_manager: 'Publicity Manager',
  project_manager: 'Project Manager',
  patron: 'Patron',
  '1st_cohort_rep': '1st Cohort Rep',
  treasurer: 'Treasurer',
};

export const ALL_ROLES = Object.keys(ROLE_LABELS);

/** Office holders: may create and edit association content. */
export const LEADERSHIP_ROLES = [
  'admin', 'chairperson', 'vice_chairperson', 'organizing_secretary',
  'secretary_general', 'publicity_manager', 'project_manager', 'patron',
  '1st_cohort_rep', 'treasurer',
];

/** May approve content, verify payments and manage members. */
export const POWER_ROLES = ['admin', 'chairperson'];

export const roleLabel = (role) => ROLE_LABELS[role] || role;
export const isLeadership = (role) => LEADERSHIP_ROLES.includes(role);
export const isPower = (role) => POWER_ROLES.includes(role);

export const DEPARTMENTS = [
  'Civil Engineering',
  'Mechanical Engineering',
  'Electrical Engineering',
  'Agricultural Engineering',
  'Industrial Technology',
  'Other',
];
