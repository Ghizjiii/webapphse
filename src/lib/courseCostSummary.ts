import type { Certificate } from '../types';

export type CourseCostCategoryScope = 'all' | 'itr' | 'worker' | 'other';
export type CourseCostSummaryMode = 'combined' | 'separate';

export interface CourseCostBreakdownItem {
  key: string;
  label: string;
  employeesCount: number;
  unitPrice: number | null;
  totalPrice: number | null;
}

export interface CourseCostSummaryRow {
  key: string;
  courseName: string;
  categoryScope: CourseCostCategoryScope;
  categoryLabel: string;
  employeesCount: number;
  unitPrice: number | null;
  totalPrice: number | null;
  hasPriceVariance: boolean;
  sourceCertificateIds: string[];
  breakdownItems: CourseCostBreakdownItem[];
}

export interface CourseCostSummaryMismatch {
  key: string;
  courseName: string;
  categoryLabel: string;
  employeesCount: number;
  priceOptions: Array<number | null>;
}

export interface CourseCostSummary {
  mode: CourseCostSummaryMode;
  rows: CourseCostSummaryRow[];
  totalParticipantsCount: number;
  totalRequestsCount: number;
  pricedRequestsCount: number;
  missingPriceRequestsCount: number;
  grandTotal: number;
  mismatchedGroups: CourseCostSummaryMismatch[];
}

export interface CourseCostSummarySet {
  combined: CourseCostSummary;
  separate: CourseCostSummary;
}

function normalizeText(value: string | null | undefined): string {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('ru')
    .replace(/\s+/g, ' ');
}

function normalizeCategoryMeta(category: string | null | undefined): {
  scope: Exclude<CourseCostCategoryScope, 'all'>;
  label: string;
  sortOrder: number;
} {
  const raw = String(category || '').trim();
  const normalized = normalizeText(raw);

  if (!normalized) {
    return {
      scope: 'other',
      label: 'Без категории',
      sortOrder: 2,
    };
  }

  if (normalized.includes('итр')) {
    return {
      scope: 'itr',
      label: 'ИТР',
      sortOrder: 0,
    };
  }

  if (normalized.includes('обыч') || normalized.includes('рабоч') || normalized.includes('работ')) {
    return {
      scope: 'worker',
      label: 'Обычный',
      sortOrder: 1,
    };
  }

  return {
    scope: 'other',
    label: raw,
    sortOrder: 2,
  };
}

function normalizePrice(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

function compareNullableNumbers(left: number | null, right: number | null): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left - right;
}

function priceKey(value: number | null): string {
  return value === null ? '__missing__' : String(value);
}

function buildParticipantKey(cert: Certificate): string {
  const participantId = String(cert.participant_id || '').trim();
  if (participantId) return participantId;

  const fallback = [
    normalizeText(cert.last_name),
    normalizeText(cert.first_name),
    normalizeText(cert.middle_name),
    normalizeText(cert.position),
    normalizeText(cert.course_name),
  ].filter(Boolean).join('::');

  return fallback || cert.id;
}

function countUniqueParticipants(certificates: Certificate[]): number {
  return new Set(certificates.map(buildParticipantKey).filter(Boolean)).size;
}

function totalPriceFromItems(items: Array<{ unitPrice: number | null; employeesCount: number }>): number | null {
  const pricedItems = items.filter(item => item.unitPrice !== null);
  if (pricedItems.length === 0) return null;
  return pricedItems.reduce((sum, item) => sum + Number(item.unitPrice) * item.employeesCount, 0);
}

function collectPriceOptions(items: Array<{ unitPrice: number | null }>): Array<number | null> {
  const unique = new Map<string, number | null>();
  for (const item of items) {
    unique.set(priceKey(item.unitPrice), item.unitPrice);
  }
  return Array.from(unique.values()).sort(compareNullableNumbers);
}

