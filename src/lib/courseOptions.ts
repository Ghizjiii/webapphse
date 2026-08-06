import type { RefCoursePrice } from '../types';

export interface CourseOption {
  displayName: string;
  courseName: string;
  qualification: string;
  electricalSafetyGroup: string;
  category: string;
  sortOrder: number;
}

const QUALIFICATION_COURSE_NAME = 'Курс квалификации';
const ELECTRICAL_SAFETY_COURSE_NAME = 'Электробезопасность';

function plain(value: string | null | undefined): string {
  return String(value || '').trim();
}

export function normalizeCourseOptionValue(value: string | null | undefined): string {
  const normalized = plain(value)
    .toLocaleLowerCase('ru')
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ');

  if (!normalized || normalized === '-' || normalized === 'нет данных' || normalized === 'не установлено') {
    return '';
  }

  return normalized;
}

export function buildCourseOptionLabel(
  courseName: string | null | undefined,
  qualification: string | null | undefined,
  electricalSafetyGroup: string | null | undefined,
): string {
  return [
    plain(courseName),
    plain(qualification),
    plain(electricalSafetyGroup),
  ].filter(Boolean).join(': ');
}

function hasCourseVariant(rule: Pick<RefCoursePrice, 'qualification' | 'electrical_safety_group'>): boolean {
  return Boolean(plain(rule.electrical_safety_group) || plain(rule.qualification));
}

function categoryMatches(ruleCategory: string | null | undefined, selectedCategory: string | null | undefined): boolean {
  const normalizedRuleCategory = normalizeCourseOptionValue(ruleCategory);
  const normalizedSelectedCategory = normalizeCourseOptionValue(selectedCategory);

  if (!normalizedSelectedCategory) return true;
  if (!normalizedRuleCategory) return true;
  return normalizedRuleCategory === normalizedSelectedCategory;
}

function toCourseOption(rule: RefCoursePrice): CourseOption | null {
  const courseName = plain(rule.course_name);
  const qualification = plain(rule.qualification);
  const electricalSafetyGroup = plain(rule.electrical_safety_group);
  const displayName = buildCourseOptionLabel(courseName, qualification, electricalSafetyGroup);
  if (!courseName || !displayName) return null;

  return {
    displayName,
    courseName,
    qualification,
    electricalSafetyGroup,
    category: plain(rule.category),
    sortOrder: Number.isFinite(Number(rule.sort_order)) ? Number(rule.sort_order) : 0,
  };
}

function pushUniqueOption(target: CourseOption[], option: CourseOption, seen: Set<string>) {
  const key = normalizeCourseOptionValue(option.displayName);
  if (!key || seen.has(key)) return;
  seen.add(key);
  target.push(option);
}

