import { CurrencyInput } from "@/components/ui/currency-input";
import { useState, useMemo } from "react";
import * as XLSX from "xlsx";
import { trpc } from "@/lib/trpc";
import { formatAmount, currentYear, currentMonth, MONTH_NAMES } from "@/lib/utils";
import { ledgerSubCostForMonth, subscriptionLedgerDate } from "@/lib/subscriptionLedger";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ChevronLeft, ChevronRight, Upload, Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

type LedgerEntry = {
  id: number;
  entryDate: string | Date;
  year: number;
  month: number;
  mainCategory: string;
  subCategory: string | null;
  description: string | null;
  amount: number;
  note: string | null;
};

type FixedExpenseRow = {
  id: number;
  mainCategory: string;
  subCategory: string | null;
  description: string | null;
  paymentAccount: string | null;
  monthlyAmount: number;
  paymentDay: number | null;
  startDate: string | null;
  expiryDate: string | null;
  note: string | null;
};

type LoanRow = {
  id: number;
  name: string;
  loanType: string;
  lender: string | null;
  startDate: string;
  maturityDate: string | null;
  paymentDay: number | null;
  monthlyPayment: number;
  remainingPrincipal: number;
  repaymentType: string;
  note: string | null;
};

type CardUploadRow = {
  id: string;
  selected: boolean;
  duplicate: boolean;
  entryDate: string;
  cardName: string;
  merchant: string;
  amount: number;
  signedAmount: number;
  entryType: "expense" | "income";
  status: string;
  installment: string;
  mainCategory: string;
  subCategory: string;
  categorySource: "learned" | "rule" | "default";
  selectedCardId: number | null;
  matchedCardName: string;
  note: string;
  raw: Record<string, unknown>;
};

const INCOME_MAIN_CATEGORIES = new Set(["소득", "근로소득", "사업소득", "투자소득", "기타소득"]);

const isIncomeCategory = (mainCategory: string) => INCOME_MAIN_CATEGORIES.has(mainCategory);

const formatSignedWon = (amount: number) => `${amount < 0 ? "-" : ""}₩${formatAmount(Math.abs(amount))}`;

const ledgerAmountColor: Record<string, string> = {
  "수입": "text-blue-600 dark:text-blue-400",
  "지출": "text-red-600 dark:text-red-400",
  "저축": "text-purple-600 dark:text-purple-400",
};

function instIsActiveInMonth(inst: { startDate: string; endDate: string }, y: number, m: number): boolean {
  if (!inst.startDate || !inst.endDate) return false;
  const [py, pm] = inst.startDate.split("-").map(Number);
  const [ey, em] = inst.endDate.split("-").map(Number);
  const first = py * 12 + pm + 1;
  const last = ey * 12 + em;
  const target = y * 12 + m;
  return target >= first && target <= last;
}

function instMonthlyPayment(totalAmount: number, months: number, isInterestFree: boolean, interestRate: string | null): number {
  if (!totalAmount || !months) return 0;
  if (isInterestFree || !interestRate || parseFloat(interestRate) === 0) return Math.round(totalAmount / months);
  const r = parseFloat(interestRate) / 100 / 12;
  if (r === 0) return Math.round(totalAmount / months);
  return Math.round((totalAmount * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1));
}

function loanAppliesToMonth(loan: LoanRow, year: number, month: number) {
  const key = `${year}-${String(month).padStart(2, "0")}`;
  if (loan.remainingPrincipal <= 0 || loan.monthlyPayment <= 0) return false;
  if (loan.startDate && loan.startDate.slice(0, 7) > key) return false;
  if (loan.maturityDate && loan.maturityDate.slice(0, 7) < key) return false;
  return true;
}

function normalizeHeader(value: string) {
  return value.replace(/\s/g, "").toLowerCase();
}

function findValue(row: Record<string, unknown>, candidates: string[]) {
  const entries = Object.entries(row);
  for (const candidate of candidates) {
    const normalizedCandidate = normalizeHeader(candidate);
    const found = entries.find(([key]) => normalizeHeader(key).includes(normalizedCandidate));
    if (found) return found[1];
  }
  return undefined;
}

function parseExcelDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed?.y && parsed?.m && parsed?.d) {
      return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
    }
  }
  const text = String(value ?? "").trim();
  if (!text) return "";
  const digits = text.replace(/\D/g, "");
  if (digits.length >= 8) return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function parseAmount(value: unknown) {
  if (typeof value === "number") return Math.round(value);
  const text = String(value ?? "").replace(/[^\d.-]/g, "");
  const amount = Number(text);
  return Number.isFinite(amount) ? Math.round(amount) : 0;
}

function merchantKey(value: string) {
  return value.replace(/\s/g, "").toLowerCase();
}