function buildSeparateSummary(certificates: Certificate[]): CourseCostSummary {
  const grouped = new Map<string, {
    courseName: string;
    categoryScope: Exclude<CourseCostCategoryScope, 'all'>;
    categoryLabel: string;
    categorySortOrder: number;
    sourceCertificateIds: string[];
    priceBuckets: Map<string, { unitPrice: number | null; certificates: Certificate[] }>;
  }>();

  for (const cert of certificates) {
    const courseName = String(cert.course_name || '').trim() || 'Без названия курса';
    const categoryMeta = normalizeCategoryMeta(cert.category);
    const groupKey = `${courseName}::${categoryMeta.scope}::${categoryMeta.label}`;
    const existing = grouped.get(groupKey) || {
      courseName,
      categoryScope: categoryMeta.scope,
      categoryLabel: categoryMeta.label,
      categorySortOrder: categoryMeta.sortOrder,
      sourceCertificateIds: [],
      priceBuckets: new Map<string, { unitPrice: number | null; certificates: Certificate[] }>(),
    };

    const unitPrice = normalizePrice(cert.price);
    const bucketKey = priceKey(unitPrice);
    const bucket = existing.priceBuckets.get(bucketKey) || {
      unitPrice,
      certificates: [],
    };

    bucket.certificates.push(cert);
    existing.priceBuckets.set(bucketKey, bucket);
    existing.sourceCertificateIds.push(cert.id);
    grouped.set(groupKey, existing);
  }

  const rows: Array<CourseCostSummaryRow & { categorySortOrder: number }> = [];
  const mismatchedGroups: CourseCostSummaryMismatch[] = [];

  for (const [groupKey, group] of grouped.entries()) {
    const priceOptions = collectPriceOptions(Array.from(group.priceBuckets.values()));
    const hasPriceVariance = priceOptions.length > 1;

    if (hasPriceVariance) {
      mismatchedGroups.push({
        key: groupKey,
        courseName: group.courseName,
        categoryLabel: group.categoryLabel,
        employeesCount: group.sourceCertificateIds.length,
        priceOptions,
      });
    }

    for (const [bucketKey, bucket] of group.priceBuckets.entries()) {
      const employeesCount = bucket.certificates.length;
      rows.push({
        key: `${groupKey}::${bucketKey}`,
        courseName: group.courseName,
        categoryScope: group.categoryScope,
        categoryLabel: group.categoryLabel,
        employeesCount,
        unitPrice: bucket.unitPrice,
        totalPrice: bucket.unitPrice === null ? null : bucket.unitPrice * employeesCount,
        hasPriceVariance,
        sourceCertificateIds: bucket.certificates.map(cert => cert.id),
        breakdownItems: [],
        categorySortOrder: group.categorySortOrder,
      });
    }
  }

  rows.sort((left, right) => {
    const byCourse = left.courseName.localeCompare(right.courseName, 'ru');
    if (byCourse !== 0) return byCourse;

    const byCategory = left.categorySortOrder - right.categorySortOrder;
    if (byCategory !== 0) return byCategory;

    return compareNullableNumbers(left.unitPrice, right.unitPrice);
  });

  const summaryRows = rows.map(({ categorySortOrder, ...row }) => {
    void categorySortOrder;
    return row;
  });
  const totalParticipantsCount = countUniqueParticipants(certificates);
  const totalRequestsCount = summaryRows.reduce((sum, row) => sum + row.employeesCount, 0);
  const pricedRequestsCount = summaryRows
    .filter(row => row.unitPrice !== null)
    .reduce((sum, row) => sum + row.employeesCount, 0);
  const missingPriceRequestsCount = summaryRows
    .filter(row => row.unitPrice === null)
    .reduce((sum, row) => sum + row.employeesCount, 0);
  const grandTotal = summaryRows.reduce((sum, row) => sum + (row.totalPrice || 0), 0);

  return {
    mode: 'separate',
    rows: summaryRows,
    totalParticipantsCount,
    totalRequestsCount,
    pricedRequestsCount,
    missingPriceRequestsCount,
    grandTotal,
    mismatchedGroups: mismatchedGroups.sort((left, right) => {
      const byCourse = left.courseName.localeCompare(right.courseName, 'ru');
      if (byCourse !== 0) return byCourse;
      return left.categoryLabel.localeCompare(right.categoryLabel, 'ru');
    }),
  };
}

