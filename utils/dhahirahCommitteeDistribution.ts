import { Competition, CompetitionCommittee, CompetitionLevel, CompetitionParticipant } from '../types';

/**
 * التوزيع الرسمي المعتمد لمتسابقي مسابقة محافظة الظاهرة للقرآن الكريم (الرسمية) - 526 متسابقاً
 * حسب كشف اللجان المعتمد:
 * - المستوى الأول (21 متسابقاً): اللجنة الأولى (لجنة 1)
 * - المستوى الثاني (12 متسابقاً): اللجنة الأولى (لجنة 1)
 * - المستوى الثالث (23 متسابقاً): اللجنة الأولى (لجنة 1)
 * - المستوى الرابع (55 متسابقاً): اللجنة الأولى (لجنة 2)
 * - المستوى الخامس (196 متسابقاً): 3 لجان:
 *     * اللجنة الأولى (لجنة 3): 65 متسابقاً
 *     * اللجنة الثانية (لجنة 4): 66 متسابقاً
 *     * اللجنة الثالثة (لجنة 5): 65 متسابقاً
 * - المستوى السادس (135 متسابقاً): لجنتان:
 *     * اللجنة الأولى (لجنة 6): 67 متسابقاً
 *     * اللجنة الثانية (لجنة 7): 68 متسابقاً
 * - المستوى السابع (84 متسابقاً): اللجنة الأولى
 */

// المستوى الخامس - اللجنة الأولى (لجنة 3): 65 متسابقاً
export const LEVEL_5_COMMITTEE_1_CIVIL_IDS = new Set<string>([
  '4373463', '4643469', '4269195', '14953532', '18099262', '23082738', '7453156', '18229453',
  '24117667', '24117691', '22069944', '13283533', '13090442', '15520897', '8126244', '3149407',
  '14076375', '19449902', '4073458', '4400984', '5475469', '5472196', '12476582', '8253533',
  '12755832', '4126561', '4423718', '24085356', '5472069', '13169426', '22442387', '8942971',
  '19084943', '4592703', '14280668', '3657761', '13623303', '17861549', '15569054', '21852086',
  '21908316', '12195463', '27027416', '12920404', '6772838', '3774996', '5549649', '9186457',
  '11104024', '10985289', '13274767', '14441593', '23947119', '14104687', '10500115', '23284117',
  '5355359', '23298217', '8494399', '20215437', '4467794', '4374413', '6992683', '15132428',
  '2746087',
]);

// المستوى الخامس - اللجنة الثانية (لجنة 4): 66 متسابقاً
export const LEVEL_5_COMMITTEE_2_CIVIL_IDS = new Set<string>([
  '6515751', '13115541', '24309461', '24124865', '4282921', '4801007', '5891509', '7004026',
  '5836491', '13911353', '14556884', '7780101', '14839706', '22152028', '3306882', '9093677',
  '14009625', '28944777', '845413', '11718921', '15643174', '4591031', '4112831', '19999094',
  '12207637', '23674749', '5581338', '3998956', '7922098', '6091554', '9001087', '7065217',
  '3615127', '18954255', '24006304', '6289168', '20382854', '4918875', '19640019', '5850277',
  '18617513', '19798346', '5915714', '5127798', '19112847', '3109955', '7717843', '4326353',
  '20155319', '5978647', '10113516', '22562159', '15287641', '25379629', '4827082', '7412312',
  '6641306', '4084706', '22894654', '7547927', '4894891', '4520245', '8795213', '7513593',
  '4674502', '12027925',
]);

// المستوى الخامس - اللجنة الثالثة (لجنة 5): 65 متسابقاً
export const LEVEL_5_COMMITTEE_3_CIVIL_IDS = new Set<string>([
  '14080538', '4346939', '12031583', '7947268', '9854775', '12511698', '13865865', '13234409',
  '23240506', '11913567', '5950714', '5222756', '5348466', '4321385', '19949338', '15092836',
  '10937411', '4545031', '21487276', '5462919', '4333495', '6384801', '4269738', '12602239',
  '12506387', '11157526', '14727572', '21549524', '9989762', '4333551', '6965053', '6353398',
  '4176433', '4337348', '4312459', '25405918', '11157278', '19411334', '8635205', '4468533',
  '4490524', '4654703', '13805221', '13009526', '21123209', '7336319', '5047229', '4839492',
  '12606398', '4209624', '3611893', '5850282', '5869191', '12355676', '24006886', '20412191',
  '22618835', '21277256', '3612346', '6914999', '21898132', '21494863', '18213203', '12223929',
  '20529612',
]);

