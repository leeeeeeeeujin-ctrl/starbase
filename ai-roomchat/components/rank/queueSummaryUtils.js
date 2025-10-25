import { buildRoleSummaryBuckets } from '../../lib/rank/matchRoleSummary';

export function buildRoleSummaries({ match = null, pendingMatch = null, roles, slotLayout } = {}) {
  const activeMatch = match || null;
  const fallbackMatch = pendingMatch || null;

  const roleSource = Array.isArray(roles)
    ? roles
    : Array.isArray(activeMatch?.roles) && activeMatch.roles.length
      ? activeMatch.roles
      : Array.isArray(fallbackMatch?.roles)
        ? fallbackMatch.roles
        : [];

  const layoutSource = Array.isArray(slotLayout)
    ? slotLayout
    : Array.isArray(activeMatch?.slotLayout) && activeMatch.slotLayout.length
      ? activeMatch.slotLayout
      : Array.isArray(fallbackMatch?.slotLayout)
        ? fallbackMatch.slotLayout
        : [];

  const assignmentSource =
    Array.isArray(activeMatch?.assignments) && activeMatch.assignments.length
      ? activeMatch.assignments
      : Array.isArray(fallbackMatch?.assignments)
        ? fallbackMatch.assignments
        : [];

  const roomsSource =
    Array.isArray(activeMatch?.rooms) && activeMatch.rooms.length
      ? activeMatch.rooms
      : Array.isArray(fallbackMatch?.rooms)
        ? fallbackMatch.rooms
        : [];

  return buildRoleSummaryBuckets({
    roles: roleSource,
    slotLayout: layoutSource,
    assignments: assignmentSource,
    rooms: roomsSource,
  });
}

export default buildRoleSummaries;
