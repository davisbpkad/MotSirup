const activityCode = code => code.split('.').slice(0, 5).join('.');

function normalizeYear(value) {
  if (value.activities !== undefined) return value;
  const activities = [];
  const targets = value.targets.map(target => {
    const code = activityCode(target.code), id = target.ppk + ':' + code;
    if (!activities.some(activity => activity.id === id)) {
      activities.push({ id, ppk: target.ppk, code, name: target.activityName,
        active: !value.inactiveActivities?.includes(id) });
    }
    const { activityName, ...rest } = target;
    return { ...rest, activityId: id };
  });
  const { inactiveActivities, ...rest } = value;
  return { ...rest, activities, targets };
}

module.exports = { activityCode, normalizeYear };
