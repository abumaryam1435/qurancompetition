import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { Competition, CompetitionLevel } from '../types';

export interface ComprehensivePdfOptions {
  comp: Competition;
  allResults: any[];
  filteredResults: any[];
  baseFilteredResults: any[];
  wilayatOptions: { value: string; label: string; count: number }[];
  genderOptions: { value: string; label: string; count: number }[];
  getEvaluatorName: (evaluatorId: number, fallbackName?: string) => string;
  formatJuzsDisplay: (raw?: string) => string;
  onProgress?: (msg: string) => void;
}

interface LevelPalette {
  bannerBg: string;
  bannerText: string;
  subBannerBg: string;
  subBannerText: string;
  studentHeaderBg: string;
  evalHeaderBg: string;
  summaryHeaderBg: string;
}

const LEVEL_PALETTES: LevelPalette[] = [
  {
    bannerBg: '#064E3B',
    bannerText: '#FDE68A',
    subBannerBg: '#FEF3C7',
    subBannerText: '#78350F',
    studentHeaderBg: '#0F172A',
    evalHeaderBg: '#1E3A8A',
    summaryHeaderBg: '#047857',
  },
  {
    bannerBg: '#1E3A8A',
    bannerText: '#FDE68A',
    subBannerBg: '#EFF6FF',
    subBannerText: '#1E3A8A',
    studentHeaderBg: '#0F172A',
    evalHeaderBg: '#1D4ED8',
    summaryHeaderBg: '#065F46',
  },
  {
    bannerBg: '#4C1D95',
    bannerText: '#FDE68A',
    subBannerBg: '#F5F3FF',
    subBannerText: '#4C1D95',
    studentHeaderBg: '#1E1B4B',
    evalHeaderBg: '#4338CA',
    summaryHeaderBg: '#065F46',
  },
  {
    bannerBg: '#78350F',
    bannerText: '#FEF3C7',
    subBannerBg: '#FFFBEB',
    subBannerText: '#78350F',
    studentHeaderBg: '#1C1917',
    evalHeaderBg: '#1E3A8A',
    summaryHeaderBg: '#065F46',
  },
  {
    bannerBg: '#134E4A',
    bannerText: '#FDE68A',
    subBannerBg: '#F0FDFA',
    subBannerText: '#134E4A',
    studentHeaderBg: '#0F172A',
    evalHeaderBg: '#0F766E',
    summaryHeaderBg: '#065F46',
  },
  {
    bannerBg: '#831843',
    bannerText: '#FDE68A',
    subBannerBg: '#FFF1F2',
    subBannerText: '#831843',
    studentHeaderBg: '#0F172A',
    evalHeaderBg: '#1E3A8A',
    summaryHeaderBg: '#065F46',
  },
];