export function buildCourseOptions(params: {
  baseCourses: string[];
  coursePriceRules: RefCoursePrice[];
  qualificationOptions?: string[];
  category?: string;
}): CourseOption[] {
  const { baseCourses, coursePriceRules, qualificationOptions = [], category = '' } = params;
  const seen = new Set<string>();
  const options: CourseOption[] = [];
  const variantCourses = new Set<string>();
  const variantsByCourse = new Map<string, CourseOption[]>();
  const qualificationCourseKey = normalizeCourseOptionValue(QUALIFICATION_COURSE_NAME);

  for (const rule of coursePriceRules) {
    const normalizedCourseName = normalizeCourseOptionValue(rule.course_name);
    if (!normalizedCourseName || !hasCourseVariant(rule)) continue;

    variantCourses.add(normalizedCourseName);
    if (!categoryMatches(rule.category, category)) continue;

    const option = toCourseOption(rule);
    if (!option) continue;

    const current = variantsByCourse.get(normalizedCourseName) || [];
    const nextSeen = new Set(current.map(item => normalizeCourseOptionValue(item.displayName)).filter(Boolean));
    if (!nextSeen.has(normalizeCourseOptionValue(option.displayName))) {
      current.push(option);
      variantsByCourse.set(normalizedCourseName, current);
    }
  }

  const hasQualificationCourse = baseCourses.some(courseName => (
    normalizeCourseOptionValue(courseName) === qualificationCourseKey
  )) || variantsByCourse.has(qualificationCourseKey);
  if (hasQualificationCourse) {
    const current = variantsByCourse.get(qualificationCourseKey) || [];
    const nextSeen = new Set(current.map(item => normalizeCourseOptionValue(item.qualification)).filter(Boolean));

    for (const qualification of qualificationOptions) {
      const value = plain(qualification);
      const normalizedValue = normalizeCourseOptionValue(value);
      if (!normalizedValue || nextSeen.has(normalizedValue)) continue;

      nextSeen.add(normalizedValue);
      current.push({
        displayName: buildCourseOptionLabel(QUALIFICATION_COURSE_NAME, value, ''),
        courseName: QUALIFICATION_COURSE_NAME,
        qualification: value,
        electricalSafetyGroup: '',
        category: '',
        sortOrder: 0,
      });
    }

    if (current.length > 0) {
      variantsByCourse.set(qualificationCourseKey, current);
      variantCourses.add(qualificationCourseKey);
    }
  }

  const normalizedBaseCourseNames = new Set<string>();
  for (const courseName of baseCourses) {
    const resolvedCourseName = plain(courseName);
    const normalizedCourseName = normalizeCourseOptionValue(resolvedCourseName);
    if (!normalizedCourseName) continue;

    normalizedBaseCourseNames.add(normalizedCourseName);
    const variants = variantsByCourse.get(normalizedCourseName) || [];
    if (variantCourses.has(normalizedCourseName)) {
      variants.forEach(option => pushUniqueOption(options, option, seen));
      continue;
    }

    pushUniqueOption(options, {
      displayName: resolvedCourseName,
      courseName: resolvedCourseName,
      qualification: '',
      electricalSafetyGroup: '',
      category: '',
      sortOrder: 0,
    }, seen);
  }

  for (const [normalizedCourseName, variants] of variantsByCourse.entries()) {
    if (normalizedBaseCourseNames.has(normalizedCourseName)) continue;
    variants.forEach(option => pushUniqueOption(options, option, seen));
  }

  return options;
}

export function resolveCourseOption(
  displayName: string | null | undefined,
  coursePriceRules: RefCoursePrice[],
  category?: string,
): CourseOption {
  const normalizedDisplayName = normalizeCourseOptionValue(displayName);
  const selectedCategory = normalizeCourseOptionValue(category);
  const fallbackDisplayName = plain(displayName);

  const matchingOptions = coursePriceRules
    .filter(rule => hasCourseVariant(rule))
    .map(rule => toCourseOption(rule))
    .filter((option): option is CourseOption => Boolean(option))
    .filter(option => normalizeCourseOptionValue(option.displayName) === normalizedDisplayName)
    .sort((left, right) => {
      const leftCategoryScore = normalizeCourseOptionValue(left.category) === selectedCategory ? 1 : 0;
      const rightCategoryScore = normalizeCourseOptionValue(right.category) === selectedCategory ? 1 : 0;
      if (leftCategoryScore !== rightCategoryScore) return rightCategoryScore - leftCategoryScore;
      return left.sortOrder - right.sortOrder;
    });

  const matchingOption = matchingOptions[0];
  if (matchingOption) {
    return matchingOption;
  }

  const separatorIndex = fallbackDisplayName.indexOf(':');
  if (separatorIndex >= 0) {
    const courseName = plain(fallbackDisplayName.slice(0, separatorIndex));
    const detail = plain(fallbackDisplayName.slice(separatorIndex + 1));
    const normalizedCourseName = normalizeCourseOptionValue(courseName);
    if (normalizedCourseName === normalizeCourseOptionValue(ELECTRICAL_SAFETY_COURSE_NAME)) {
      return {
        displayName: fallbackDisplayName,
        courseName,
        qualification: '',
        electricalSafetyGroup: detail,
        category: '',
        sortOrder: 0,
      };
    }
    if (normalizedCourseName === normalizeCourseOptionValue(QUALIFICATION_COURSE_NAME)) {
      return {
        displayName: fallbackDisplayName,
        courseName,
        qualification: detail,
        electricalSafetyGroup: '',
        category: '',
        sortOrder: 0,
      };
    }
  }

  return {
    displayName: fallbackDisplayName,
    courseName: fallbackDisplayName,
    qualification: '',
    electricalSafetyGroup: '',
    category: '',
    sortOrder: 0,
  };
}