// المستوى السادس - اللجنة الأولى (لجنة 6): 67 متسابقاً
export const LEVEL_6_COMMITTEE_1_CIVIL_IDS = new Set<string>([
  '28325741', '27313992', '27139294', '28017288', '26661859', '29000154', '28918679', '27256922',
  '26370569', '27356652', '26477895', '25143794', '28161243', '24993978', '26992893', '29241619',
  '26738244', '25554594', '24941572', '26884096', '27620777', '25241074', '28485885', '27779581',
  '28600285', '26636627', '27061466', '26810739', '27722553', '28116789', '28158082', '25487353',
  '25063839', '25050216', '27562621', '24913821', '29109432', '25596496', '28345057', '27866831',
  '25120295', '28805983', '25865997', '25140778', '25485471', '25592426', '28712776', '27878782',
  '27537403', '25071603', '24895268', '29055768', '25788871', '24827413', '27397739', '28851007',
  '27097496', '29105536', '28716118', '26362209', '25701484', '26088705', '25769755', '24988883',
  '23080772', '27455872', '26942678',
]);

// المستوى السادس - اللجنة الثانية (لجنة 7): 68 متسابقاً
export const LEVEL_6_COMMITTEE_2_CIVIL_IDS = new Set<string>([
  '25894102', '26174284', '27059114', '27402735', '28394949', '28399055', '27927492', '24932538',
  '26643239', '28576145', '25922888', '25053598', '25740694', '27845988', '30037181', '29272001',
  '25692794', '25099058', '28229579', '26943014', '26494645', '28875495', '24826439', '26718731',
  '24967041', '29107704', '25298804', '26892033', '25176137', '26460184', '25870112', '25086513',
  '26097748', '26696605', '28634446', '26758521', '26610493', '26390832', '25362561', '25329762',
  '26141598', '25258241', '28648598', '26803035', '24810795', '26161523', '27747807', '24959774',
  '26089623', '27413116', '30011903', '26311565', '26976066', '28435318', '27516884', '26080731',
  '25570553', '28674536', '25681067', '29077608', '28432134', '24956388', '26629875', '27238743',
  '27356455', '25617493', '25115073', '26872759',
]);

/**
 * فحص هل المسابقة هي مسابقة محافظة الظاهرة الرسمية (526 متسابقاً)
 */
export function isOfficialDhahirahCompetition(comp: Partial<Competition> | undefined): boolean {
  if (!comp) return false;
  if (String(comp.id) === '1794213672451') return true;
  const name = String(comp.name || '');
  const pLen = (comp.participants || []).length;
  return name.includes('الظاهرة') && name.includes('الرسمية') && pLen >= 500;
}

/**
 * تطبيق اللجان وتوزيع المتسابقين الـ 526 حسب الكشف الرسمي المعتمد لمسابقة محافظة الظاهرة
 * في حال لم يكن التوزيع مطبقاً بعد على المستوى الخامس (3 لجان) والمستوى السادس (لجنتان).
 */
export function ensureOfficialDhahirahCommitteesApplied(comp: Competition): Competition {
  if (!isOfficialDhahirahCompetition(comp)) return comp;

  const levels = comp.levels || [];
  const level5 = levels.find(l => Number(l.id) === 5);
  const level6 = levels.find(l => Number(l.id) === 6);

  const l5CommCount = Array.isArray(level5?.committees) ? level5!.committees!.length : 0;
  const l6CommCount = Array.isArray(level6?.committees) ? level6!.committees!.length : 0;

  const l5Participants = (comp.participants || []).filter(p => Number(p.levelId) === 5);
  const l6Participants = (comp.participants || []).filter(p => Number(p.levelId) === 6);

  const hasL5Distributed =
    l5CommCount >= 3 &&
    l5Participants.some(p => Number(p.committeeId) === 2) &&
    l5Participants.some(p => Number(p.committeeId) === 3);

  const hasL6Distributed =
    l6CommCount >= 2 &&
    l6Participants.some(p => Number(p.committeeId) === 2);

  if (hasL5Distributed && hasL6Distributed) {
    return comp;
  }

  return applyOfficialDhahirahCommittees(comp);
}

/**
 * تطبيق التوزيع الرسمي للجان والمتسابقين بدقة تامة
 */