function escapeHtml(val: any): string {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * تقسيم المتسابقين إلى دفعات صفحات بحيث لا ينقسم سجل أي متسابق (مهما كان عدد مقيميه) بين صفحتين أبداً
 */
function chunkResultsBySubRows(results: any[], maxSubRowsPerPage = 15): any[][] {
  if (!results || results.length === 0) return [[]];
  const pages: any[][] = [];
  let currentPage: any[] = [];
  let currentSubRowCount = 0;

  for (const r of results) {
    const spanCount = Math.max(1, Array.isArray(r.evaluations) ? r.evaluations.length : 1);
    if (
      currentPage.length > 0 &&
      currentSubRowCount + spanCount > maxSubRowsPerPage
    ) {
      pages.push(currentPage);
      currentPage = [];
      currentSubRowCount = 0;
    }
    currentPage.push(r);
    currentSubRowCount += spanCount;
  }

  if (currentPage.length > 0) {
    pages.push(currentPage);
  }
  return pages;
}

/**
 * بناء HTML لصفحة واحدة أفقية (Landscape) من الجدول الشامل المدمج المطابق لتنسيق الإكسل
 */
function buildMergedTablePageHtml(params: {
  compName: string;
  seasonText?: string;
  sectionTitle: string;
  sectionSubtitle: string;
  pageResults: any[];
  startIndex: number;
  maxSegments: number;
  palette: LevelPalette;
  pageNumberInSection: number;
  totalPagesInSection: number;
  globalPageNumber: number;
  isLastPageOfSection: boolean;
  getEvaluatorName: (evaluatorId: number, fallbackName?: string) => string;
  formatJuzsDisplay: (raw?: string) => string;
}): string {
  const {
    compName,
    seasonText,
    sectionTitle,
    sectionSubtitle,
    pageResults,
    startIndex,
    maxSegments,
    palette,
    pageNumberInSection,
    totalPagesInSection,
    globalPageNumber,
    isLastPageOfSection,
    getEvaluatorName,
    formatJuzsDisplay,
  } = params;

  const evalSegHeadersHtml = Array.from(
    { length: maxSegments },
    (_, i) =>
      `<th style="padding:5px 3px;text-align:center;background:#1E40AF;color:#FFFFFF;border:1px solid #93C5FD;font-size:10px;width:28px;">م${i + 1}</th>`
  ).join('');

  const avgSegHeadersHtml = Array.from(
    { length: maxSegments },
    (_, i) =>
      `<th style="padding:5px 3px;text-align:center;background:#047857;color:#FFFFFF;border:1px solid #6EE7B7;font-size:10px;width:32px;">متوسط م${i + 1}</th>`
  ).join('');

  let rowsHtml = '';

  if (pageResults.length === 0) {
    const totalCols = 13 + (4 + maxSegments) + (8 + maxSegments);
    rowsHtml = `
      <tr>
        <td colspan="${totalCols}" style="padding:24px;text-align:center;font-weight:800;font-size:13px;color:#64748B;background:#F8FAFC;border:1px solid #CBD5E1;">
          لا يوجد متسابقون مسجلون في هذا القسم حالياً
        </td>
      </tr>
    `;
  } else {
    pageResults.forEach((r, idxOnPage) => {
      const sIdx = startIndex + idxOnPage;
      const evals =
        Array.isArray(r.evaluations) && r.evaluations.length > 0
          ? r.evaluations
          : [null];
      const spanCount = evals.length;
      const isTop3 =
        r.rankInLevel !== null && r.rankInLevel <= 3 && !r.isUnmemorized;

      const studentBg = r.isUnmemorized
        ? '#FFF1F2'
        : isTop3
        ? '#FFFBEB'
        : sIdx % 2 === 0
        ? '#FFFFFF'
        : '#F8FAFC';

      const summaryBg = r.isUnmemorized
        ? '#FFF1F2'
        : sIdx % 2 === 0
        ? '#F0FDF4'
        : '#DCFCE7';

      const rankBg =
        r.rankInLevel === 1
          ? '#FEF08A'
          : r.rankInLevel === 2
          ? '#E2E8F0'
          : r.rankInLevel === 3
          ? '#FED7AA'
          : r.isUnmemorized
          ? '#FFE4E6'
          : studentBg;

      const rankColor =
        r.rankInLevel === 1
          ? '#713F12'
          : r.rankInLevel === 2
          ? '#1E293B'
          : r.rankInLevel === 3
          ? '#7C2D12'
          : r.isUnmemorized
          ? '#9F1239'
          : '#0F172A';

      const rankText = r.isUnmemorized
        ? 'غير حافظ'
        : r.rankInLevel !== null
        ? String(r.rankInLevel)
        : '-';

      const overallRankText = r.isUnmemorized
        ? 'غير حافظ'
        : r.overallRank !== null
        ? String(r.overallRank)
        : '-';

      const gradeLabel = String(r.gradeInfo?.label || '-');
      let gradeBg = '#F1F5F9';
      let gradeFg = '#334155';
      if (gradeLabel.includes('ممتاز')) {
        gradeBg = '#A7F3D0';
        gradeFg = '#064E3B';
      } else if (gradeLabel.includes('جيد جداً') || gradeLabel.includes('جيد جدا')) {
        gradeBg = '#BFDBFE';
        gradeFg = '#1E3A8A';
      } else if (gradeLabel.includes('جيد')) {
        gradeBg = '#FDE68A';
        gradeFg = '#78350F';
      } else if (gradeLabel.includes('مقبول')) {
        gradeBg = '#FED7AA';
        gradeFg = '#7C2D12';
      } else if (gradeLabel.includes('غير حافظ')) {
        gradeBg = '#FECDD3';
        gradeFg = '#881337';
      }

      evals.forEach((ev: any, evIdx: number) => {
        const isFirstSubRow = evIdx === 0;
        const isLastSubRow = evIdx === spanCount - 1;
        const topBorder = isFirstSubRow
          ? '2px solid #0F172A'
          : '1px solid #93C5FD';
        const bottomBorder = isLastSubRow
          ? '2px solid #0F172A'
          : '1px solid #93C5FD';
        const mergedBorderStyle = `border-top:2px solid #0F172A;border-bottom:2px solid #0F172A;border-left:1px solid #CBD5E1;border-right:1px solid #CBD5E1;`;

        const evRowBg = evIdx % 2 === 0 ? '#EFF6FF' : '#DBEAFE';
        const evScoreBg = evIdx % 2 === 0 ? '#E0F2FE' : '#BAE6FD';

        const evName = ev
          ? getEvaluatorName(ev.evaluatorId, ev.evaluatorName)
          : 'بانتظار التقييم';
        const evScore = ev
          ? ev.isUnmemorized
            ? 0
            : Number(ev.totalScore ?? 0)
          : null;
        const evDeduction =
          ev && evScore !== null
            ? ev.isUnmemorized
              ? r.maxScore
              : Math.max(0, Number(((r.maxScore || 100) - evScore).toFixed(2)))
            : '-';

        const evSegCellsHtml = Array.from({ length: maxSegments }, (_, segIdx) => {
          if (segIdx >= (r.segmentsCount || maxSegments)) {
            return `<td style="padding:4px 2px;text-align:center;vertical-align:middle;background:${evRowBg};color:#94A3B8;border-top:${topBorder};border-bottom:${bottomBorder};border-left:1px solid #93C5FD;font-size:10px;">—</td>`;
          }
          const foundSeg = ev
            ? (ev.segments || []).find(
                (s: any, i: number) =>
                  Number(s.segmentNumber || i + 1) === segIdx + 1
              )
            : null;
          const valStr = ev
            ? ev.isUnmemorized || foundSeg?.isUnmemorized
              ? '0'
              : foundSeg
              ? String(foundSeg.score ?? 0)
              : '-'
            : '-';
          return `<td style="padding:4px 2px;text-align:center;vertical-align:middle;background:${evRowBg};color:#1E3A8A;font-weight:800;border-top:${topBorder};border-bottom:${bottomBorder};border-left:1px solid #93C5FD;font-size:10px;">${escapeHtml(valStr)}</td>`;
        }).join('');

        const avgSegCellsHtml = isFirstSubRow
          ? Array.from({ length: maxSegments }, (_, segIdx) => {
              if (segIdx >= (r.segmentsCount || maxSegments)) {
                return `<td rowspan="${spanCount}" style="padding:4px 2px;text-align:center;vertical-align:middle;background:${summaryBg};color:#94A3B8;${mergedBorderStyle}font-size:10px;">—</td>`;
              }
              const avgVal = r.isUnmemorized
                ? 0
                : r.segmentAverages?.[segIdx] ?? '-';
              return `<td rowspan="${spanCount}" style="padding:4px 2px;text-align:center;vertical-align:middle;background:${summaryBg};color:#065F46;font-weight:800;${mergedBorderStyle}font-size:10px;">${escapeHtml(avgVal)}</td>`;
            }).join('')
          : '';

        const regDateShort = r.participant?.registrationDate
          ? String(r.participant.registrationDate).split(' ')[0]
          : '-';

        rowsHtml += `
          <tr>
            ${
              isFirstSubRow
                ? `
              <td rowspan="${spanCount}" style="padding:4px 3px;text-align:center;vertical-align:middle;background:${studentBg};color:#475569;font-weight:800;${mergedBorderStyle}font-size:10px;">${sIdx + 1}</td>
              <td rowspan="${spanCount}" style="padding:4px 3px;text-align:center;vertical-align:middle;background:${rankBg};color:${rankColor};font-weight:900;${mergedBorderStyle}font-size:10px;">${escapeHtml(rankText)}</td>
              <td rowspan="${spanCount}" style="padding:4px 3px;text-align:center;vertical-align:middle;background:${studentBg};color:#334155;font-weight:800;${mergedBorderStyle}font-size:10px;">${escapeHtml(overallRankText)}</td>
              <td rowspan="${spanCount}" style="padding:4px 3px;text-align:center;vertical-align:middle;background:${studentBg};color:#334155;font-weight:700;${mergedBorderStyle}font-size:10px;">${escapeHtml(r.participant?.requestNumber || '-')}</td>
              <td rowspan="${spanCount}" style="padding:4px 6px;text-align:right;vertical-align:middle;background:${studentBg};color:#0F172A;font-weight:900;${mergedBorderStyle}font-size:11px;">${escapeHtml(r.participant?.name || '-')}</td>
              <td rowspan="${spanCount}" style="padding:4px 4px;text-align:center;vertical-align:middle;background:${studentBg};color:#334155;font-weight:700;${mergedBorderStyle}font-size:10px;">${escapeHtml(r.participant?.civilId || '-')}</td>
              <td rowspan="${spanCount}" style="padding:4px 4px;text-align:center;vertical-align:middle;background:${studentBg};color:#334155;font-weight:700;${mergedBorderStyle}font-size:10px;">${escapeHtml(r.participant?.phone || '-')}</td>
              <td rowspan="${spanCount}" style="padding:4px 3px;text-align:center;vertical-align:middle;background:${studentBg};color:#334155;font-weight:700;${mergedBorderStyle}font-size:10px;">${escapeHtml(r.participant?.gender || '-')}</td>
              <td rowspan="${spanCount}" style="padding:4px 4px;text-align:center;vertical-align:middle;background:${studentBg};color:#0F172A;font-weight:800;${mergedBorderStyle}font-size:10px;">${escapeHtml(r.participant?.wilayat || '-')}</td>
              <td rowspan="${spanCount}" style="padding:4px 5px;text-align:right;vertical-align:middle;background:#EEF2FF;color:#312E81;font-weight:800;${mergedBorderStyle}font-size:10px;">${escapeHtml(r.level?.name || '-')}</td>
              <td rowspan="${spanCount}" style="padding:4px 5px;text-align:right;vertical-align:middle;background:#F0FDF4;color:#065F46;font-weight:800;${mergedBorderStyle}font-size:9.5px;">${escapeHtml(
                    formatJuzsDisplay(
                      r.participant?.juzsOrSurahs || r.level?.juzsOrSurahs || ''
                    )
                  )}</td>
              <td rowspan="${spanCount}" style="padding:4px 3px;text-align:center;vertical-align:middle;background:${studentBg};color:#475569;font-weight:700;${mergedBorderStyle}font-size:9.5px;">${escapeHtml(regDateShort)}</td>
              <td rowspan="${spanCount}" style="padding:4px 3px;text-align:center;vertical-align:middle;background:${studentBg};color:#0F172A;font-weight:900;${mergedBorderStyle}border-left:2px solid #0F172A;font-size:10px;">${escapeHtml(r.maxScore ?? 100)}</td>
            `
                : ''
            }

            <td style="padding:4px 5px;text-align:right;vertical-align:middle;background:${evRowBg};color:#1E3A8A;font-weight:800;border-top:${topBorder};border-bottom:${bottomBorder};border-left:1px solid #93C5FD;font-size:10px;">${escapeHtml(evName)}</td>
            ${evSegCellsHtml}
            <td style="padding:4px 3px;text-align:center;vertical-align:middle;background:${evRowBg};color:#BE123C;font-weight:800;border-top:${topBorder};border-bottom:${bottomBorder};border-left:1px solid #93C5FD;font-size:10px;">${escapeHtml(evDeduction)}</td>
            <td style="padding:4px 4px;text-align:center;vertical-align:middle;background:${evScoreBg};color:#0C4A6E;font-weight:900;border-top:${topBorder};border-bottom:${bottomBorder};border-left:1px solid #93C5FD;font-size:10.5px;">${
          ev
            ? ev.isUnmemorized
              ? 'غير حافظ (0)'
              : escapeHtml(ev.totalScore)
            : 'لم يقيم'
        }</td>
            <td style="padding:4px 5px;text-align:right;vertical-align:middle;background:${evRowBg};color:#334155;font-weight:700;border-top:${topBorder};border-bottom:${bottomBorder};border-left:2px solid #0F172A;font-size:9.5px;">${escapeHtml(
          ev?.notes ? String(ev.notes).trim() : '-'
        )}</td>

            ${
              isFirstSubRow
                ? `
              ${avgSegCellsHtml}
              <td rowspan="${spanCount}" style="padding:4px 3px;text-align:center;vertical-align:middle;background:${summaryBg};color:#065F46;font-weight:800;${mergedBorderStyle}font-size:10px;">${escapeHtml(r.evaluationsCount ?? 0)}</td>
              <td rowspan="${spanCount}" style="padding:4px 3px;text-align:center;vertical-align:middle;background:${summaryBg};color:#065F46;font-weight:800;${mergedBorderStyle}font-size:10px;">${escapeHtml(
                    r.highestEvalScore !== null && r.highestEvalScore !== undefined
                      ? r.highestEvalScore
                      : '-'
                  )}</td>
              <td rowspan="${spanCount}" style="padding:4px 3px;text-align:center;vertical-align:middle;background:${summaryBg};color:#78350F;font-weight:800;${mergedBorderStyle}font-size:10px;">${escapeHtml(
                    r.lowestEvalScore !== null && r.lowestEvalScore !== undefined
                      ? r.lowestEvalScore
                      : '-'
                  )}</td>
              <td rowspan="${spanCount}" style="padding:4px 3px;text-align:center;vertical-align:middle;background:${summaryBg};color:${
                    r.evalSpread > 5 ? '#BE123C' : '#065F46'
                  };font-weight:800;${mergedBorderStyle}font-size:10px;">${escapeHtml(
                    r.evaluationsCount > 1 ? r.evalSpread : '-'
                  )}</td>
              <td rowspan="${spanCount}" style="padding:4px 3px;text-align:center;vertical-align:middle;background:${
                    r.totalDeductions > 0 ? '#FFF1F2' : summaryBg
                  };color:#BE123C;font-weight:800;${mergedBorderStyle}font-size:10px;">${escapeHtml(
                    r.isUnmemorized
                      ? r.maxScore
                      : r.totalDeductions !== null && r.totalDeductions !== undefined
                      ? r.totalDeductions
                      : '-'
                  )}</td>
              <td rowspan="${spanCount}" style="padding:4px 5px;text-align:center;vertical-align:middle;background:${
                    r.isUnmemorized ? '#FFE4E6' : '#FEF3C7'
                  };color:${
                    r.isUnmemorized ? '#9F1239' : '#78350F'
                  };font-weight:900;${mergedBorderStyle}font-size:11.5px;">${escapeHtml(
                    r.isUnmemorized
                      ? 'غير حافظ (0)'
                      : r.averageScore !== null && r.averageScore !== undefined
                      ? r.averageScore
                      : 'لم يقيم'
                  )}</td>
              <td rowspan="${spanCount}" style="padding:4px 4px;text-align:center;vertical-align:middle;background:${summaryBg};color:#065F46;font-weight:900;${mergedBorderStyle}font-size:10.5px;">${escapeHtml(
                    r.percentage !== null &&
                      r.percentage !== undefined &&
                      !r.isUnmemorized
                      ? `${r.percentage}%`
                      : '-'
                  )}</td>
              <td rowspan="${spanCount}" style="padding:4px 5px;text-align:center;vertical-align:middle;background:${gradeBg};color:${gradeFg};font-weight:900;${mergedBorderStyle}font-size:10px;">${escapeHtml(
                    gradeLabel
                  )}</td>
            `
                : ''
            }
          </tr>
        `;
      });
    });
  }

  return `
    <div class="pdf-landscape-sheet" style="width:1680px;min-height:1140px;background:#FFFFFF;padding:18px 22px;box-sizing:border-box;direction:rtl;font-family:'Tajawal','Cairo',sans-serif;display:flex;flex-direction:column;justify-content:space-between;page-break-after:always;break-after:page;">
      <div>
        <!-- شريط الترويسة الرسمي للمسابقة والموسم -->
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;padding-bottom:6px;border-bottom:2px solid #D97706;">
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-size:13px;font-weight:900;color:#09152C;">${escapeHtml(compName)}</span>
            ${
              seasonText
                ? `<span style="font-size:11px;font-weight:800;color:#92400E;background:#FEF3C7;padding:2px 10px;border-radius:6px;border:1px solid #F59E0B;">${escapeHtml(seasonText)}</span>`
                : ''
            }
          </div>
          <div style="font-size:11px;font-weight:800;color:#475569;">
            قسم: ${escapeHtml(sectionTitle)} — (صفحة ${pageNumberInSection} من ${totalPagesInSection})
          </div>
        </div>

        <!-- الشريط العلوي المطابق لورقة الإكسل (Title Banner + Subtitle Banner) -->
        <div style="background:${palette.bannerBg};color:${palette.bannerText};padding:9px 14px;text-align:center;font-size:15px;font-weight:900;border:2px solid #0F172A;border-bottom:none;border-radius:10px 10px 0 0;">
          ${escapeHtml(sectionTitle)}
        </div>
        <div style="background:${palette.subBannerBg};color:${palette.subBannerText};padding:6px 14px;text-align:center;font-size:11.5px;font-weight:800;border:2px solid #0F172A;border-bottom:none;">
          ${escapeHtml(sectionSubtitle)}
        </div>

        <!-- الجدول الشامل المدمج المطابق للإكسل -->
        <table style="width:100%;border-collapse:collapse;table-layout:auto;direction:rtl;border:2px solid #0F172A;">
          <thead>
            <tr>
              <th colspan="13" style="padding:6px 8px;text-align:center;background:${palette.studentHeaderBg};color:#FDE68A;font-size:11px;font-weight:900;border:1px solid #334155;border-left:2px solid #F59E0B;">
                أولاً: بيانات المتسابق الأساسية والمستوى (خلايا مدمجة لكل متسابق)
              </th>
              <th colspan="${4 + maxSegments}" style="padding:6px 8px;text-align:center;background:${palette.evalHeaderBg};color:#FFFFFF;font-size:11px;font-weight:900;border:1px solid #334155;border-left:2px solid #F59E0B;">
                ثانياً: بيانات التقييم التفصيلية لكل مقيم (خلايا مقسمة — كل مقيم في صف مستقل)
              </th>
              <th colspan="${8 + maxSegments}" style="padding:6px 8px;text-align:center;background:${palette.summaryHeaderBg};color:#FEF3C7;font-size:11px;font-weight:900;border:1px solid #334155;">
                ثالثاً: خلاصة المتوسطات والدرجة النهائية المعتمدة (خلايا مدمجة لكل متسابق)
              </th>
            </tr>
            <tr style="background:#1E293B;color:#FFFFFF;font-weight:900;font-size:10px;">
              <th style="padding:5px 3px;text-align:center;background:#1E293B;border:1px solid #475569;width:24px;">م</th>
              <th style="padding:5px 3px;text-align:center;background:#1E293B;border:1px solid #475569;width:42px;">المركز بالمستوى</th>
              <th style="padding:5px 3px;text-align:center;background:#1E293B;border:1px solid #475569;width:36px;">الترتيب العام</th>
              <th style="padding:5px 3px;text-align:center;background:#1E293B;border:1px solid #475569;width:52px;">رقم الطلب</th>
              <th style="padding:5px 6px;text-align:right;background:#1E293B;border:1px solid #475569;min-width:130px;">الاسم الكامل</th>
              <th style="padding:5px 4px;text-align:center;background:#1E293B;border:1px solid #475569;width:68px;">الرقم المدني</th>
              <th style="padding:5px 4px;text-align:center;background:#1E293B;border:1px solid #475569;width:66px;">رقم الهاتف</th>
              <th style="padding:5px 3px;text-align:center;background:#1E293B;border:1px solid #475569;width:36px;">الجنس</th>
              <th style="padding:5px 4px;text-align:center;background:#1E293B;border:1px solid #475569;width:54px;">الولاية</th>
              <th style="padding:5px 5px;text-align:right;background:#1E293B;border:1px solid #475569;min-width:85px;">مستوى المشاركة</th>
              <th style="padding:5px 5px;text-align:right;background:#1E293B;border:1px solid #475569;min-width:95px;">المقرر / الأجزاء</th>
              <th style="padding:5px 3px;text-align:center;background:#1E293B;border:1px solid #475569;width:58px;">تاريخ التسجيل</th>
              <th style="padding:5px 3px;text-align:center;background:#1E293B;border:1px solid #475569;border-left:2px solid #F59E0B;width:36px;">الدرجة العظمى</th>

              <th style="padding:5px 5px;text-align:right;background:#1D4ED8;color:#FEF08A;border:1px solid #93C5FD;min-width:95px;">المقيم المعتمد</th>
              ${evalSegHeadersHtml}
              <th style="padding:5px 3px;text-align:center;background:#1D4ED8;border:1px solid #93C5FD;width:40px;">خصم المقيم</th>
              <th style="padding:5px 4px;text-align:center;background:#1E3A8A;color:#FEF08A;border:1px solid #93C5FD;width:48px;">درجة المقيم</th>
              <th style="padding:5px 5px;text-align:right;background:#1D4ED8;border:1px solid #93C5FD;border-left:2px solid #F59E0B;min-width:80px;">ملاحظات المقيم</th>

              ${avgSegHeadersHtml}
              <th style="padding:5px 3px;text-align:center;background:#047857;border:1px solid #6EE7B7;width:36px;">عدد المقيمين</th>
              <th style="padding:5px 3px;text-align:center;background:#047857;border:1px solid #6EE7B7;width:38px;">أعلى تقييم</th>
              <th style="padding:5px 3px;text-align:center;background:#047857;border:1px solid #6EE7B7;width:38px;">أدنى تقييم</th>
              <th style="padding:5px 3px;text-align:center;background:#047857;border:1px solid #6EE7B7;width:36px;">الفارق</th>
              <th style="padding:5px 3px;text-align:center;background:#047857;border:1px solid #6EE7B7;width:42px;">متوسط الخصم</th>
              <th style="padding:5px 4px;text-align:center;background:#065F46;color:#FDE68A;border:1px solid #6EE7B7;width:58px;">الدرجة النهائية المعتمدة</th>
              <th style="padding:5px 3px;text-align:center;background:#047857;border:1px solid #6EE7B7;width:44px;">النسبة المئوية</th>
              <th style="padding:5px 4px;text-align:center;background:#047857;border:1px solid #6EE7B7;width:76px;">التقدير العام</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>

      <!-- تذييل الصفحة والتوقيعات الرسمية في نهاية القسم -->
      <div style="margin-top:10px;">
        ${
          isLastPageOfSection
            ? `
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:8px;padding-top:8px;border-top:2px solid #F59E0B;text-align:center;font-size:11px;font-weight:900;color:#0F172A;">
            <div style="padding:6px;background:#F8FAFC;border:1px solid #CBD5E1;border-radius:8px;">
              <div>لجنة التقييم والتحكيم</div>
              <div style="margin-top:14px;color:#64748B;font-weight:700;">التوقيع: ............................</div>
            </div>
            <div style="padding:6px;background:#F8FAFC;border:1px solid #CBD5E1;border-radius:8px;">
              <div>رئيس لجنة المسابقة</div>
              <div style="margin-top:14px;color:#64748B;font-weight:700;">التوقيع: ............................</div>
            </div>
            <div style="padding:6px;background:#F8FAFC;border:1px solid #CBD5E1;border-radius:8px;">
              <div>يعتمد / مدير الإدارة</div>
              <div style="margin-top:14px;color:#64748B;font-weight:700;">التوقيع والختم: ............................</div>
            </div>
          </div>
        `
            : ''
        }
        <div style="display:flex;align-items:center;justify-content:space-between;font-size:10px;font-weight:800;color:#64748B;padding-top:4px;border-top:1px solid #E2E8F0;">
          <span>${escapeHtml(compName)} — ${escapeHtml(sectionTitle)}</span>
          <span>تاريخ الإصدار: ${new Date().toLocaleDateString('ar-OM')}</span>
          <span>صفحة (${globalPageNumber})</span>
        </div>
      </div>
    </div>
  `;
}

