/**
 * Role definitions, mirroring backend/utils/roles.js.
 *
 * Kept in one module so pages stop redeclaring the list inline; the portal
 * layout, members page and admin screens each had their own copy, and they had
 * already drifted apart.
 */

export const ROLE_LABELS = {
  member: 'Member',
  superadmin: 'Super Admin',
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

/**
 * Roles that can be given from the website. The superadmin runs the platform
 * and is granted only on the server (npm run superadmin).
 */
export const ASSIGNABLE_ROLES = ALL_ROLES.filter((role) => role !== 'superadmin');

/** Office holders: may create and edit association content. */
export const LEADERSHIP_ROLES = [
  'superadmin', 'admin', 'chairperson', 'vice_chairperson', 'organizing_secretary',
  'secretary_general', 'publicity_manager', 'project_manager', 'patron',
  '1st_cohort_rep', 'treasurer',
];

/** The association's offices: leadership roles other than the system roles. Their terms earn leadership certificates. */
export const OFFICE_ROLES = LEADERSHIP_ROLES.filter((role) => role !== 'admin' && role !== 'superadmin');

/** Full administrators: role changes and other admins' accounts. */
export const FULL_ADMIN_ROLES = ['superadmin', 'admin'];

/** May approve content, verify payments and manage members. */
export const POWER_ROLES = ['superadmin', 'admin', 'chairperson'];

/** Run the merchandise shop: products, orders and their payments. */
export const MERCHANDISE_ROLES = ['superadmin', 'admin', 'chairperson', 'treasurer'];

export const roleLabel = (role) => ROLE_LABELS[role] || role;
export const isLeadership = (role) => LEADERSHIP_ROLES.includes(role);
export const isOffice = (role) => OFFICE_ROLES.includes(role);
export const isPower = (role) => POWER_ROLES.includes(role);
export const isMerchandise = (role) => MERCHANDISE_ROLES.includes(role);
export const isFullAdmin = (role) => FULL_ADMIN_ROLES.includes(role);
export const isSuperadmin = (role) => role === 'superadmin';

export const DEPARTMENTS = [
  'Civil Engineering',
  'Mechanical Engineering',
  'Electrical Engineering',
  'Agricultural Engineering',
  'Industrial Technology',
  'Other',
];
