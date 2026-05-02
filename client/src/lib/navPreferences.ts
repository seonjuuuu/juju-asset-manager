/** 사이드바 «기록» 메뉴(부동산·블로그 체험단·결혼예산·사업소득) 표시 여부 */

export const RECORD_NAV_KEYS = ["realEstate", "blogCampaigns", "weddingBudget", "businessIncome"] as const;
export type RecordNavKey = (typeof RECORD_NAV_KEYS)[number];

export type NavPreferencesState = Record<RecordNavKey, boolean>;

export const DEFAULT_NAV_PREFERENCES: NavPreferencesState = {
  realEstate: true,
  blogCampaigns: true,
  weddingBudget: true,
  businessIncome: true,
};

export function parseNavPreferencesJson(raw: string | null | undefined): NavPreferencesState {
  if (!raw?.trim()) return { ...DEFAULT_NAV_PREFERENCES };
  try {
    const o = JSON.parse(raw) as Partial<Record<string, boolean>>;
    return {
      realEstate: o.realEstate !== false,
      blogCampaigns: o.blogCampaigns !== false,
      weddingBudget: o.weddingBudget !== false,
      businessIncome: o.businessIncome !== false,
    };
  } catch {
    return { ...DEFAULT_NAV_PREFERENCES };
  }
}