function readCategoryMemory(): Record<string, { mainCategory: string; subCategory: string }> {
  try {
    const raw = localStorage.getItem(CARD_UPLOAD_CATEGORY_MEMORY_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeCategoryMemory(memory: Record<string, { mainCategory: string; subCategory: string }>) {
  localStorage.setItem(CARD_UPLOAD_CATEGORY_MEMORY_KEY, JSON.stringify(memory));
}

const CATEGORY_RULES: Array<{ words: string[]; subCategory: string }> = [
  { words: ["쿠팡", "11번가", "g마켓", "옥션", "네이버페이", "스마트스토어", "무신사", "오늘의집", "ssg", "이마트몰", "마켓컬리", "컬리"], subCategory: "쇼핑" },
  { words: ["배달의민족", "배민", "요기요", "쿠팡이츠", "땡겨요"], subCategory: "배달" },
  { words: ["맥도날드", "버거킹", "롯데리아", "kfc", "맘스터치", "써브웨이", "식당", "김밥", "분식", "국밥", "마라탕", "초밥", "족발", "보쌈"], subCategory: "식비" },
  { words: ["스타벅스", "투썸", "이디야", "메가커피", "컴포즈", "빽다방", "커피", "카페"], subCategory: "카페" },
  { words: ["gs25", "cu", "세븐일레븐", "이마트24", "미니스톱", "편의점"], subCategory: "편의점" },
  { words: ["주유", "gs칼텍스", "sk에너지", "s-oil", "soil", "현대오일", "하이패스", "톨게이트", "주차", "파킹"], subCategory: "차량" },
  { words: ["카카오택시", "택시", "코레일", "srt", "버스", "지하철", "티머니", "캐시비"], subCategory: "교통" },
  { words: ["약국", "병원", "의원", "치과", "한의원", "올리브영"], subCategory: "의료" },
  { words: ["넷플릭스", "유튜브", "youtube", "spotify", "멜론", "왓챠", "티빙", "쿠팡플레이", "디즈니", "애플"], subCategory: "구독서비스" },
  { words: ["관리비", "전기", "가스", "수도", "통신", "휴대폰", "인터넷"], subCategory: "공과금" },
];

const PIE_COLORS = [
  "#5b7cfa","#f97316","#22c55e","#a855f7","#ec4899",
  "#14b8a6","#f59e0b","#ef4444","#06b6d4","#84cc16","#8b5cf6","#f43f5e",
];

const EMPTY_FORM = {
  entryType: "expense" as "expense" | "income",
  entryDate: new Date().toISOString().split("T")[0],
  year: currentYear,
  month: currentMonth,
  mainCategory: "",
  subCategory: "",
  description: "",
  amount: 0,
  note: "",
};

const CARD_UPLOAD_NOTE_PREFIX = "[카드내역 업로드]";
const CARD_UPLOAD_CATEGORY_MEMORY_KEY = "ledger-card-upload-category-memory";

export default function Ledger() {
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<LedgerEntry | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(currentYear);
  const [rowFilter, setRowFilter] = useState<"all" | "manual" | "auto">("all");
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadRows, setUploadRows] = useState<CardUploadRow[]>([]);
  const [uploadFileName, setUploadFileName] = useState("");
  const [uploadDefaultCardId, setUploadDefaultCardId] = useState<number | null>(null);
  const [isParsingUpload, setIsParsingUpload] = useState(false);
  const [isSavingUpload, setIsSavingUpload] = useState(false);

  const utils = trpc.useUtils();
  const { data: entries = [], isLoading } = trpc.ledger.list.useQuery({ year, month });
  const { data: summary = [] } = trpc.ledger.monthSummary.useQuery({ year, month });
  const { data: subscriptions = [] } = trpc.subscription.list.useQuery();
  const { data: fixedExpenses = [] } = trpc.fixedExpense.list.useQuery();
  const { data: installmentList = [] } = trpc.installment.list.useQuery();
  const { data: loanList = [] } = trpc.loan.list.useQuery();
  const { data: cardList = [] } = trpc.card.list.useQuery();
  const { data: categoryList = [] } = trpc.categories.list.useQuery(undefined, {
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const createMutation = trpc.ledger.create.useMutation({
    onSuccess: () => { utils.ledger.list.invalidate(); utils.ledger.monthSummary.invalidate(); toast.success("항목이 추가되었습니다"); setDialogOpen(false); },
    onError: () => toast.error("추가 실패"),
  });
  const uploadCreateMutation = trpc.ledger.create.useMutation();
  const updateMutation = trpc.ledger.update.useMutation({
    onSuccess: () => { utils.ledger.list.invalidate(); utils.ledger.monthSummary.invalidate(); toast.success("수정되었습니다"); setDialogOpen(false); },
    onError: () => toast.error("수정 실패"),
  });
  const deleteMutation = trpc.ledger.delete.useMutation({
    onSuccess: () => { utils.ledger.list.invalidate(); utils.ledger.monthSummary.invalidate(); toast.success("삭제되었습니다"); },
    onError: () => toast.error("삭제 실패"),
  });

  const summaryMap = useMemo(() => {
    const m: Record<string, number> = {};
    summary.forEach((s) => { m[s.mainCategory] = Number(s.total); });
    return m;
  }, [summary]);

  const income = Array.from(INCOME_MAIN_CATEGORIES).reduce((sum, name) => sum + (summaryMap[name] ?? 0), 0);
  const fixedExp = summaryMap["고정지출"] ?? 0;
  const varExp = summaryMap["변동지출"] ?? 0;
  const businessExp = summaryMap["사업지출"] ?? 0;
  const savings = summaryMap["저축/투자"] ?? 0;

  // 해당 월 구독결제 가상 행 (날짜 = 결제일 기준 해당 월 일자)
  const subscriptionRows = useMemo(() => {
    return subscriptions
      .map(sub => {
        const s = sub as {
          id: number;
          serviceName: string;
          price: number;
          billingCycle: string;
          sharedCount?: number;
          billingDay?: number | null;
          startDate?: string | null;
          paymentMethod?: string | null;
          note?: string | null;
          isPaused?: boolean | null;
          pausedFrom?: string | null;
        };
        const cost = ledgerSubCostForMonth(year, month, s);
        if (cost === 0) return null;
        const displayDate = subscriptionLedgerDate(year, month, s.billingCycle, s.billingDay, s.startDate);
        return { id: s.id, serviceName: s.serviceName, cost, billingCycle: s.billingCycle, paymentMethod: s.paymentMethod ?? null, note: s.note ?? null, displayDate };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
  }, [subscriptions, month, year]);

  const fixedExpenseRows = useMemo(() => {
    const monthKey = `${year}-${String(month).padStart(2, "0")}`;
    return (fixedExpenses as FixedExpenseRow[])
      .filter(expense => !expense.startDate || expense.startDate.slice(0, 7) <= monthKey)
      .filter(expense => !expense.expiryDate || expense.expiryDate.slice(0, 7) >= monthKey)
      .filter(expense => (expense.monthlyAmount ?? 0) > 0)
      .map(expense => {
        const day = Math.min(Math.max(expense.paymentDay ?? 1, 1), 28);
        return {
          ...expense,
          displayDate: `${monthKey}-${String(day).padStart(2, "0")}`,
          amount: expense.monthlyAmount,
        };
      });
  }, [fixedExpenses, year, month]);

  const installmentRows = useMemo(() => {
    const monthKey = `${year}-${String(month).padStart(2, "0")}`;
    return (installmentList as {
      id: number; name: string; cardId: number | null; totalAmount: number; months: number;
      startDate: string; endDate: string; isInterestFree: boolean; interestRate: string | null;
      categoryId: number | null; subCategoryId: number | null;
      earlyRepaymentAmount: number | null; earlyRepaymentDate: string | null;
    }[]).filter(inst => instIsActiveInMonth(inst, year, month))
      .map(inst => {
        const card = (cardList as { id: number; cardCompany: string; cardName: string | null; paymentDate: string | null }[])
          .find(c => c.id === inst.cardId);
        const paymentDay = card?.paymentDate ? parseInt(card.paymentDate.replace(/[^0-9]/g, "")) || 15 : 15;
        const displayDate = `${monthKey}-${String(Math.min(paymentDay, 28)).padStart(2, "0")}`;
        const amount = instMonthlyPayment(inst.totalAmount, inst.months, inst.isInterestFree, inst.interestRate);
        const cardLabel = card ? `${card.cardCompany}${card.cardName ? ` ${card.cardName}` : ""}` : "";
        const cat = categoryList.find(c => c.id === inst.categoryId);
        const categoryName = cat?.name ?? null;
        const subCategoryName = cat?.subCategories.find(s => s.id === inst.subCategoryId)?.name ?? null;
        return { id: inst.id, name: inst.name, amount, cardLabel, displayDate, categoryName, subCategoryName };
      });
  }, [installmentList, cardList, categoryList, year, month]);

  const loanRows = useMemo(() => {
    const monthKey = `${year}-${String(month).padStart(2, "0")}`;
    return (loanList as LoanRow[])
      .filter(loan => loanAppliesToMonth(loan, year, month))
      .map(loan => {
        const day = Math.min(Math.max(loan.paymentDay ?? 1, 1), 28);
        return {
          ...loan,
          displayDate: `${monthKey}-${String(day).padStart(2, "0")}`,
          amount: loan.monthlyPayment,
        };
      });
  }, [loanList, year, month]);

  const sortedTableRows = useMemo(() => {
    type EntryRow = { kind: "entry"; sortDate: string; entry: LedgerEntry };
    type SubRow = { kind: "sub"; sortDate: string; sub: (typeof subscriptionRows)[number] };
    type FixedRow = { kind: "fixed"; sortDate: string; fixed: (typeof fixedExpenseRows)[number] };
    type InstRow = { kind: "installment"; sortDate: string; inst: (typeof installmentRows)[number] };
    type LoanTableRow = { kind: "loan"; sortDate: string; loan: (typeof loanRows)[number] };
    const entryRows: EntryRow[] = entries.map((entry) => {
      const d = String(entry.entryDate).split("T")[0];
      return { kind: "entry", sortDate: d, entry: entry as LedgerEntry };
    });
    const subRows: SubRow[] = subscriptionRows.map((sub) => ({ kind: "sub", sortDate: sub.displayDate, sub }));
    const fixedRows: FixedRow[] = fixedExpenseRows.map((fixed) => ({ kind: "fixed", sortDate: fixed.displayDate, fixed }));
    const instRows: InstRow[] = installmentRows.map((inst) => ({ kind: "installment", sortDate: inst.displayDate, inst }));
    const loanTableRows: LoanTableRow[] = loanRows.map((loan) => ({ kind: "loan", sortDate: loan.displayDate, loan }));
    return [...entryRows, ...fixedRows, ...subRows, ...instRows, ...loanTableRows].sort((a, b) => {
      const cmp = a.sortDate.localeCompare(b.sortDate);
      if (cmp !== 0) return cmp;
      if (a.kind === "entry" && b.kind === "entry") return a.entry.id - b.entry.id;
      if (a.kind === "sub" && b.kind === "sub") return a.sub.id - b.sub.id;
      if (a.kind === "fixed" && b.kind === "fixed") return a.fixed.id - b.fixed.id;
      if (a.kind === "installment" && b.kind === "installment") return a.inst.id - b.inst.id;
      if (a.kind === "loan" && b.kind === "loan") return a.loan.id - b.loan.id;
      return a.kind === "entry" ? -1 : 1;
    });
  }, [entries, fixedExpenseRows, subscriptionRows, installmentRows, loanRows]);

  const visibleTableRows = useMemo(() => {
    if (rowFilter === "manual") return sortedTableRows.filter(row => row.kind === "entry");
    if (rowFilter === "auto") return sortedTableRows.filter(row => row.kind !== "entry");
    return sortedTableRows;
  }, [rowFilter, sortedTableRows]);

  const totalSubCost = subscriptionRows.reduce((sum, r) => sum + r.cost, 0);
  const totalManagedFixedCost = fixedExpenseRows.reduce((sum, r) => sum + r.amount, 0);
  const totalInstallmentCost = installmentRows.reduce((sum, r) => sum + r.amount, 0);
  const totalLoanCost = loanRows.reduce((sum, r) => sum + r.amount, 0);
  const fixedExpWithSubscriptions = Math.abs(fixedExp) + totalManagedFixedCost + totalSubCost;
  const totalExp = Math.abs(fixedExp) + totalManagedFixedCost + Math.abs(varExp) + Math.abs(businessExp) + Math.abs(savings) + totalSubCost + totalInstallmentCost + totalLoanCost;
  const balance = income - totalExp;


  // 항목별 비율 파이 차트 데이터
  const expensePieData = useMemo(() => {
    const map: Record<string, number> = {};

    // 실제 가계부 항목 (소득 제외)
    for (const row of visibleTableRows) {
      if (row.kind === "entry") {
        const e = row.entry;
        if (isIncomeCategory(e.mainCategory)) continue;
        const key = e.subCategory?.trim() || e.mainCategory;
        map[key] = (map[key] ?? 0) + Math.abs(e.amount);
      } else if (row.kind === "fixed") {
        const key = row.fixed.subCategory?.trim() || row.fixed.description?.trim() || row.fixed.mainCategory;
        map[key] = (map[key] ?? 0) + row.fixed.amount;
      } else if (row.kind === "sub") {
        map["구독서비스"] = (map["구독서비스"] ?? 0) + row.sub.cost;
      } else if (row.kind === "installment") {
        map["할부결제"] = (map["할부결제"] ?? 0) + row.inst.amount;
      } else if (row.kind === "loan") {
        map["대출상환"] = (map["대출상환"] ?? 0) + row.loan.amount;
      }
    }

    const sorted = Object.entries(map)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    // 8개 초과 시 나머지는 기타로 합산
    if (sorted.length > 8) {
      const top = sorted.slice(0, 7);
      const etcValue = sorted.slice(7).reduce((s, d) => s + d.value, 0);
      return [...top, { name: "기타", value: etcValue }];
    }
    return sorted;
  }, [visibleTableRows]);

  const pieTotal = expensePieData.reduce((s, d) => s + d.value, 0);

  const getFilteredCategories = (entryType: "expense" | "income") =>
    categoryList.filter(c => entryType === "income" ? (c.type === "income" || c.type === "both") : (c.type === "expense" || c.type === "both"));

  const getSubCategories = (main: string) => {
    const cat = categoryList.find((c) => c.name === main);
    return cat ? cat.subCategories.map((s) => s.name) : [];
  };

  const defaultExpenseCategory = useMemo(() => {
    const variable = categoryList.find((c) => c.name === "변동지출");
    const firstExpense = categoryList.find((c) => c.type === "expense" || c.type === "both");
    return variable?.name ?? firstExpense?.name ?? "변동지출";
  }, [categoryList]);

  const defaultExpenseSubCategory = useMemo(() => {
    const cat = categoryList.find((c) => c.name === defaultExpenseCategory);
    return cat?.subCategories[0]?.name ?? "";
  }, [categoryList, defaultExpenseCategory]);

  const findExpenseCategoryBySub = (subCategory: string) => {
    const wanted = merchantKey(subCategory);
    const found = categoryList.find((cat) =>
      (cat.type === "expense" || cat.type === "both")
      && cat.subCategories.some((sub) => {
        const current = merchantKey(sub.name);
        return current === wanted || current.includes(wanted) || wanted.includes(current);
      })
    );
    const foundSub = found?.subCategories.find((sub) => {
      const current = merchantKey(sub.name);
      return current === wanted || current.includes(wanted) || wanted.includes(current);
    });
    return found && foundSub ? { mainCategory: found.name, subCategory: foundSub.name } : null;
  };

  const recommendCategory = (merchant: string) => {
    const key = merchantKey(merchant);
    const learned = readCategoryMemory()[key];
    if (learned) return { ...learned, source: "learned" as const };
    const rule = CATEGORY_RULES.find((item) => item.words.some((word) => key.includes(merchantKey(word))));
    const matched = rule ? findExpenseCategoryBySub(rule.subCategory) : null;
    if (matched) return { ...matched, source: "rule" as const };
    return { mainCategory: defaultExpenseCategory, subCategory: defaultExpenseSubCategory, source: "default" as const };
  };

  const managedCardOptions = useMemo(
    () => (cardList as { id: number; cardCompany: string; cardName: string | null }[])
      .map((card) => ({
        id: card.id,
        label: `${card.cardCompany}${card.cardName ? ` ${card.cardName}` : ""}`,
      })),
    [cardList],
  );

  const matchManagedCard = (uploadedCardName: string) => {
    const key = merchantKey(uploadedCardName);
    if (!key) return null;
    const card = managedCardOptions.find((item) => {
      const label = merchantKey(item.label);
      return label.includes(key) || key.includes(label);
    });
    return card ?? null;
  };

  const isDuplicateUploadRow = (row: Pick<CardUploadRow, "entryDate" | "merchant" | "amount" | "cardName">) => {
    const normalizedMerchant = row.merchant.trim();
    const normalizedCard = row.cardName.trim();
    return (entries as LedgerEntry[]).some((entry) => {
      const entryDate = String(entry.entryDate).split("T")[0];
      const note = entry.note ?? "";
      return entryDate === row.entryDate
        && Math.abs(entry.amount) === row.amount
        && (entry.description ?? "").trim() === normalizedMerchant
        && (!normalizedCard || note.includes(normalizedCard))
        && note.startsWith(CARD_UPLOAD_NOTE_PREFIX);
    });
  };

  const parseCardUploadFile = async (file: File) => {
    setIsParsingUpload(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      const parsed = rawRows.map((raw, index) => {
        const entryDate = parseExcelDate(findValue(raw, ["이용일", "사용일", "승인일", "거래일", "일자", "날짜"]));
        const merchant = String(findValue(raw, ["가맹점명", "가맹점", "사용처", "이용가맹점", "내용", "적요"]) ?? "").trim();
        const cardName = String(findValue(raw, ["카드명", "카드", "카드번호", "결제수단"]) ?? "").trim();
        const status = String(findValue(raw, ["승인상태", "상태", "구분", "취소여부"]) ?? "").trim();
        const installment = String(findValue(raw, ["할부개월", "할부", "개월"]) ?? "").trim();
        const signedAmount = parseAmount(findValue(raw, ["이용금액", "사용금액", "승인금액", "금액", "합계"]));
        const amount = Math.abs(signedAmount);
        const isNegativeAmount = signedAmount < 0;
        const isCancel = isNegativeAmount || /취소|환불|매출취소/i.test(status) || /취소|환불/i.test(merchant);
        const recommended = recommendCategory(merchant);
        const matchedCard = uploadDefaultCardId
          ? managedCardOptions.find((card) => card.id === uploadDefaultCardId) ?? null
          : matchManagedCard(cardName);
        const row: CardUploadRow = {
          id: `${index}-${entryDate}-${merchant}-${amount}`,
          selected: !!entryDate && !!merchant && amount > 0 && !isCancel,
          duplicate: false,
          entryDate,
          cardName,
          merchant,
          amount,
          signedAmount,
          entryType: isNegativeAmount ? "income" : "expense",
          status,
          installment,
          mainCategory: recommended.mainCategory,
          subCategory: recommended.subCategory,
          categorySource: recommended.source,
          selectedCardId: matchedCard?.id ?? null,
          matchedCardName: matchedCard?.label ?? "",
          note: [CARD_UPLOAD_NOTE_PREFIX, matchedCard?.label || cardName, installment ? `할부 ${installment}` : "", isNegativeAmount ? "마이너스 금액" : "", status].filter(Boolean).join(" · "),
          raw,
        };
        row.duplicate = isDuplicateUploadRow(row);
        if (row.duplicate) row.selected = false;
        return row;
      }).filter((row) => row.entryDate || row.merchant || row.amount > 0);

      setUploadRows(parsed);
      if (!uploadDefaultCardId) {
        const firstCardId = parsed.find((row) => row.selectedCardId)?.selectedCardId ?? null;
        setUploadDefaultCardId(firstCardId);
      }
      setUploadFileName(file.name);
      toast.success(`${parsed.length}건을 읽었습니다`);
    } catch {
      toast.error("파일을 읽지 못했습니다");
    } finally {
      setIsParsingUpload(false);
    }
  };

  const saveUploadedRows = async () => {
    const targets = uploadRows.filter((row) => row.selected && row.entryDate && row.merchant && row.amount > 0);
    if (targets.length === 0) {
      toast.error("저장할 행을 선택해주세요");
      return;
    }
    setIsSavingUpload(true);
    try {
      for (const row of targets) {
        const date = new Date(row.entryDate);
        const selectedCardLabel = managedCardOptions.find((card) => card.id === row.selectedCardId)?.label;
        await uploadCreateMutation.mutateAsync({
          entryDate: row.entryDate,
          year: date.getFullYear(),
          month: date.getMonth() + 1,
          mainCategory: row.mainCategory,
          subCategory: row.subCategory || undefined,
          description: row.merchant,
          amount: row.entryType === "income" ? Math.abs(row.amount) : -Math.abs(row.amount),
          note: [CARD_UPLOAD_NOTE_PREFIX, selectedCardLabel || row.cardName, row.installment ? `할부 ${row.installment}` : "", row.entryType === "income" ? "마이너스 금액" : "", row.status].filter(Boolean).join(" · "),
        });
      }
      const memory = readCategoryMemory();
      for (const row of targets) {
        if (row.merchant && row.mainCategory) {
          memory[merchantKey(row.merchant)] = { mainCategory: row.mainCategory, subCategory: row.subCategory };
        }
      }
      writeCategoryMemory(memory);
      utils.ledger.list.invalidate();
      utils.ledger.monthSummary.invalidate();
      toast.success(`${targets.length}건을 가계부에 반영했습니다`);
      setUploadDialogOpen(false);
      setUploadRows([]);
      setUploadFileName("");
    } catch {
      toast.error("저장 중 오류가 발생했습니다");
    } finally {
      setIsSavingUpload(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, year, month, entryDate: `${year}-${String(month).padStart(2, "0")}-01` });
    setDialogOpen(true);
  };

  const openEdit = (entry: LedgerEntry) => {
    setEditing(entry);
    const d = entry.entryDate instanceof Date ? entry.entryDate.toISOString().split("T")[0] : String(entry.entryDate).split("T")[0];
    const cat = categoryList.find(c => c.name === entry.mainCategory);
    const entryType = cat?.type === "income" ? "income" : "expense";
    setForm({
      entryType,
      entryDate: d,
      year: entry.year,
      month: entry.month,
      mainCategory: entry.mainCategory,
      subCategory: entry.subCategory ?? "",
      description: entry.description ?? "",
      amount: Math.abs(entry.amount ?? 0),
      note: entry.note ?? "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    const data = {
      entryDate: form.entryDate,
      year: form.year,
      month: form.month,
      mainCategory: form.mainCategory,
      subCategory: form.subCategory || undefined,
      description: form.description || undefined,
      amount: form.entryType === "income" ? Math.abs(form.amount) : -Math.abs(form.amount),
      note: form.note || undefined,
    };
    if (editing) {
      updateMutation.mutate({ id: editing.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  };

  const ledgerTypeColor: Record<string, string> = {
    "수입": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    "지출": "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    "저축": "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  };

  const getLedgerType = (mainCategory: string, amount: number) => {
    if (mainCategory === "저축/투자") return "저축";
    if (isIncomeCategory(mainCategory) || amount > 0) return "수입";
    return "지출";
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">월별 가계부</h1>
          <p className="text-sm text-muted-foreground mt-0.5">수입·지출·저축 내역 관리</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setUploadDialogOpen(true)} size="sm" variant="outline" className="gap-1.5">
            <Upload className="w-4 h-4" /> 카드내역 업로드
          </Button>
          <Button onClick={openCreate} size="sm" className="gap-1.5">
            <Plus className="w-4 h-4" /> 항목 추가
          </Button>
        </div>
      </div>

      {/* Month Navigator */}
      <div className="flex items-center gap-3">
        <button onClick={prevMonth} className="p-1.5 rounded-lg border border-border hover:bg-muted transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <Popover open={pickerOpen} onOpenChange={(open) => { setPickerOpen(open); if (open) setPickerYear(year); }}>
          <PopoverTrigger asChild>
            <button className="text-base font-semibold w-28 text-center px-2 py-1 rounded-lg hover:bg-muted transition-colors">
              {year}년 {MONTH_NAMES[month - 1]}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-3" align="center">
            <div className="flex items-center justify-between mb-3">
              <button onClick={() => setPickerYear(y => y - 1)} className="p-1 rounded hover:bg-muted transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm font-semibold">{pickerYear}년</span>
              <button onClick={() => setPickerYear(y => y + 1)} className="p-1 rounded hover:bg-muted transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-4 gap-1">
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
                const isSelected = pickerYear === year && m === month;
                return (
                  <button
                    key={m}
                    onClick={() => { setYear(pickerYear); setMonth(m); setPickerOpen(false); }}
                    className={`py-1.5 rounded-md text-sm font-medium transition-colors ${
                      isSelected ? "bg-primary text-primary-foreground" : "hover:bg-muted text-foreground"
                    }`}
                  >
                    {m}월
                  </button>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
        <button onClick={nextMonth} className="p-1.5 rounded-lg border border-border hover:bg-muted transition-colors">
          <ChevronRight className="w-4 h-4" />
        </button>
        {(year !== currentYear || month !== currentMonth) && (
          <button
            onClick={() => { setYear(currentYear); setMonth(currentMonth); }}
            className="text-xs font-medium px-2.5 py-1 rounded-lg border border-border hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          >
            이번 달
          </button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* 소득 */}
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">소득</p>
          <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">₩{formatAmount(income)}</p>
        </div>
        {/* 지출 */}
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">지출</p>
          <p className="text-xl font-bold text-red-500 dark:text-red-400">₩{formatAmount(totalExp)}</p>
          <div className="mt-2 pt-2 border-t border-border space-y-0.5">
            {[
              { label: "고정지출", value: fixedExpWithSubscriptions },
              { label: "변동지출", value: varExp },
              { label: "사업지출", value: businessExp },
              { label: "할부결제", value: totalInstallmentCost },
              { label: "대출상환", value: totalLoanCost },
              { label: "저축/투자", value: savings },
            ].filter(item => Math.abs(item.value) > 0).map(item => (
              <div key={item.label} className="flex justify-between text-xs text-muted-foreground">
                <span>{item.label}</span>
                <span>₩{formatAmount(Math.abs(item.value))}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Balance */}
      <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">잔액 (소득 - 지출/저축)</span>
        <span className={`text-xl font-bold ${balance >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
          ₩{formatAmount(balance)}
        </span>
      </div>

      {/* 항목별 비율 차트 */}
      {expensePieData.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-semibold mb-1">항목별 지출 비율</h2>
          <p className="text-xs text-muted-foreground mb-4">가계부 · 고정지출 · 구독 · 할부 · 대출 합산</p>
          <div className="flex flex-col md:flex-row gap-4 items-center">
            <div className="w-full md:w-64 flex-shrink-0">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={expensePieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                    {expensePieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip
                    formatter={(v: number) => [`₩${formatAmount(v)}`, ""]}
                    contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "12px" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 w-full space-y-2">
              {expensePieData.map((item, i) => {
                const pct = pieTotal > 0 ? (item.value / pieTotal) * 100 : 0;
                return (
                  <div key={item.name} className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="text-xs text-foreground flex-1 truncate">{item.name}</span>
                    <span className="text-xs text-muted-foreground w-10 text-right">{pct.toFixed(1)}%</span>
                    <span className="text-xs font-semibold w-24 text-right">₩{formatAmount(item.value)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold">월별 내역</h2>
            <p className="text-xs text-muted-foreground">
              자동항목: 고정지출 · 구독 · 할부 · 대출
            </p>
          </div>
          <div className="inline-flex rounded-full border border-border bg-background p-1 self-start sm:self-auto">
            {[
              { key: "all", label: `전체 ${sortedTableRows.length}` },
              { key: "manual", label: `수동 ${sortedTableRows.filter(row => row.kind === "entry").length}` },
              { key: "auto", label: `자동 ${sortedTableRows.filter(row => row.kind !== "entry").length}` },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setRowFilter(item.key as "all" | "manual" | "auto")}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  rowFilter === item.key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-muted/50">
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">날짜</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">구분</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">대분류</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">중분류</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">내용</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">금액</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">비고</th>
              <th className="px-4 py-3 w-20"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} className="text-center py-10 text-muted-foreground text-sm">로딩 중...</td></tr>
            ) : visibleTableRows.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-10 text-muted-foreground text-sm">이번 달 내역이 없습니다</td></tr>
            ) : (
              <>
                {visibleTableRows.map((row) => {
                  if (row.kind === "entry") {
                    const entry = row.entry;
                    const d = String(entry.entryDate).split("T")[0];
                    const ledgerType = getLedgerType(entry.mainCategory, entry.amount);
                    return (
                      <tr key={`e-${entry.id}`} className="border-t border-border hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">{d}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${ledgerTypeColor[ledgerType]}`}>
                            {ledgerType}
                          </span>
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <span className="text-sm text-foreground">{entry.mainCategory}</span>
                        </td>
                        <td className="px-4 py-3 text-sm hidden md:table-cell">{entry.subCategory ?? "-"}</td>
                        <td className="px-4 py-3 text-sm">{entry.description ?? "-"}</td>
                        <td className={`px-4 py-3 text-sm text-right font-medium whitespace-nowrap ${ledgerAmountColor[ledgerType]}`}>
                          {formatSignedWon(entry.amount)}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground hidden lg:table-cell">{entry.note ?? "-"}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 justify-end">
                            <button onClick={() => openEdit(entry)} className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => deleteMutation.mutate({ id: entry.id })} className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-muted-foreground hover:text-red-500">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }
                  if (row.kind === "fixed") {
                    return (
                      <tr key={`f-${row.fixed.id}`} className="border-t border-border bg-blue-50/40 dark:bg-blue-900/10">
                        <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">{row.fixed.displayDate}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${ledgerTypeColor["지출"]}`}>지출</span>
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <span className="text-sm text-foreground">{row.fixed.mainCategory}</span>
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground hidden md:table-cell">{row.fixed.subCategory ?? "-"}</td>
                        <td className="px-4 py-3 text-sm">{row.fixed.description ?? "-"}</td>
                        <td className="px-4 py-3 text-sm text-right font-medium text-red-600 dark:text-red-400 whitespace-nowrap">-₩{formatAmount(row.fixed.amount)}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground hidden lg:table-cell">{row.fixed.paymentAccount ?? row.fixed.note ?? "-"}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground text-center">—</td>
                      </tr>
                    );
                  }
                  if (row.kind === "sub") return (
                    <tr key={`sub-${row.sub.id}`} className="border-t border-border bg-violet-50/40 dark:bg-violet-900/10">
                      <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">{row.sub.displayDate}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${ledgerTypeColor["지출"]}`}>지출</span>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className="text-sm text-foreground">고정지출</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground hidden md:table-cell">구독서비스</td>
                      <td className="px-4 py-3 text-sm">{row.sub.serviceName}</td>
                      <td className="px-4 py-3 text-sm text-right font-medium text-red-600 dark:text-red-400 whitespace-nowrap">-₩{formatAmount(row.sub.cost)}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground hidden lg:table-cell">{row.sub.billingCycle}{row.sub.paymentMethod ? ` · ${row.sub.paymentMethod}` : ""}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground text-center">—</td>
                    </tr>
                  );
                  if (row.kind === "loan") return (
                    <tr key={`loan-${row.loan.id}`} className="border-t border-border bg-sky-50/40 dark:bg-sky-900/10">
                      <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">{row.loan.displayDate}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${ledgerTypeColor["지출"]}`}>지출</span>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className="text-sm text-foreground">고정지출</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground hidden md:table-cell">대출상환</td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex items-center gap-1.5">
                          <span>{row.loan.name}</span>
                          <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-400 shrink-0">대출</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-medium text-red-600 dark:text-red-400 whitespace-nowrap">-₩{formatAmount(row.loan.amount)}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground hidden lg:table-cell">
                        {[row.loan.loanType, row.loan.repaymentType, row.loan.lender].filter(Boolean).join(" · ") || "-"}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground text-center">—</td>
                    </tr>
                  );
                  return (
                    <tr key={`inst-${row.inst.id}`} className="border-t border-border bg-amber-50/40 dark:bg-amber-900/10">
                      <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">{row.inst.displayDate}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${ledgerTypeColor["지출"]}`}>지출</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground hidden sm:table-cell">{row.inst.categoryName ?? "-"}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground hidden md:table-cell">{row.inst.subCategoryName ?? "-"}</td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex items-center gap-1.5">
                          <span>{row.inst.name}</span>
                          <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 shrink-0">할부</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-medium text-red-600 dark:text-red-400 whitespace-nowrap">-₩{formatAmount(row.inst.amount)}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground hidden lg:table-cell">{row.inst.cardLabel || "-"}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground text-center">—</td>
                    </tr>
                  );
                })}
              </>
            )}
          </tbody>
        </table>
        </div>
      </div>

      {/* Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent className="w-[calc(100vw-24px)] !max-w-[calc(100vw-24px)] xl:!max-w-[1600px] max-h-[90vh] overflow-y-auto p-5">
          <DialogHeader>
            <DialogTitle>카드 사용내역 업로드</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-dashed border-border p-4">
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div>
                  <Label className="text-sm font-medium">엑셀/CSV 파일</Label>
                  <Input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="mt-2"
                    disabled={isParsingUpload || isSavingUpload}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void parseCardUploadFile(file);
                      event.target.value = "";
                    }}
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium">전체 적용 카드</Label>
                  <Select
                    value={uploadDefaultCardId ? String(uploadDefaultCardId) : "none"}
                    onValueChange={(value) => {
                      const selectedCardId = value === "none" ? null : Number(value);
                      const selectedCard = managedCardOptions.find((card) => card.id === selectedCardId);
                      setUploadDefaultCardId(selectedCardId);
                      setUploadRows((rows) => rows.map((row) => ({
                        ...row,
                        selectedCardId,
                        matchedCardName: selectedCard?.label ?? "",
                      })));
                    }}
                  >
                    <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">카드 미지정</SelectItem>
                      {managedCardOptions.map((card) => (
                        <SelectItem key={card.id} value={String(card.id)}>{card.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {(isParsingUpload || isSavingUpload) && (
                <div className="mt-3 flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{isParsingUpload ? "파일을 읽는 중입니다..." : "선택한 항목을 저장하는 중입니다..."}</span>
                </div>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                이용일, 가맹점명, 이용금액 컬럼을 자동으로 찾습니다. 같은 카드 내역이면 상단 카드만 선택해 전체 행에 적용하세요.
              </p>
              {uploadFileName && <p className="mt-1 text-xs font-medium text-foreground">{uploadFileName}</p>}
            </div>

            {uploadRows.length > 0 && (
              <>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-muted-foreground">
                    총 {uploadRows.length}건 · 선택 {uploadRows.filter((row) => row.selected).length}건 · 중복 후보 {uploadRows.filter((row) => row.duplicate).length}건
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setUploadRows((rows) => rows.map((row) => ({ ...row, selected: !row.duplicate && row.entryDate !== "" && row.merchant !== "" && row.amount > 0 && row.entryType === "expense" })))}
                    >
                      유효행 전체 선택
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setUploadRows((rows) => rows.map((row) => ({ ...row, selected: false })))}>
                      전체 해제
                    </Button>
                  </div>
                </div>
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="min-w-[1180px] w-full table-fixed text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="w-14 px-3 py-2 text-left text-xs font-semibold text-muted-foreground">선택</th>
                        <th className="w-28 px-3 py-2 text-left text-xs font-semibold text-muted-foreground">날짜</th>
                        <th className="w-64 px-3 py-2 text-left text-xs font-semibold text-muted-foreground">가맹점</th>
                        <th className="w-32 px-3 py-2 text-right text-xs font-semibold text-muted-foreground">금액</th>
                        <th className="w-56 px-3 py-2 text-left text-xs font-semibold text-muted-foreground">카드</th>
                        <th className="w-[400px] px-3 py-2 text-left text-xs font-semibold text-muted-foreground">카테고리</th>
                        <th className="w-36 px-3 py-2 text-left text-xs font-semibold text-muted-foreground">상태</th>
                      </tr>
                    </thead>
                    <tbody>
                      {uploadRows.map((row) => (
                        <tr key={row.id} className="border-t border-border">
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={row.selected}
                              onChange={(event) => setUploadRows((rows) => rows.map((item) => item.id === row.id ? { ...item, selected: event.target.checked } : item))}
                            />
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">{row.entryDate || "-"}</td>
                          <td className="px-3 py-2">
                            <div className="truncate" title={row.merchant}>{row.merchant || "-"}</div>
                          </td>
                          <td className={`px-3 py-2 text-right whitespace-nowrap font-medium ${row.entryType === "income" ? "text-blue-600" : "text-red-600"}`}>
                            {row.entryType === "income" ? "+" : "-"}₩{formatAmount(row.amount)}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            <Select
                              value={row.selectedCardId ? String(row.selectedCardId) : "none"}
                              onValueChange={(value) => setUploadRows((rows) => rows.map((item) => {
                                if (item.id !== row.id) return item;
                                const selectedCardId = value === "none" ? null : Number(value);
                                const selectedCard = managedCardOptions.find((card) => card.id === selectedCardId);
                                return { ...item, selectedCardId, matchedCardName: selectedCard?.label ?? "" };
                              }))}
                            >
                              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">카드 미지정</SelectItem>
                                {managedCardOptions.map((card) => (
                                  <SelectItem key={card.id} value={String(card.id)}>{card.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <div className="mt-1 truncate text-[11px] text-muted-foreground" title={row.cardName}>
                              원본 {row.cardName || "-"}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <div className="grid grid-cols-[1fr_1fr] gap-2">
                              <Select
                                value={row.mainCategory}
                                onValueChange={(value) => setUploadRows((rows) => rows.map((item) => {
                                  if (item.id !== row.id) return item;
                                  const nextSub = categoryList.find((cat) => cat.name === value)?.subCategories[0]?.name ?? "";
                                  return { ...item, mainCategory: value, subCategory: nextSub, categorySource: "learned" };
                                }))}
                              >
                                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {getFilteredCategories("expense").map((cat) => <SelectItem key={cat.name} value={cat.name}>{cat.name}</SelectItem>)}
                                </SelectContent>
                              </Select>
                              <Select
                                value={row.subCategory}
                                onValueChange={(value) => setUploadRows((rows) => rows.map((item) => item.id === row.id ? { ...item, subCategory: value, categorySource: "learned" } : item))}
                              >
                                <SelectTrigger className="h-8"><SelectValue placeholder="중분류" /></SelectTrigger>
                                <SelectContent>
                                  {getSubCategories(row.mainCategory).map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="mt-1 text-[11px] text-muted-foreground">
                              {row.categorySource === "learned" ? "기억된 분류" : row.categorySource === "rule" ? "자동 추천" : "기본값"}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            {row.duplicate ? (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">중복 후보</span>
                            ) : row.entryType === "income" ? (
                              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">환불 후보</span>
                            ) : row.status ? (
                              <span className="text-xs text-muted-foreground">{row.status}</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadDialogOpen(false)} disabled={isParsingUpload || isSavingUpload}>취소</Button>
            <Button onClick={saveUploadedRows} disabled={isParsingUpload || isSavingUpload || uploadRows.filter((row) => row.selected).length === 0}>
              {isSavingUpload && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {isSavingUpload ? "저장 중..." : "선택 항목 저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "항목 수정" : "항목 추가"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {/* 수입 / 지출 선택 */}
            <div className="grid grid-cols-2 gap-2">
              {(["expense", "income"] as const).map(type => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, entryType: type, mainCategory: "", subCategory: "" }))}
                  className={`py-2 rounded-lg text-sm font-medium border transition-colors ${
                    form.entryType === type
                      ? type === "income"
                        ? "bg-emerald-500 text-white border-emerald-500"
                        : "bg-red-500 text-white border-red-500"
                      : "bg-background text-muted-foreground border-border hover:bg-muted"
                  }`}
                >
                  {type === "income" ? "수입" : "지출"}
                </button>
              ))}
            </div>
            <div>
              <Label className="text-xs">날짜</Label>
              <Input type="date" value={form.entryDate} onChange={e => setForm(f => ({ ...f, entryDate: e.target.value, year: new Date(e.target.value).getFullYear(), month: new Date(e.target.value).getMonth() + 1 }))} className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">대분류</Label>
                <Select value={form.mainCategory} onValueChange={v => setForm(f => ({ ...f, mainCategory: v, subCategory: "" }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="선택" /></SelectTrigger>
                  <SelectContent>
                    {getFilteredCategories(form.entryType).map(c => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">중분류</Label>
                <Select value={form.subCategory} onValueChange={v => setForm(f => ({ ...f, subCategory: v }))} disabled={!form.mainCategory}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="선택" /></SelectTrigger>
                  <SelectContent>
                    {getSubCategories(form.mainCategory).map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">내용</Label>
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="내용 입력" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">금액 (원)</Label>
              <CurrencyInput value={form.amount} onChange={(v) => setForm(f => ({ ...f, amount: v }))} placeholder="0" suffix="원" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">비고</Label>
              <Input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="비고" className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>취소</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
              {editing ? "수정" : "추가"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