export function applyOfficialDhahirahCommittees(comp: Competition): Competition {
  const getExistingEvaluatorsForCommittee = (
    level: CompetitionLevel,
    commId: number,
    isFirstCommittee: boolean
  ): number[] => {
    const existingComm = (level.committees || []).find(c => Number(c.id) === commId);
    if (existingComm && Array.isArray(existingComm.evaluatorIds) && existingComm.evaluatorIds.length > 0) {
      return existingComm.evaluatorIds.map(Number);
    }
    if (isFirstCommittee) {
      return (comp.evaluators || [])
        .filter(ev => {
          const assigned = ev.levelIds || [];
          return assigned.length === 0 || assigned.map(Number).includes(Number(level.id));
        })
        .map(ev => Number(ev.id));
    }
    return [];
  };

  const updatedLevels: CompetitionLevel[] = (comp.levels || []).map(level => {
    const lvlId = Number(level.id);
    if (lvlId === 5) {
      const committees: CompetitionCommittee[] = [
        {
          id: 1,
          name: 'اللجنة الأولى (لجنة 3)',
          evaluatorIds: getExistingEvaluatorsForCommittee(level, 1, true),
        },
        {
          id: 2,
          name: 'اللجنة الثانية (لجنة 4)',
          evaluatorIds: getExistingEvaluatorsForCommittee(level, 2, false),
        },
        {
          id: 3,
          name: 'اللجنة الثالثة (لجنة 5)',
          evaluatorIds: getExistingEvaluatorsForCommittee(level, 3, false),
        },
      ];
      return { ...level, committees };
    }

    if (lvlId === 6) {
      const committees: CompetitionCommittee[] = [
        {
          id: 1,
          name: 'اللجنة الأولى (لجنة 6)',
          evaluatorIds: getExistingEvaluatorsForCommittee(level, 1, true),
        },
        {
          id: 2,
          name: 'اللجنة الثانية (لجنة 7)',
          evaluatorIds: getExistingEvaluatorsForCommittee(level, 2, false),
        },
      ];
      return { ...level, committees };
    }

    if (lvlId === 1 || lvlId === 2 || lvlId === 3) {
      const committees: CompetitionCommittee[] = [
        {
          id: 1,
          name: 'اللجنة الأولى (لجنة 1)',
          evaluatorIds: getExistingEvaluatorsForCommittee(level, 1, true),
        },
      ];
      return { ...level, committees };
    }

    if (lvlId === 4) {
      const committees: CompetitionCommittee[] = [
        {
          id: 1,
          name: 'اللجنة الأولى (لجنة 2)',
          evaluatorIds: getExistingEvaluatorsForCommittee(level, 1, true),
        },
      ];
      return { ...level, committees };
    }

    const committees: CompetitionCommittee[] = [
      {
        id: 1,
        name: 'اللجنة الأولى',
        evaluatorIds: getExistingEvaluatorsForCommittee(level, 1, true),
      },
    ];
    return { ...level, committees };
  });

  // تتبع الفهرس داخل كل مستوى كاحتياط إضافي إذا لم يتوفر الرقم المدني
  let l5Index = 0;
  let l6Index = 0;

  const updatedParticipants: CompetitionParticipant[] = (comp.participants || []).map(p => {
    const lvlId = Number(p.levelId);
    const civil = String(p.civilId || '').trim();

    if (lvlId === 5) {
      const currentIdx = l5Index++;
      let committeeId = 1;
      if (LEVEL_5_COMMITTEE_1_CIVIL_IDS.has(civil)) {
        committeeId = 1;
      } else if (LEVEL_5_COMMITTEE_2_CIVIL_IDS.has(civil)) {
        committeeId = 2;
      } else if (LEVEL_5_COMMITTEE_3_CIVIL_IDS.has(civil)) {
        committeeId = 3;
      } else if (currentIdx < 65) {
        committeeId = 1;
      } else if (currentIdx < 131) {
        committeeId = 2;
      } else {
        committeeId = 3;
      }
      return { ...p, committeeId };
    }

    if (lvlId === 6) {
      const currentIdx = l6Index++;
      let committeeId = 1;
      if (LEVEL_6_COMMITTEE_1_CIVIL_IDS.has(civil)) {
        committeeId = 1;
      } else if (LEVEL_6_COMMITTEE_2_CIVIL_IDS.has(civil)) {
        committeeId = 2;
      } else if (currentIdx < 67) {
        committeeId = 1;
      } else {
        committeeId = 2;
      }
      return { ...p, committeeId };
    }

    return {
      ...p,
      committeeId: Number(p.committeeId || 1),
    };
  });

  return {
    ...comp,
    levels: updatedLevels,
    participants: updatedParticipants,
  };
}