/**
 * بناء صفحة خاصة لقسم الإحصائيات التفصيلية للمستويات والولايات والجنس (مطابق لورقة الإحصائيات في الإكسل)
 */
function buildSummarySheetPageHtml(params: {
  comp: Competition;
  summaryRows: Record<string, any>[];
  globalPageNumber: number;
}): string {
  const { comp, summaryRows, globalPageNumber } = params;

  const rowsHtml = summaryRows
    .map((row, idx) => {
      const isEven = idx % 2 === 0;
      const bg = isEven ? '#FFFFFF' : '#F8FAFC';
      return `
        <tr>
          <td style="padding:7px 10px;text-align:right;background:#EEF2FF;color:#312E81;font-weight:900;border:1px solid #CBD5E1;font-size:11.5px;">${escapeHtml(row['التصنيف الإحصائي'])}</td>
          <td style="padding:7px 10px;text-align:right;background:${bg};color:#0F172A;font-weight:900;border:1px solid #CBD5E1;font-size:11.5px;">${escapeHtml(row['الفئة'])}</td>
          <td style="padding:7px 10px;text-align:center;background:${bg};color:#0F172A;font-weight:800;border:1px solid #CBD5E1;font-size:11.5px;">${escapeHtml(row['إجمالي المسجلين'])}</td>
          <td style="padding:7px 10px;text-align:center;background:#F0FDF4;color:#065F46;font-weight:900;border:1px solid #CBD5E1;font-size:11.5px;">${escapeHtml(row['تم تقييمهم (حافظون)'])}</td>
          <td style="padding:7px 10px;text-align:center;background:#FFF1F2;color:#9F1239;font-weight:800;border:1px solid #CBD5E1;font-size:11.5px;">${escapeHtml(row['غير حافظين'])}</td>
          <td style="padding:7px 10px;text-align:center;background:#FFFBEB;color:#92400E;font-weight:800;border:1px solid #CBD5E1;font-size:11.5px;">${escapeHtml(row['بانتظار التقييم'])}</td>
          <td style="padding:7px 10px;text-align:center;background:#D1FAE5;color:#065F46;font-weight:900;border:1px solid #CBD5E1;font-size:12px;">${escapeHtml(row['متوسط الدرجات'])}</td>
        </tr>
      `;
    })
    .join('');

  return `
    <div class="pdf-landscape-sheet" style="width:1680px;min-height:1140px;background:#FFFFFF;padding:18px 22px;box-sizing:border-box;direction:rtl;font-family:'Tajawal','Cairo',sans-serif;display:flex;flex-direction:column;justify-content:space-between;page-break-after:always;break-after:page;">
      <div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;padding-bottom:6px;border-bottom:2px solid #D97706;">
          <span style="font-size:13px;font-weight:900;color:#09152C;">${escapeHtml(comp.name)}</span>
          <span style="font-size:11px;font-weight:800;color:#475569;">قسم: الإحصائيات التفصيلية للمستويات والولايات والجنس</span>
        </div>

        <div style="background:#4C1D95;color:#FDE68A;padding:10px 14px;text-align:center;font-size:15px;font-weight:900;border:2px solid #0F172A;border-bottom:none;border-radius:10px 10px 0 0;">
          ${escapeHtml(comp.name)} — الإحصائيات التفصيلية للمستويات والولايات والجنس
        </div>
        <div style="background:#FEF3C7;color:#78350F;padding:6px 14px;text-align:center;font-size:11.5px;font-weight:800;border:2px solid #0F172A;border-bottom:none;">
          ملخص إحصائي شامل مصنف حسب مستوى المشاركة والولاية والجنس ومتوسط الأداء العام
        </div>

        <table style="width:100%;border-collapse:collapse;direction:rtl;border:2px solid #0F172A;">
          <thead>
            <tr style="background:#6D28D9;color:#FFFFFF;font-weight:900;font-size:12px;">
              <th style="padding:8px 10px;text-align:right;border:1px solid #CBD5E1;">التصنيف الإحصائي</th>
              <th style="padding:8px 10px;text-align:right;border:1px solid #CBD5E1;">الفئة</th>
              <th style="padding:8px 10px;text-align:center;border:1px solid #CBD5E1;">إجمالي المسجلين</th>
              <th style="padding:8px 10px;text-align:center;border:1px solid #CBD5E1;">تم تقييمهم (حافظون)</th>
              <th style="padding:8px 10px;text-align:center;border:1px solid #CBD5E1;">غير حافظين</th>
              <th style="padding:8px 10px;text-align:center;border:1px solid #CBD5E1;">بانتظار التقييم</th>
              <th style="padding:8px 10px;text-align:center;border:1px solid #CBD5E1;">متوسط الدرجات</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>

      <div style="margin-top:12px;">
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:8px;padding-top:8px;border-top:2px solid #F59E0B;text-align:center;font-size:11px;font-weight:900;color:#0F172A;">
          <div style="padding:6px;background:#F8FAFC;border:1px solid #CBD5E1;border-radius:8px;">
            <div>لجنة التقييم والتحكيم</div>
            <div style="margin-top:14px;color:#64748B;font-weight:700;">التوقيع: ............................</div>
          </div>
          <div style="padding:6px;background:#F8FAFC;border:1px solid #CBD5E1;border-radius:8px;">
            <div>رئيس لجنة المسابقة</div>
            <div style="margin-top:14px;color:#64748B;font-weight:700;">التوقيع: ............................</div>
          </div>
          <div style="padding:6px;background:#F8FAFC;border:1px solid #CBD5E1;border-radius:8px;">
            <div>يعتمد / مدير الإدارة</div>
            <div style="margin-top:14px;color:#64748B;font-weight:700;">التوقيع والختم: ............................</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;font-size:10px;font-weight:800;color:#64748B;padding-top:4px;border-top:1px solid #E2E8F0;">
          <span>${escapeHtml(comp.name)} — الإحصائيات التفصيلية</span>
          <span>تاريخ الإصدار: ${new Date().toLocaleDateString('ar-OM')}</span>
          <span>صفحة (${globalPageNumber})</span>
        </div>
      </div>
    </div>
  `;
}

