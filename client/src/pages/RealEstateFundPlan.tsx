import { CurrencyInput } from "@/components/ui/currency-input";
import { useState, useEffect } from "react";
import { formatAmount } from "@/lib/utils";
import { Calculator } from "lucide-react";

import { RE_FUND_PLAN_LS_KEY } from "@/lib/real-estate-fund-plan-total";

type FundItem = { key: string; label: string; hint: string; enabled: boolean; amount: number };
type FundSection = { id: string; title: string; items: FundItem[] };

const INITIAL_SECTIONS: FundSection[] = [
  {
    id: "current",
    title: "현재 보유 자금",
    items: [
      { key: "lease_deposit", label: "실거주 전세보증금", hint: "회수 가능한 전세금", enabled: false, amount: 0 },
      { key: "cash", label: "현재 가용 현금", hint: "통장 잔액", enabled: false, amount: 0 },
    ],
  },
  {
    id: "financial",
    title: "금융자산 현금화",
    items: [
      { key: "savings_deposit", label: "예·적금", hint: "", enabled: false, amount: 0 },
      { key: "stocks_funds", label: "주식·펀드", hint: "", enabled: false, amount: 0 },
      { key: "bonds_other", label: "채권·기타", hint: "", enabled: false, amount: 0 },
    ],
  },
  {
    id: "additional",
    title: "추가 저축가능금액",
    items: [
      { key: "additional_savings", label: "잔금일까지 추가 저축", hint: "계약 ~ 잔금 (보통 1~3개월)", enabled: false, amount: 0 },
    ],
  },
  {
    id: "loan",
    title: "대출 (담보·신용)",
    items: [
      { key: "subscription_loan", label: "청약담보대출", hint: "청약통장의 90~95%", enabled: false, amount: 0 },
      { key: "work_loan", label: "직장대출", hint: "회사 복지 대출", enabled: false, amount: 0 },
      { key: "insurance_loan", label: "보험약관대출", hint: "본인 보험 활용", enabled: false, amount: 0 },
    ],
  },
  {
    id: "family",
    title: "부모님·형제자매 지원",
    items: [
      { key: "parent_gift", label: "부모님 증여", hint: "5,000만원까지 10년간 비과세", enabled: false, amount: 0 },
      { key: "parent_borrow", label: "부모님 차용", hint: "나중에 갚는 조건으로 빌리기", enabled: false, amount: 0 },
      { key: "parent_insurance_loan", label: "부모님 보험약관대출", hint: "부모님 보험 활용", enabled: false, amount: 0 },
    ],
  },
  {
    id: "etc",
    title: "기타",
    items: [
      { key: "severance", label: "퇴직금 중간정산", hint: "", enabled: false, amount: 0 },
      { key: "other_etc", label: "기타", hint: "", enabled: false, amount: 0 },
    ],
  },
];

function loadSections(): FundSection[] {
  try {
    const saved = localStorage.getItem(RE_FUND_PLAN_LS_KEY);
    if (!saved) return INITIAL_SECTIONS;
    const parsed: { [key: string]: { enabled: boolean; amount: number } } = JSON.parse(saved);
    return INITIAL_SECTIONS.map(sec => ({
      ...sec,
      items: sec.items.map(item => ({ ...item, ...(parsed[item.key] ?? {}) })),
    }));
  } catch {
    return INITIAL_SECTIONS;
  }
}

export default function RealEstateFundPlan() {
  const [sections, setSections] = useState<FundSection[]>(loadSections);

  useEffect(() => {
    const flat: { [key: string]: { enabled: boolean; amount: number } } = {};
    sections.forEach(sec => sec.items.forEach(item => { flat[item.key] = { enabled: item.enabled, amount: item.amount }; }));
    localStorage.setItem(RE_FUND_PLAN_LS_KEY, JSON.stringify(flat));
    window.dispatchEvent(new CustomEvent("re-fund-plan-updated"));
  }, [sections]);

  const toggle = (secId: string, key: string) => {
    setSections(prev => prev.map(sec =>
      sec.id !== secId ? sec : {
        ...sec,
        items: sec.items.map(item => item.key !== key ? item : { ...item, enabled: !item.enabled }),
      }
    ));
  };

  const setAmount = (secId: string, key: string, amount: number) => {
    setSections(prev => prev.map(sec =>
      sec.id !== secId ? sec : {
        ...sec,
        items: sec.items.map(item => item.key !== key ? item : { ...item, amount }),
      }
    ));
  };

  const total = sections.flatMap(s => s.items).filter(i => i.enabled).reduce((s, i) => s + i.amount, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Calculator className="w-5 h-5 text-primary" />
        <div>
          <h1 className="text-xl font-bold text-foreground">가용 자금 계획서</h1>
          <p className="text-sm text-muted-foreground mt-0.5">부동산 구매 시 활용 가능한 자금을 항목별로 정리합니다</p>
        </div>
      </div>

      {/* 총합 카드 */}
      <div className="bg-primary/10 border border-primary/20 rounded-xl px-5 py-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground mb-1">총 가용 자금 합계</p>
            <p className="text-3xl font-bold text-primary">{formatAmount(total)}<span className="text-lg ml-1">만원</span></p>
          </div>
          <div className="text-right space-y-1">
            {sections.map(sec => {
              const secTotal = sec.items.filter(i => i.enabled).reduce((s, i) => s + i.amount, 0);
              if (secTotal === 0) return null;
              return (
                <p key={sec.id} className="text-xs text-muted-foreground">
                  {sec.title}: <span className="font-semibold text-foreground">{formatAmount(secTotal)}만원</span>
                </p>
              );
            })}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {sections.map(sec => (
          <div key={sec.id} className="bg-card border border-border rounded-xl p-5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">{sec.title}</p>
            <div className="space-y-2">
              {sec.items.map(item => (
                <div
                  key={item.key}
                  className={`rounded-lg border transition-colors ${item.enabled ? "border-primary/30 bg-primary/5" : "border-border bg-muted/20"}`}
                >
                  <div className="flex items-center gap-3 px-3 py-2.5">
                    <button
                      onClick={() => toggle(sec.id, item.key)}
                      className={`w-9 h-5 rounded-full relative transition-colors flex-shrink-0 ${item.enabled ? "bg-primary" : "bg-muted-foreground/30"}`}
                    >
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${item.enabled ? "left-4" : "left-0.5"}`} />
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-none">{item.label}</p>
                      {item.hint && <p className="text-xs text-muted-foreground mt-0.5">{item.hint}</p>}
                    </div>
                    {item.enabled && (
                      <div className="w-48 flex-shrink-0">
                        <CurrencyInput
                          value={item.amount}
                          onChange={v => setAmount(sec.id, item.key, v)}
                          suffix="만원"
                          koreanUnit="manwon"
                          placeholder="0"
                        />
                      </div>
                    )}
                    {!item.enabled && (
                      <span className="text-xs text-muted-foreground flex-shrink-0">비활성</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
