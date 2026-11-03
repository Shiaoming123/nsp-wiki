(function () {
  'use strict';
  // Existing browsing numbers stay fixed when a later build adds or removes a record.
  const recordedGroups = [
    ['FungalStalker', 'FungalStalker_1'],
    ['Zombie_Pounce', 'Zombie_Scratch', 'Zombie_Scratch_Hard'],
    ['CookieCrumbs', 'CookieCrumbs_Newbie_Pistol_1', 'CookieCrumbs_Newbie_Pistol_2', 'CookieCrumbs_Newbie_SMG', 'CookieCrumbs_Newbie_SmallHammer', 'CookieCrumbs_Newbie_Spear', 'CookieCrumbs_Normal_00_t0', 'CookieCrumbs_Normal_00_t1', 'CookieCrumbs_Normal_00_t2', 'CookieCrumbs_Normal_00_t3', 'CookieCrumbs_Normal_00_t4', 'CookieCrumbs_Normal_08_normal', 'CookieCrumbs_Normal_12_normal', 'CookieCrumbs_Normal_IdleSit'],
    ['FallenLeafMember', 'FallenLeafMember_00_Normal', 'FallenLeafMember_00_Shotgun', 'FallenLeafMember_00_Sniper'],
    ['ProTeam1_B54', 'ProTeam1_D44', 'ProTeam2_DeepOcean', 'ProTeam2_M500B', 'ProTeam3_AF250E', 'ProTeam3_AF31', 'ProTeam4_E09', 'ProTeam4_RS19', 'ProTeam5_AF31', 'ProTeam5_RS47', 'ProTeamD_D44', 'ProTeamD_RS47']
  ];
  const recorded = new Map(recordedGroups.flatMap(ids => ids.map((id, index) => [id, index + 1])));
  const notice = '分型编号只用于区分图鉴条目，不代表敌怪等级或游戏内称号。';

  function recordedLabel(id) {
    const number = recorded.get(id);
    return number ? '资料分型 ' + String(number).padStart(2, '0') : '';
  }

  function summarize(enemies) {
    const groups = new Map(), summaries = new Map();
    for (const enemy of enemies) {
      const name = enemy.displayName || enemy.name;
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(enemy);
    }
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      let next = Math.max(0, ...group.map(enemy => recorded.get(enemy.id) || 0));
      for (const enemy of [...group].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) {
        const number = recorded.get(enemy.id) || ++next;
        const facts = [];
        for (const [source, label] of [['生命基础上限', '生命'], ['基础防御', '防御'], ['基础移动速度', '移速']]) {
          const stat = (enemy.stats || []).find(stat => stat.label === source);
          if (Number.isFinite(stat?.value)) facts.push(label + ' ' + stat.value);
        }
        summaries.set(enemy.id, {
          label: recordedLabel(enemy.id) || '资料分型 ' + String(number).padStart(2, '0'), number, groupSize: group.length,
          facts,
          locations: [...new Set((enemy.mapLabels || []).map(map => map.label).filter(Boolean))],
          sameAppearance: Boolean(enemy.image && group.some(other => other.id !== enemy.id && other.image === enemy.image))
        });
      }
    }
    return summaries;
  }

  const api = {summarize, recordedLabel, notice};
  if (typeof module === 'object' && module.exports) module.exports = api;
  else globalThis.EnemyVariants = api;
}());
