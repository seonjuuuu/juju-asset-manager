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
  installmentMonths: number;
  installmentStatus: "none" | "registered" | "new";
  mainCategory: string;
  subCategory: string;
  categorySource: "learned" | "rule" | "default";
  selectedCardId: number | null;
  matchedCardName: string;
  note: string;
  userNote: string;
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
  // 배달
  { words: ["배달의민족", "배민", "요기요", "쿠팡이츠", "땡겨요", "위메프오", "배달통"], subCategory: "배달" },
  // 카페
  { words: ["스타벅스", "starbucks", "투썸플레이스", "이디야", "메가커피", "컴포즈", "빽다방", "할리스", "폴바셋", "탐앤탐스", "커피빈", "coffebean", "카페베네", "엔제리너스", "더벤티", "공차", "커피", "카페"], subCategory: "카페" },
  // 편의점
  { words: ["gs25", "cu편의점", "cu ", "세븐일레븐", "7eleven", "이마트24", "미니스톱", "씨스페이스"], subCategory: "편의점" },
  // 식비 (식당/음식점)
  { words: ["맥도날드", "버거킹", "롯데리아", "kfc", "맘스터치", "써브웨이", "서브웨이", "쉐이크쉑", "노브랜드버거", "맘스터치",
            "피자헛", "도미노", "파파존스", "bhc", "교촌", "bbq", "네네치킨", "굽네치킨", "처갓집",
            "김밥", "분식", "국밥", "마라탕", "초밥", "스시", "족발", "보쌈", "삼겹살", "고기집", "닭갈비",
            "떡볶이", "라멘", "라면", "우동", "파스타", "피자", "치킨", "도시락",
            "식당", "음식점", "한식", "중식", "일식", "양식", "뷔페", "정식"], subCategory: "식비" },
  // 마트/장보기
  { words: ["이마트", "홈플러스", "롯데마트", "코스트코", "costco", "하나로마트", "농협하나로", "킴스클럽", "메가마트",
            "마트", "슈퍼마켓", "슈퍼", "마켓컬리", "컬리", "오아시스", "SSG", "새벽배송"], subCategory: "마트" },
  // 온라인쇼핑
  { words: ["쿠팡", "11번가", "g마켓", "gmarket", "옥션", "auction", "위메프", "티몬", "인터파크", "롯데온", "신세계몰",
            "네이버쇼핑", "스마트스토어", "카카오쇼핑", "무신사", "에이블리", "지그재그", "브랜디", "오늘의집",
            "알리익스프레스", "알리", "테무", "아마존", "amazon"], subCategory: "쇼핑" },
  // 백화점/아울렛
  { words: ["롯데백화점", "현대백화점", "신세계백화점", "갤러리아", "AK플라자", "nc백화점", "롯데아울렛", "프리미엄아울렛"], subCategory: "쇼핑" },
  // 주유/차량
  { words: ["gs칼텍스", "sk에너지", "s-oil", "현대오일뱅크", "알뜰주유", "주유소", "주유"],                        subCategory: "주유" },
  { words: ["하이패스", "톨게이트", "한국도로공사", "ex", "고속도로"],                                              subCategory: "통행료" },
  { words: ["주차", "파킹", "카파킹", "스마트파킹"],                                                              subCategory: "주차비" },
  { words: ["카센터", "자동차", "오토바이", "차량정비", "타이어", "배터리", "엔진오일", "세차"],                      subCategory: "차량정비" },
  // 대중교통
  { words: ["카카오택시", "우버", "타다", "택시"],                                                                subCategory: "택시" },
  { words: ["코레일", "korail", "srt", "ktx", "ktx"],                                                          subCategory: "기차" },
  { words: ["대한항공", "아시아나", "제주항공", "진에어", "티웨이", "에어부산", "이스타", "피치", "peach", "항공"],     subCategory: "항공" },
  { words: ["버스", "지하철", "티머니", "캐시비", "시내버스", "광역버스", "광역급행"],                               subCategory: "교통" },
  // 의료/건강
  { words: ["약국", "드러그스토어"],                                                                           subCategory: "약국" },
  { words: ["올리브영", "랄라블라", "롭스", "세포라", "화장품", "스킨케어", "코스메틱"],                             subCategory: "미용/뷰티" },
  { words: ["병원", "의원", "클리닉", "내과", "외과", "정형외과", "피부과", "안과", "이비인후과", "정신건강", "소아과",
            "치과", "한의원", "한의", "dental", "orthodon"],                                                     subCategory: "병원" },
  // 미용/뷰티
  { words: ["미용실", "헤어", "hair", "네일", "nail", "속눈썹", "왁싱", "피부관리", "에스테틱", "뷰티"],            subCategory: "미용/뷰티" },
  { words: ["다이소", "무인양품", "이케아", "ikea"],                                                             subCategory: "생활용품" },
  // 운동/헬스
  { words: ["헬스장", "헬스클럽", "피트니스", "pt", "요가", "필라테스", "크로스핏", "수영장", "골프", "테니스", "배드민턴", "풋살"], subCategory: "운동" },
  // 교육
  { words: ["학원", "교습소", "과외", "튜터링", "클래스101", "클래스101", "유데미", "udemy", "코세라", "coursera",
            "yes24", "교보문고", "알라딘", "반디앤루니스", "영풍문고", "도서", "서점", "책"],                        subCategory: "교육" },
  // 문화/여가
  { words: ["cgv", "메가박스", "롯데시네마", "영화관", "영화"],                                                   subCategory: "영화" },
  { words: ["카카오게임즈", "넥슨", "엔씨소프트", "크래프톤", "구글플레이", "앱스토어", "게임"],                      subCategory: "게임" },
  { words: ["노래방", "pc방", "볼링", "탁구", "당구", "다트", "오락"],                                           subCategory: "여가" },
  // 여행/숙박
  { words: ["야놀자", "여기어때", "에어비앤비", "airbnb", "호텔", "모텔", "리조트", "펜션", "게스트하우스"],           subCategory: "숙박" },
  // 구독/디지털서비스
  { words: ["넷플릭스", "netflix", "왓챠", "웨이브", "wavve", "티빙", "tving", "시즌", "씨즌", "쿠팡플레이", "디즈니플러스", "disney",
            "유튜브프리미엄", "youtube", "spotify", "스포티파이", "멜론", "지니", "플로", "vibe", "바이브",
            "naver", "네이버플러스", "kakao", "카카오"],                                                          subCategory: "구독서비스" },
  { words: ["애플", "apple", "구글", "google", "마이크로소프트", "microsoft", "adobe", "어도비"],                  subCategory: "구독서비스" },
  // 공과금/통신
  { words: ["sk텔레콤", "kt", "lg유플러스", "알뜰폰", "통신비", "휴대폰요금"],                                     subCategory: "통신비" },
  { words: ["한국전력", "한전", "전기요금", "도시가스", "수도요금", "관리비", "아파트관리비"],                        subCategory: "공과금" },
  { words: ["인터넷", "와이파이", "sk브로드밴드", "kt인터넷", "lg인터넷"],                                         subCategory: "인터넷" },
  // 반려동물
  { words: ["동물병원", "펫", "pet", "반려동물", "사료", "petfood", "멍이", "냥이"],                               subCategory: "반려동물" },
  // 금융
  { words: ["보험", "삼성생명", "한화생명", "교보생명", "현대해상", "kb손해보험", "db손해보험", "메리츠"],             subCategory: "보험" },
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
const cleanCardName = (name: string) =>
  name.replace(/^(본인|가족)\s*/g, "").replace(/\s*\d[\d*-]{2,}\s*$/g, "").trim();