function buildCombinedSummary(certificates: Certificate[]): CourseCostSummary {
  const grouped = new Map<string, {
    courseName: string;
    sourceCertificateIds: string[];
    buckets: Map<string, {
      label: string;
      unitPrice: number | null;
      certificates: Certificate[];
      categorySortOrder: number;
    }>;
  }>();

  for (const cert of certificates) {
    const courseName = String(cert.course_name || '').trim() || 'Без названия курса';
    const categoryMeta = normalizeCategoryMeta(cert.category);
    const unitPrice = normalizePrice(cert.price);
    const bucketKey = `${categoryMeta.scope}::${categoryMeta.label}::${priceKey(unitPrice)}`;

    const group = grouped.get(courseName) || {
      courseName,
      sourceCertificateIds: [],
      buckets: new Map<string, {
        label: string;
        unitPrice: number | null;
        certificates: Certificate[];
        categorySortOrder: number;
      }>(),
    };

    const bucket = group.buckets.get(bucketKey) || {
      label: categoryMeta.label,
      unitPrice,
      certificates: [],
      categorySortOrder: categoryMeta.sortOrder,
    };

    bucket.certificates.push(cert);
    group.buckets.set(bucketKey, bucket);
    group.sourceCertificateIds.push(cert.id);
    grouped.set(courseName, group);
  }

  const rows: CourseCostSummaryRow[] = [];
  const mismatchedGroups: CourseCostSummaryMismatch[] = [];

  for (const [groupKey, group] of grouped.entries()) {
    const buckets = Array.from(group.buckets.values()).sort((left, right) => {
      const byCategory = left.categorySortOrder - right.categorySortOrder;
      if (byCategory !== 0) return byCategory;
      return compareNullableNumbers(left.unitPrice, right.unitPrice);
    });

    const priceOptions = collectPriceOptions(buckets);
    const hasPriceVariance = priceOptions.length > 1;
    if (hasPriceVariance) {
      mismatchedGroups.push({
        key: groupKey,
        courseName: group.courseName,
        categoryLabel: 'Все сотрудники',
        employeesCount: group.sourceCertificateIds.length,
        priceOptions,
      });
    }

    const breakdownItems: CourseCostBreakdownItem[] = buckets.map(bucket => ({
      key: `${groupKey}::${bucket.label}::${priceKey(bucket.unitPrice)}`,
      label: bucket.label,
      employeesCount: bucket.certificates.length,
      unitPrice: bucket.unitPrice,
      totalPrice: bucket.unitPrice === null ? null : bucket.unitPrice * bucket.certificates.length,
    }));

    const totalPrice = totalPriceFromItems(breakdownItems);
    const uniformUnitPrice = !hasPriceVariance && breakdownItems.length > 0
      ? breakdownItems[0].unitPrice
      : null;

    rows.push({
      key: groupKey,
      courseName: group.courseName,
      categoryScope: 'all',
      categoryLabel: 'Все сотрудники',
      employeesCount: group.sourceCertificateIds.length,
      unitPrice: uniformUnitPrice,
      totalPrice,
      hasPriceVariance,
      sourceCertificateIds: [...group.sourceCertificateIds],
      breakdownItems,
    });
  }

  rows.sort((left, right) => left.courseName.localeCompare(right.courseName, 'ru'));

  const totalParticipantsCount = countUniqueParticipants(certificates);
  const totalRequestsCount = rows.reduce((sum, row) => sum + row.employeesCount, 0);
  const pricedRequestsCount = rows.reduce(
    (sum, row) => sum + row.breakdownItems.filter(item => item.unitPrice !== null).reduce((inner, item) => inner + item.employeesCount, 0),
    0,
  );
  const missingPriceRequestsCount = rows.reduce(
    (sum, row) => sum + row.breakdownItems.filter(item => item.unitPrice === null).reduce((inner, item) => inner + item.employeesCount, 0),
    0,
  );
  const grandTotal = rows.reduce((sum, row) => sum + (row.totalPrice || 0), 0);

  return {
    mode: 'combined',
    rows,
    totalParticipantsCount,
    totalRequestsCount,
    pricedRequestsCount,
    missingPriceRequestsCount,
    grandTotal,
    mismatchedGroups: mismatchedGroups.sort((left, right) => left.courseName.localeCompare(right.courseName, 'ru')),
  };
}

export function buildCourseCostSummary(
  certificates: Certificate[],
  mode: CourseCostSummaryMode = 'separate',
): CourseCostSummary {
  return mode === 'combined'
    ? buildCombinedSummary(certificates)
    : buildSeparateSummary(certificates);
}

export function buildCourseCostSummarySet(certificates: Certificate[]): CourseCostSummarySet {
  return {
    combined: buildCourseCostSummary(certificates, 'combined'),
    separate: buildCourseCostSummary(certificates, 'separate'),
  };
}