/**
 * تصدير ملف PDF واحد شامل بصفحات أفقية (Landscape) مرتب تماماً بنفس ترتيب ورقات ملف الإكسل:
 * - كل مستوى من مستويات المسابقة في صفحات أفقية خاصة به (مع ترويسة الجدول في كل صفحة وعدم انقطاع أي متسابق).
 * - يليه قسم الجدول الشامل المدمج العام (جميع المستويات) في صفحات أفقية خاصة به.
 * - يليه قسم الإحصائيات التفصيلية للمستويات والولايات والجنس في صفحة أفقية خاصة به.
 */
export async function exportComprehensiveWorkbookStylePdf(
  options: ComprehensivePdfOptions,
  fileName: string
): Promise<void> {
  const {
    comp,
    allResults,
    filteredResults,
    baseFilteredResults,
    wilayatOptions,
    genderOptions,
    getEvaluatorName,
    formatJuzsDisplay,
  } = options;

  const pageHtmlList: string[] = [];
  let globalPageNumber = 1;

  // 1. أقسام المستويات (كل مستوى في صفحات أفقية خاصة به، بنفس ترتيب ورقات الإكسل)
  const levels: CompetitionLevel[] = comp.levels || [];
  levels.forEach((lvl, lvlIdx) => {
    const levelResults = allResults
      .filter((r: any) => Number(r.effectiveLevelId) === Number(lvl.id))
      .sort((a: any, b: any) => {
        if (a.rankInLevel !== null && b.rankInLevel !== null) {
          return a.rankInLevel - b.rankInLevel;
        }
        if (a.rankInLevel !== null) return -1;
        if (b.rankInLevel !== null) return 1;
        if (a.isUnmemorized && !b.isUnmemorized) return 1;
        if (!a.isUnmemorized && b.isUnmemorized) return -1;
        return (a.participant?.name || '').localeCompare(
          b.participant?.name || '',
          'ar'
        );
      });

    const lvlMemorizedCount = levelResults.filter(
      (r: any) => r.averageScore !== null && !r.isUnmemorized
    ).length;
    const lvlUnmemorizedCount = levelResults.filter(
      (r: any) => r.isUnmemorized
    ).length;
    const lvlPendingCount = levelResults.filter(
      (r: any) => r.evaluationsCount === 0
    ).length;

    const sectionTitle = `${comp.name} — نتائج ${lvl.name} (${formatJuzsDisplay(lvl.juzsOrSurahs)})`;
    const sectionSubtitle = `إجمالي المسجلين بالمستوى: ${levelResults.length} | الحافظون المقيمون: ${lvlMemorizedCount} | غير حافظين: ${lvlUnmemorizedCount} | بانتظار التقييم: ${lvlPendingCount} | الدرجة العظمى: ${lvl.maxScore}`;

    const chunks = chunkResultsBySubRows(levelResults, 14);
    const maxSegsForLevel = Math.max(1, Number(lvl.segmentsCount || 3));
    const palette = LEVEL_PALETTES[lvlIdx % LEVEL_PALETTES.length];

    let runningIdx = 0;
    chunks.forEach((chunk, chunkIdx) => {
      pageHtmlList.push(
        buildMergedTablePageHtml({
          compName: comp.name,
          seasonText: comp.seasonText,
          sectionTitle,
          sectionSubtitle,
          pageResults: chunk,
          startIndex: runningIdx,
          maxSegments: maxSegsForLevel,
          palette,
          pageNumberInSection: chunkIdx + 1,
          totalPagesInSection: chunks.length,
          globalPageNumber: globalPageNumber++,
          isLastPageOfSection: chunkIdx === chunks.length - 1,
          getEvaluatorName,
          formatJuzsDisplay,
        })
      );
      runningIdx += chunk.length;
    });
  });

  // 2. قسم الجدول الشامل المدمج العام (جميع المستويات معاً) في صفحات أفقية خاصة به
  const maxSegsOverall = Math.max(
    1,
    ...(comp.levels || []).map(l => Number(l.segmentsCount || 3)),
    ...filteredResults.map((r: any) => Number(r.segmentsCount || 3))
  );
  const allChunks = chunkResultsBySubRows(filteredResults, 14);
  const overallTitle = `${comp.name} — الكشف الشامل المدمج العام (جميع المستويات)`;
  const overallSubtitle = `إجمالي المتسابقين بالكشف الشامل: ${filteredResults.length} | كل متسابق في سجل موحد (بيانات المتسابق مدمجة + تقييم كل مقيم في صف مستقل + المتوسطات والدرجة النهائية مدمجة)`;

  let overallRunningIdx = 0;
  allChunks.forEach((chunk, chunkIdx) => {
    pageHtmlList.push(
      buildMergedTablePageHtml({
        compName: comp.name,
        seasonText: comp.seasonText,
        sectionTitle: overallTitle,
        sectionSubtitle: overallSubtitle,
        pageResults: chunk,
        startIndex: overallRunningIdx,
        maxSegments: maxSegsOverall,
        palette: {
          bannerBg: '#09152C',
          bannerText: '#FDE68A',
          subBannerBg: '#FEF3C7',
          subBannerText: '#78350F',
          studentHeaderBg: '#0F172A',
          evalHeaderBg: '#1E3A8A',
          summaryHeaderBg: '#065F46',
        },
        pageNumberInSection: chunkIdx + 1,
        totalPagesInSection: allChunks.length,
        globalPageNumber: globalPageNumber++,
        isLastPageOfSection: chunkIdx === allChunks.length - 1,
        getEvaluatorName,
        formatJuzsDisplay,
      })
    );
    overallRunningIdx += chunk.length;
  });

  // 3. قسم الإحصائيات التفصيلية للمستويات والولايات والجنس في صفحة أفقية خاصة به
  const summaryRows: Record<string, any>[] = [];
  (comp.levels || []).forEach(lvl => {
    const lvlItems = baseFilteredResults.filter(
      (r: any) => Number(r.effectiveLevelId) === Number(lvl.id)
    );
    const lvlEval = lvlItems.filter(
      (r: any) => r.averageScore !== null && !r.isUnmemorized
    );
    const avg =
      lvlEval.length > 0
        ? Number(
            (
              lvlEval.reduce((s: number, x: any) => s + (x.averageScore || 0), 0) /
              lvlEval.length
            ).toFixed(2)
          )
        : '-';
    summaryRows.push({
      'التصنيف الإحصائي': 'حسب مستوى المشاركة',
      الفئة: lvl.name,
      'إجمالي المسجلين': lvlItems.length,
      'تم تقييمهم (حافظون)': lvlEval.length,
      'غير حافظين': lvlItems.filter((x: any) => x.isUnmemorized).length,
      'بانتظار التقييم': lvlItems.filter((x: any) => x.evaluationsCount === 0).length,
      'متوسط الدرجات': avg,
    });
  });

  wilayatOptions.forEach(wOpt => {
    const wItems = baseFilteredResults.filter(
      (r: any) => (r.participant?.wilayat || 'غير محدد').trim() === wOpt.value
    );
    const wEval = wItems.filter(
      (r: any) => r.averageScore !== null && !r.isUnmemorized
    );
    const avg =
      wEval.length > 0
        ? Number(
            (
              wEval.reduce((s: number, x: any) => s + (x.averageScore || 0), 0) /
              wEval.length
            ).toFixed(2)
          )
        : '-';
    summaryRows.push({
      'التصنيف الإحصائي': 'حسب الولاية',
      الفئة: wOpt.label,
      'إجمالي المسجلين': wItems.length,
      'تم تقييمهم (حافظون)': wEval.length,
      'غير حافظين': wItems.filter((x: any) => x.isUnmemorized).length,
      'بانتظار التقييم': wItems.filter((x: any) => x.evaluationsCount === 0).length,
      'متوسط الدرجات': avg,
    });
  });

  genderOptions.forEach(gOpt => {
    const gItems = baseFilteredResults.filter(
      (r: any) => (r.participant?.gender || 'غير محدد').trim() === gOpt.value
    );
    const gEval = gItems.filter(
      (r: any) => r.averageScore !== null && !r.isUnmemorized
    );
    const avg =
      gEval.length > 0
        ? Number(
            (
              gEval.reduce((s: number, x: any) => s + (x.averageScore || 0), 0) /
              gEval.length
            ).toFixed(2)
          )
        : '-';
    summaryRows.push({
      'التصنيف الإحصائي': 'حسب الجنس',
      الفئة: gOpt.label,
      'إجمالي المسجلين': gItems.length,
      'تم تقييمهم (حافظون)': gEval.length,
      'غير حافظين': gItems.filter((x: any) => x.isUnmemorized).length,
      'بانتظار التقييم': gItems.filter((x: any) => x.evaluationsCount === 0).length,
      'متوسط الدرجات': avg,
    });
  });

  pageHtmlList.push(
    buildSummarySheetPageHtml({
      comp,
      summaryRows,
      globalPageNumber: globalPageNumber++,
    })
  );

  // محاولة التصدير عبر /api/pdf أولاً إن كان متوفراً، وإلا عبر التصيير المباشر لكل صفحة أفقية بواسطة html2canvas + jsPDF
  const fullVectorHtml = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&family=Tajawal:wght@400;500;700;800;900&display=swap" rel="stylesheet">
  <style>
    @page {
      size: A4 landscape;
      margin: 5mm;
    }
    *, *::before, *::after {
      box-sizing: border-box;
      letter-spacing: 0px !important;
      word-spacing: normal !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      margin: 0;
      padding: 0;
      background: #FFFFFF;
      font-family: 'Tajawal', 'Cairo', sans-serif;
      direction: rtl;
    }
    .pdf-landscape-sheet {
      width: 100% !important;
      min-height: auto !important;
      page-break-after: always !important;
      break-after: page !important;
    }
    .pdf-landscape-sheet:last-child {
      page-break-after: auto !important;
      break-after: auto !important;
    }
    tr {
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }
  </style>
</head>
<body dir="rtl">
  ${pageHtmlList.join('\n')}
</body>
</html>`;

  try {
    const res = await fetch('/api/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html: fullVectorHtml, orientation: 'landscape' }),
    });
    if (res.ok) {
      const pdfBlob = await res.blob();
      if (pdfBlob.size > 500) {
        const url = URL.createObjectURL(pdfBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${fileName}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        return;
      }
    }
  } catch {
    // الانتقال السلس للتوليد المباشر لكل صفحة أفقية في المتصفح (يدعم Netlify والعمل بدون خادم)
  }

  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready;
  }

  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.top = '0';
  host.style.left = '-10000px';
  host.style.width = '1680px';
  host.style.background = '#FFFFFF';
  host.style.zIndex = '-9999';
  host.setAttribute('dir', 'rtl');
  document.body.appendChild(host);

  const origFillText = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function (
    text: string,
    x: number,
    y: number,
    maxWidth?: number
  ) {
    this.direction = 'rtl';
    return maxWidth !== undefined
      ? origFillText.call(this, text, x, y, maxWidth)
      : origFillText.call(this, text, x, y);
  };

  try {
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
    });

    const pdfPageWidth = pdf.internal.pageSize.getWidth(); // 297mm
    const pdfPageHeight = pdf.internal.pageSize.getHeight(); // 210mm
    const marginMm = 4;
    const maxWidthMm = pdfPageWidth - marginMm * 2;
    const maxHeightMm = pdfPageHeight - marginMm * 2;

    for (let i = 0; i < pageHtmlList.length; i++) {
      host.innerHTML = pageHtmlList[i];
      const sheetEl = host.firstElementChild as HTMLElement;
      if (!sheetEl) continue;

      const canvas = await html2canvas(sheetEl, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#FFFFFF',
        windowWidth: 1680,
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      if (i > 0) {
        pdf.addPage('a4', 'landscape');
      }

      const ratio = canvas.width / Math.max(1, canvas.height);
      let renderWidthMm = maxWidthMm;
      let renderHeightMm = renderWidthMm / ratio;

      if (renderHeightMm > maxHeightMm) {
        renderHeightMm = maxHeightMm;
        renderWidthMm = renderHeightMm * ratio;
      }

      const offsetX = marginMm + (maxWidthMm - renderWidthMm) / 2;
      const offsetY = marginMm;

      pdf.addImage(
        imgData,
        'JPEG',
        offsetX,
        offsetY,
        renderWidthMm,
        renderHeightMm
      );
    }

    pdf.save(`${fileName}.pdf`);
  } finally {
    CanvasRenderingContext2D.prototype.fillText = origFillText;
    if (host.parentNode) {
      host.parentNode.removeChild(host);
    }
  }
}