const CARD_UPLOAD_CATEGORY_MEMORY_KEY = "ledger-card-upload-category-memory";

export default function Ledger() {
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<LedgerEntry | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(currentYear);
  const [rowFilter, setRowFilter] = useState<"all" | "manual" | "auto">("all");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadRows, setUploadRows] = useState<CardUploadRow[]>([]);
  const [uploadFileName, setUploadFileName] = useState("");
  const [uploadDefaultCardId, setUploadDefaultCardId] = useState<number | null>(null);
  const [isParsingUpload, setIsParsingUpload] = useState(false);
  const [isSavingUpload, setIsSavingUpload] = useState(false);

  const utils = trpc.useUtils();
  const { data: entries = [], isLoading } = trpc.ledger.list.useQuery({ year, month, page, pageSize: PAGE_SIZE });
  const { data: totalCount = 0 } = trpc.ledger.count.useQuery({ year, month });
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
  const installmentCreateMutation = trpc.installment.create.useMutation();
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
      const DATE_KEYS = ["이용일", "사용일", "승인일", "거래일", "이용일자", "일자", "날짜"];
      const AMOUNT_KEYS = ["이용금액", "사용금액", "승인금액", "이용총액", "금액", "합계"];
      const MERCHANT_KEYS = ["가맹점명", "가맹점", "사용처", "이용가맹점", "내용", "적요"];
      const rowScore = (cells: unknown[]) => {
        const strs = cells.map((c) => normalizeHeader(String(c ?? "")));
        const hasDate = DATE_KEYS.some((c) => strs.some((s) => s.includes(normalizeHeader(c))));
        const hasAmount = AMOUNT_KEYS.some((c) => strs.some((s) => s.includes(normalizeHeader(c))));
        const hasMerchant = MERCHANT_KEYS.some((c) => strs.some((s) => s.includes(normalizeHeader(c))));
        return (hasDate ? 2 : 0) + (hasAmount ? 1 : 0) + (hasMerchant ? 1 : 0);
      };
      const parseSheetRows = (sheetName: string) => {
        const raw2d = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, defval: "" });
        // 실제 헤더 행 탐색 (상위 10행 내에서 날짜+금액 컬럼을 포함한 행)
        const headerRowIdx = raw2d.slice(0, 10).findIndex((row) => rowScore(row as unknown[]) >= 2);
        if (headerRowIdx === -1) {
          // fallback: 헤더 탐색 실패 시 기본 파싱
          return XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: "" });
        }
        const headers = (raw2d[headerRowIdx] as unknown[]).map((h) => String(h ?? "").trim());
        return (raw2d.slice(headerRowIdx + 1) as unknown[][])
          .filter((row) => row.some((c) => String(c ?? "").trim() !== ""))
          .map((row) => Object.fromEntries(headers.map((h, i) => [h, row[i] ?? ""])));
      };
      const allSheets = workbook.SheetNames.map((name) => ({ name, rows: parseSheetRows(name) }));
      const sheetScore = (rows: Record<string, unknown>[]) => {
        const keys = rows.length > 0 ? Object.keys(rows[0]).map((k) => normalizeHeader(k)) : [];
        const hasDate = DATE_KEYS.some((c) => keys.some((k) => k.includes(normalizeHeader(c))));
        const hasAmount = AMOUNT_KEYS.some((c) => keys.some((k) => k.includes(normalizeHeader(c))));
        return (hasDate ? 2 : 0) + (hasAmount ? 1 : 0);
      };
      const firstSheet = allSheets[0] ?? { rows: [] };
      const bestSheet = sheetScore(firstSheet.rows) >= 2
        ? firstSheet
        : (allSheets.find((s) => sheetScore(s.rows) >= 2) ?? firstSheet);
      const rawRows = bestSheet.rows;
      const parsed = rawRows.map((raw, index) => {
        const entryDate = parseExcelDate(findValue(raw, ["이용일", "사용일", "승인일", "거래일", "일자", "날짜"]));
        const merchant = String(findValue(raw, ["가맹점명", "가맹점", "사용처", "이용가맹점", "내용", "적요"]) ?? "").trim();
        const cardName = String(findValue(raw, ["카드명", "카드", "카드번호", "결제수단"]) ?? "").trim();
        const status = String(findValue(raw, ["승인상태", "상태", "구분", "취소여부"]) ?? "").trim();
        const installment = String(findValue(raw, ["할부개월", "할부", "개월"]) ?? "").trim();
        const installmentMonths = (() => { const n = parseInt(installment.replace(/[^\d]/g, ""), 10); return Number.isFinite(n) ? n : 0; })();
        const signedAmount = parseAmount(findValue(raw, ["이용금액", "사용금액", "승인금액", "이용총액", "금액", "합계"]));
        const amount = Math.abs(signedAmount);
        const isNegativeAmount = signedAmount < 0;
        const isCancel = isNegativeAmount || /취소|환불|매출취소/i.test(status) || /취소|환불/i.test(merchant);
        const recommended = recommendCategory(merchant);
        const matchedCard = uploadDefaultCardId
          ? managedCardOptions.find((card) => card.id === uploadDefaultCardId) ?? null
          : matchManagedCard(cardName);
        const isInstallmentRow = installmentMonths >= 2;
        const instAlreadyRegistered = isInstallmentRow && (installmentList as Array<{ name: string }>).some((inst) => {
          const a = merchantKey(inst.name ?? ""), b = merchantKey(merchant);
          return a === b || a.includes(b) || b.includes(a);
        });
        const installmentStatus: CardUploadRow["installmentStatus"] = !isInstallmentRow ? "none" : instAlreadyRegistered ? "registered" : "new";
        const row: CardUploadRow = {
          id: `${index}-${entryDate}-${merchant}-${amount}`,
          selected: !!entryDate && !!merchant && amount > 0 && !isCancel && installmentStatus !== "registered",
          duplicate: false,
          entryDate,
          cardName,
          merchant,
          amount,
          signedAmount,
          entryType: isNegativeAmount ? "income" : "expense",
          status,
          installment,
          installmentMonths,
          installmentStatus,
          mainCategory: recommended.mainCategory,
          subCategory: recommended.subCategory,
          categorySource: recommended.source,
          selectedCardId: matchedCard?.id ?? null,
          matchedCardName: matchedCard?.label ?? "",
          note: [CARD_UPLOAD_NOTE_PREFIX, matchedCard?.label || cleanCardName(cardName), isNegativeAmount ? "마이너스 금액" : ""].filter(Boolean).join(" "),
          userNote: "",
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
    let instCount = 0;
    try {
      for (const row of targets) {
        const date = new Date(row.entryDate);
        const selectedCardLabel = managedCardOptions.find((card) => card.id === row.selectedCardId)?.label;
        const noteStr = [CARD_UPLOAD_NOTE_PREFIX, selectedCardLabel || cleanCardName(row.cardName), row.entryType === "income" ? "마이너스 금액" : "", row.userNote].filter(Boolean).join(" ");
        if (row.installmentStatus === "new") {
          const startD = new Date(row.entryDate);
          const endD = new Date(startD);
          endD.setMonth(endD.getMonth() + row.installmentMonths - 1);
          const endDate = endD.toISOString().slice(0, 10);
          await installmentCreateMutation.mutateAsync({
            name: row.merchant,
            cardId: row.selectedCardId ?? null,
            totalAmount: row.amount,
            months: row.installmentMonths,
            startDate: row.entryDate,
            endDate,
            isInterestFree: true,
            note: noteStr,
          });
          instCount++;
        } else {
          await uploadCreateMutation.mutateAsync({
            entryDate: row.entryDate,
            year: date.getFullYear(),
            month: date.getMonth() + 1,
            mainCategory: row.mainCategory,
            subCategory: row.subCategory || undefined,
            description: row.merchant,
            amount: row.entryType === "income" ? Math.abs(row.amount) : -Math.abs(row.amount),
            note: noteStr,
          });
        }
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
      const ledgerCount = targets.length - instCount;
      const parts = [];
      if (ledgerCount > 0) parts.push(`가계부 ${ledgerCount}건`);
      if (instCount > 0) parts.push(`할부 ${instCount}건`);
      toast.success(`${parts.join(" · ")} 저장했습니다`);
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
    setPage(1);
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    setPage(1);
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
                    onClick={() => { setYear(pickerYear); setMonth(m); setPickerOpen(false); setPage(1); }}
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
        {/* 페이지네이션 */}
        {(() => {
          const totalPages = Math.ceil(totalCount / PAGE_SIZE);
          if (totalPages <= 1) return null;
          return (
            <div className="flex items-center justify-between border-t border-border px-4 py-3">
              <p className="text-xs text-muted-foreground">
                총 {totalCount.toLocaleString()}건 · {page} / {totalPages} 페이지
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(1)}
                  disabled={page === 1}
                  className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-30"
                >«</button>
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-30"
                >‹ 이전</button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
                  const p = start + i;
                  return (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`rounded px-2.5 py-1 text-xs font-medium ${p === page ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                    >{p}</button>
                  );
                })}
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-30"
                >다음 ›</button>
                <button
                  onClick={() => setPage(totalPages)}
                  disabled={page === totalPages}
                  className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-30"
                >»</button>
              </div>
            </div>
          );
        })()}
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
                  <table className="w-full text-sm" style={{ minWidth: "1440px" }}>
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="w-12 shrink-0 px-3 py-2 text-left text-xs font-semibold text-muted-foreground">선택</th>
                        <th className="w-28 shrink-0 px-3 py-2 text-left text-xs font-semibold text-muted-foreground">날짜</th>
                        <th className="w-52 shrink-0 px-3 py-2 text-left text-xs font-semibold text-muted-foreground">가맹점</th>
                        <th className="w-28 shrink-0 px-3 py-2 text-right text-xs font-semibold text-muted-foreground">금액</th>
                        <th className="w-44 shrink-0 px-3 py-2 text-left text-xs font-semibold text-muted-foreground">카드</th>
                        <th className="w-80 shrink-0 px-3 py-2 text-left text-xs font-semibold text-muted-foreground">카테고리</th>
                        <th className="w-44 shrink-0 px-3 py-2 text-left text-xs font-semibold text-muted-foreground">메모</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">상태</th>
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
                            <input
                              type="text"
                              className="h-8 w-full rounded border border-border bg-background px-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                              placeholder="메모 입력"
                              value={row.userNote}
                              onChange={(e) => setUploadRows((rows) => rows.map((item) => item.id === row.id ? { ...item, userNote: e.target.value } : item))}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-1">
                              {row.duplicate && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">중복 후보</span>}
                              {!row.duplicate && row.entryType === "income" && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">환불 후보</span>}
                              {row.installmentStatus === "registered" && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">할부등록됨</span>}
                              {row.installmentStatus === "new" && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">할부신규 {row.installmentMonths}개월</span>}
                              {row.installmentStatus === "none" && !row.duplicate && row.entryType !== "income" && row.status && <span className="text-xs text-muted-foreground">{row.status}</span>}
                              {row.installmentStatus === "none" && !row.duplicate && row.entryType !== "income" && !row.status && <span className="text-xs text-muted-foreground">-</span>}
                            </div>
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
