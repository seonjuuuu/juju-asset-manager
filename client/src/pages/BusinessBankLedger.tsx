import { useState, useMemo, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ChevronLeft, ChevronRight, Upload, Landmark, Download } from "lucide-react";
import { CurrencyInput } from "@/components/ui/currency-input";
import * as XLSX from "xlsx";

const fmt = (n: number) => n.toLocaleString("ko-KR") + "원";
const todayStr = () => new Date().toISOString().slice(0, 10);

const CATEGORIES = ["매출입금", "경비결제", "카드값", "세금납부", "급여지급", "대출상환", "이자수입", "이체", "개인사용", "기타"];

type TxType = "입금" | "출금";

type UploadRow = {
  transactionDate: string;
  transactionType: TxType;
  description: string;
  counterparty: string;
  depositAmount: number;
  withdrawAmount: number;
  balance: number | null;
  accountName: string;
  category: string;
  note: string;
  skip: boolean;
};

type FormState = {
  transactionDate: string;
  transactionType: TxType;
  description: string;
  counterparty: string;
  depositAmount: number;
  withdrawAmount: number;
  balance: string;
  accountName: string;
  category: string;
  note: string;
};

const defaultForm = (): FormState => ({
  transactionDate: todayStr(),
  transactionType: "출금",
  description: "",
  counterparty: "",
  depositAmount: 0,
  withdrawAmount: 0,
  balance: "",
  accountName: "",
  category: "",
  note: "",
});

// ─── 엑셀 파싱 ────────────────────────────────────────────────────────────────
function scoreSheet(rows: unknown[][]): number {
  const sample = rows.slice(0, 15).flat().map(c => String(c ?? ""));
  let score = 0;
  if (sample.some(c => /\d{4}[.\-/]\d{2}[.\-/]\d{2}/.test(c) || /^\d{8}$/.test(c))) score += 3;
  if (sample.some(c => /^[\d,]+$/.test(c.replace(/\s/g, "")) && Number(c.replace(/,/g, "")) > 0)) score += 2;
  if (sample.some(c => /[가-힣]/.test(c))) score += 1;
  return score;
}

function detectHeaderRow(rows: unknown[][]): number {
  const keywords = ["날짜", "일자", "거래일", "적요", "내용", "입금", "출금", "잔액"];
  let bestRow = 0;
  let bestScore = 1;
  for (let i = 0; i < Math.min(15, rows.length); i++) {
    const cells = (rows[i] ?? []).map(c => String(c ?? "").trim());
    const score = cells.filter(c => keywords.some(k => c.includes(k))).length;
    if (score > bestScore) { bestScore = score; bestRow = i; }
  }
  return bestRow;
}

function parseDate(raw: string | number): string {
  if (!raw) return "";
  const s = String(raw).replace(/\s.*/, "").trim();
  const digits = s.replace(/\D/g, "");
  if (digits.length === 8) return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  if (/^\d{4}[.\-/]\d{2}[.\-/]\d{2}/.test(s)) return s.replace(/[./]/g, "-").slice(0, 10);
  return s.slice(0, 10);
}

function parseAmount(raw: unknown): number {
  const n = Number(String(raw ?? "").replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return isNaN(n) || n < 0 ? 0 : Math.round(n);
}

function detectBankColumns(headers: string[]): {
  dateIdx: number; descIdx: number; counterpartyIdx: number;
  depositIdx: number; withdrawIdx: number; balanceIdx: number; noteIdx: number;
} {
  let dateIdx = -1, descIdx = -1, counterpartyIdx = -1;
  let depositIdx = -1, withdrawIdx = -1, balanceIdx = -1, noteIdx = -1;
  headers.forEach((h, i) => {
    const t = h.replace(/\s/g, "");
    if (dateIdx < 0 && /날짜|일자|거래일|거래일시/.test(t)) dateIdx = i;
    if (descIdx < 0 && /적요|내용|거래내용/.test(t)) descIdx = i;
    if (noteIdx < 0 && /메모|비고/.test(t)) noteIdx = i;
    if (counterpartyIdx < 0 && /거래처|상대방|의뢰인|받는분|보내는분/.test(t)) counterpartyIdx = i;
    if (depositIdx < 0 && /입금액|입금|들어온금액/.test(t)) depositIdx = i;
    if (withdrawIdx < 0 && /출금액|출금|나간금액/.test(t)) withdrawIdx = i;
    if (balanceIdx < 0 && /잔액|잔고/.test(t)) balanceIdx = i;
  });
  return { dateIdx, descIdx, counterpartyIdx, depositIdx, withdrawIdx, balanceIdx, noteIdx };
}

function parseBankXls(file: File): Promise<UploadRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });

        let bestSheet = wb.SheetNames[0];
        let bestScore = -1;
        for (const name of wb.SheetNames) {
          const ws = wb.Sheets[name];
          const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false }) as unknown[][];
          const score = scoreSheet(rows);
          if (score > bestScore) { bestScore = score; bestSheet = name; }
        }

        const ws = wb.Sheets[bestSheet];
        const allRows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false }) as unknown[][];
        const headerIdx = detectHeaderRow(allRows);
        const headers = (allRows[headerIdx] ?? []).map(c => String(c ?? "").trim());
        const { dateIdx, descIdx, counterpartyIdx, depositIdx, withdrawIdx, balanceIdx, noteIdx } = detectBankColumns(headers);

        const rows: UploadRow[] = [];
        for (let i = headerIdx + 1; i < allRows.length; i++) {
          const row = allRows[i] ?? [];
          const dateRaw = dateIdx >= 0 ? String(row[dateIdx] ?? "") : "";
          const descRaw = descIdx >= 0 ? String(row[descIdx] ?? "").trim() : "";
          const counterpartyRaw = counterpartyIdx >= 0 ? String(row[counterpartyIdx] ?? "").trim() : "";
          const noteRaw = noteIdx >= 0 ? String(row[noteIdx] ?? "").trim() : "";
          const deposit = depositIdx >= 0 ? parseAmount(row[depositIdx]) : 0;
          const withdraw = withdrawIdx >= 0 ? parseAmount(row[withdrawIdx]) : 0;
          const balanceRaw = balanceIdx >= 0 ? parseAmount(row[balanceIdx]) : 0;

          const date = parseDate(dateRaw);
          if (!date || (!descRaw && !counterpartyRaw)) continue;
          if (deposit === 0 && withdraw === 0) continue;

          rows.push({
            transactionDate: date,
            transactionType: deposit > 0 ? "입금" : "출금",
            description: counterpartyRaw || descRaw,
            counterparty: counterpartyRaw,
            depositAmount: deposit,
            withdrawAmount: withdraw,
            balance: balanceRaw || null,
            accountName: "",
            category: "",
            note: noteRaw,
            skip: false,
          });
        }
        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// ─── 메인 페이지 ──────────────────────────────────────────────────────────────
export default function BusinessBankLedger() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [yearOnly, setYearOnly] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(now.getFullYear());
  const [searchMode, setSearchMode] = useState<"period" | "range">("period");
  const [rangeStart, setRangeStart] = useState(`${now.getFullYear()}-01-01`);
  const [rangeEnd, setRangeEnd] = useState(now.toISOString().slice(0, 10));

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm());
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const [uploadRows, setUploadRows] = useState<UploadRow[]>([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();
  const { data: entries = [], isLoading } = trpc.businessBankLedger.list.useQuery(
    searchMode === "range"
      ? { startDate: rangeStart, endDate: rangeEnd }
      : { year, month: yearOnly ? undefined : month }
  );

  const createMutation = trpc.businessBankLedger.create.useMutation({
    onSuccess: () => { utils.businessBankLedger.list.invalidate(); toast.success("추가되었습니다"); setDialogOpen(false); },
    onError: () => toast.error("추가 실패"),
  });
  const bulkCreateMutation = trpc.businessBankLedger.bulkCreate.useMutation({
    onSuccess: (data) => {
      utils.businessBankLedger.list.invalidate();
      toast.success(`${data.count}건 가져왔습니다`);
      setUploadOpen(false);
      setUploadRows([]);
    },
    onError: () => toast.error("가져오기 실패"),
  });
  const updateMutation = trpc.businessBankLedger.update.useMutation({
    onSuccess: () => { utils.businessBankLedger.list.invalidate(); toast.success("수정되었습니다"); setDialogOpen(false); },
    onError: () => toast.error("수정 실패"),
  });
  const deleteMutation = trpc.businessBankLedger.delete.useMutation({
    onSuccess: () => { utils.businessBankLedger.list.invalidate(); toast.success("삭제되었습니다"); setDeleteId(null); },
    onError: () => toast.error("삭제 실패"),
  });

  const PAGE_SIZE = 50;
  const [page, setPage] = useState(1);

  const totalDeposit = useMemo(() => entries.reduce((s, e) => s + e.depositAmount, 0), [entries]);
  const totalWithdraw = useMemo(() => entries.reduce((s, e) => s + e.withdrawAmount, 0), [entries]);
  const netAmount = totalDeposit - totalWithdraw;

  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const pagedEntries = useMemo(() => entries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [entries, page]);

  const prevMonth = () => {
    setPage(1);
    if (yearOnly) { setYear(y => y - 1); return; }
    if (month === 1) { setYear(y => y - 1); setMonth(12); } else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    setPage(1);
    if (yearOnly) { setYear(y => y + 1); return; }
    if (month === 12) { setYear(y => y + 1); setMonth(1); } else setMonth(m => m + 1);
  };

  function exportExcel() {
    const data = entries.map(e => ({
      날짜: e.transactionDate,
      구분: e.transactionType,
      "적요/내용": e.description,
      거래처: e.counterparty ?? "",
      입금액: e.depositAmount || "",
      출금액: e.withdrawAmount || "",
      잔액: e.balance ?? "",
      카테고리: e.category ?? "",
      메모: e.note ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "통장내역");
    const filename = searchMode === "range"
      ? `통장내역_${rangeStart}_${rangeEnd}.xlsx`
      : yearOnly
        ? `통장내역_${year}.xlsx`
        : `통장내역_${year}_${String(month).padStart(2, "0")}.xlsx`;
    XLSX.writeFile(wb, filename);
  }

  function openCreate() {
    setEditingId(null);
    setForm({ ...defaultForm(), transactionDate: `${year}-${String(month).padStart(2, "0")}-01` });
    setDialogOpen(true);
  }

  function openEdit(e: typeof entries[number]) {
    setEditingId(e.id);
    setForm({
      transactionDate: e.transactionDate,
      transactionType: e.transactionType as TxType,
      description: e.description,
      counterparty: e.counterparty ?? "",
      depositAmount: e.depositAmount,
      withdrawAmount: e.withdrawAmount,
      balance: e.balance != null ? e.balance.toLocaleString("ko-KR") : "",
      accountName: e.accountName ?? "",
      category: e.category ?? "",
      note: e.note ?? "",
    });
    setDialogOpen(true);
  }

  function handleSubmit() {
    if (!form.description.trim()) { toast.error("적요/내용을 입력하세요"); return; }
    if (form.depositAmount === 0 && form.withdrawAmount === 0) { toast.error("입금액 또는 출금액을 입력하세요"); return; }
    const [y, m] = form.transactionDate.split("-").map(Number);
    const txType: TxType = form.depositAmount > 0 ? "입금" : "출금";
    const payload = {
      transactionDate: form.transactionDate, year: y, month: m,
      transactionType: txType,
      description: form.description,
      counterparty: form.counterparty || null,
      depositAmount: form.depositAmount,
      withdrawAmount: form.withdrawAmount,
      balance: form.balance ? Number(form.balance.replace(/,/g, "")) : null,
      accountName: form.accountName || null,
      category: form.category || null,
      note: form.note || null,
    };
    if (editingId !== null) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const rows = await parseBankXls(file);
      if (rows.length === 0) { toast.error("인식된 거래 내역이 없습니다"); return; }
      setUploadRows(rows);
      setUploadOpen(true);
    } catch {
      toast.error("파일 파싱 실패");
    }
    e.target.value = "";
  }

  function handleBulkSave() {
    const valid = uploadRows.filter(r => !r.skip && r.description && (r.depositAmount > 0 || r.withdrawAmount > 0));
    if (valid.length === 0) { toast.error("저장할 항목이 없습니다"); return; }
    const rows = valid.map(r => {
      const [y, m] = r.transactionDate.split("-").map(Number);
      return {
        transactionDate: r.transactionDate, year: y, month: m,
        transactionType: r.transactionType,
        description: r.description,
        counterparty: r.counterparty || null,
        depositAmount: r.depositAmount,
        withdrawAmount: r.withdrawAmount,
        balance: r.balance,
        accountName: r.accountName || null,
        category: r.category || null,
        note: r.note || null,
      };
    });
    bulkCreateMutation.mutate(rows);
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">통장 내역</h1>
          <p className="text-sm text-muted-foreground mt-0.5">월별 입출금 내역을 관리합니다</p>
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept=".xls,.xlsx" className="hidden" onChange={handleFileChange} />
          <Button variant="outline" size="sm" onClick={exportExcel} disabled={entries.length === 0} className="gap-1.5">
            <Download className="w-4 h-4" /> 엑셀 내보내기
          </Button>
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} className="gap-1.5">
            <Upload className="w-4 h-4" /> 통장내역 업로드
          </Button>
          <Button size="sm" onClick={openCreate} className="gap-1.5">
            <Plus className="w-4 h-4" /> 직접 추가
          </Button>
        </div>
      </div>

      {/* 월 선택 + 요약 */}
      <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
        <div className="flex items-center gap-5">
          <div>
            <p className="text-xs text-muted-foreground">총 입금</p>
            <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{fmt(totalDeposit)}</p>
          </div>
          <div className="h-9 w-px bg-border" />
          <div>
            <p className="text-xs text-muted-foreground">총 출금</p>
            <p className="text-xl font-bold text-red-500">{fmt(totalWithdraw)}</p>
          </div>
          <div className="h-9 w-px bg-border" />
          <div>
            <p className="text-xs text-muted-foreground">순 차액</p>
            <p className={`text-xl font-bold ${netAmount >= 0 ? "text-foreground" : "text-red-500"}`}>{fmt(netAmount)}</p>
          </div>
          <div className="h-9 w-px bg-border" />
          <div>
            <p className="text-xs text-muted-foreground">건수</p>
            <p className="text-lg font-bold">{entries.length}건</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* 모드 탭 */}
          <div className="flex rounded-lg border border-border overflow-hidden text-xs">
            <button
              onClick={() => setSearchMode("period")}
              className={`px-3 py-1.5 font-medium transition-colors ${searchMode === "period" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"}`}>
              월/연도
            </button>
            <button
              onClick={() => setSearchMode("range")}
              className={`px-3 py-1.5 font-medium transition-colors border-l border-border ${searchMode === "range" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"}`}>
              기간
            </button>
          </div>

          {searchMode === "period" ? (
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="h-7 text-xs px-2"
                onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth() + 1); setYearOnly(false); }}>
                오늘
              </Button>
              <Button variant="ghost" size="icon" onClick={prevMonth}><ChevronLeft className="w-4 h-4" /></Button>
              <Popover open={pickerOpen} onOpenChange={open => { setPickerOpen(open); if (open) setPickerYear(year); }}>
                <PopoverTrigger asChild>
                  <button className="text-sm font-medium w-24 text-center hover:bg-muted rounded px-2 py-1 transition-colors">
                    {year}.{yearOnly ? "전체" : String(month).padStart(2, "0")}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-3" align="end">
                  <div className="flex items-center justify-between mb-3">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPickerYear(y => y - 1)}><ChevronLeft className="w-4 h-4" /></Button>
                    <span className="text-sm font-semibold">{pickerYear}년</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPickerYear(y => y + 1)}><ChevronRight className="w-4 h-4" /></Button>
                  </div>
                  <button
                    onClick={() => { setYear(pickerYear); setYearOnly(true); setPickerOpen(false); }}
                    className={`w-full rounded py-1.5 text-sm font-medium transition-colors mb-1 ${yearOnly && pickerYear === year ? "bg-primary text-primary-foreground" : "hover:bg-muted text-foreground"}`}>
                    {pickerYear}년 전체
                  </button>
                  <div className="grid grid-cols-4 gap-1">
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
                      const isSelected = !yearOnly && pickerYear === year && m === month;
                      return (
                        <button key={m} onClick={() => { setYear(pickerYear); setMonth(m); setYearOnly(false); setPickerOpen(false); }}
                          className={`rounded py-1.5 text-sm font-medium transition-colors ${isSelected ? "bg-primary text-primary-foreground" : "hover:bg-muted text-foreground"}`}>
                          {m}월
                        </button>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>
              <Button variant="ghost" size="icon" onClick={nextMonth}><ChevronRight className="w-4 h-4" /></Button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <Input type="date" value={rangeStart} onChange={e => setRangeStart(e.target.value)} className="h-8 w-36 text-sm" />
              <span className="text-muted-foreground text-sm">~</span>
              <Input type="date" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)} className="h-8 w-36 text-sm" />
            </div>
          )}
        </div>
      </div>

      {/* 내역 테이블 */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-muted/50">
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">날짜</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">구분</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">적요/내용</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">거래처</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">입금액</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">출금액</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">잔액</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">카테고리</th>
              <th className="px-4 py-3 w-16"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={9} className="text-center py-10 text-muted-foreground text-sm">로딩 중...</td></tr>
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center py-14">
                  <Landmark className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">이번 달 통장 내역이 없습니다</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={openCreate}>
                    <Plus className="w-3.5 h-3.5 mr-1" /> 직접 추가
                  </Button>
                </td>
              </tr>
            ) : (
              <>
                {pagedEntries.map(e => (
                  <tr key={e.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">{e.transactionDate}</td>
                    <td className="px-4 py-3 text-center">
                      <Badge className={`text-xs ${e.transactionType === "입금"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 hover:bg-emerald-100"
                        : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-100"}`}>
                        {e.transactionType}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium max-w-48 truncate">{e.description}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{e.counterparty ?? "—"}</td>
                    <td className="px-4 py-3 text-sm text-right font-semibold text-emerald-600 dark:text-emerald-400">
                      {e.depositAmount > 0 ? fmt(e.depositAmount) : "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-semibold text-red-500">
                      {e.withdrawAmount > 0 ? fmt(e.withdrawAmount) : "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-muted-foreground">
                      {e.balance != null ? fmt(e.balance) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {e.category ? (
                        <Badge variant="secondary" className="text-xs">{e.category}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => openEdit(e)} className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setDeleteId(e.id)} className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-muted-foreground hover:text-red-500">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-border bg-muted/20">
                  <td colSpan={4} className="px-4 py-3 text-sm font-semibold text-right text-muted-foreground">
                    전체 합계 ({entries.length}건)
                  </td>
                  <td className="px-4 py-3 text-sm font-bold text-right text-emerald-600 dark:text-emerald-400">{fmt(totalDeposit)}</td>
                  <td className="px-4 py-3 text-sm font-bold text-right text-red-500">{fmt(totalWithdraw)}</td>
                  <td colSpan={3} />
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage(1)} disabled={page === 1}>
            <ChevronLeft className="w-3 h-3 -mr-1" /><ChevronLeft className="w-3 h-3" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="flex items-center gap-1">
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
              .reduce<(number | "...")[]>((acc, p, i, arr) => {
                if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("...");
                acc.push(p);
                return acc;
              }, [])
              .map((p, i) =>
                p === "..." ? (
                  <span key={`dot-${i}`} className="px-1 text-muted-foreground text-sm">…</span>
                ) : (
                  <button key={p} onClick={() => setPage(p as number)}
                    className={`h-8 w-8 rounded-md text-sm font-medium transition-colors ${page === p ? "bg-primary text-primary-foreground" : "hover:bg-muted text-foreground"}`}>
                    {p}
                  </button>
                )
              )}
          </div>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage(totalPages)} disabled={page === totalPages}>
            <ChevronRight className="w-3 h-3" /><ChevronRight className="w-3 h-3 -ml-1" />
          </Button>
        </div>
      )}

      {/* 추가/수정 다이얼로그 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingId !== null ? "내역 수정" : "내역 추가"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">거래일 *</Label>
              <Input type="date" value={form.transactionDate} onChange={e => setForm(f => ({ ...f, transactionDate: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">적요/내용 *</Label>
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="예: 카드대금 결제, 광고비 입금" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">거래처</Label>
              <Input value={form.counterparty} onChange={e => setForm(f => ({ ...f, counterparty: e.target.value }))} placeholder="예: (주)ABC" className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">입금액 (원)</Label>
                <CurrencyInput value={form.depositAmount} onChange={v => setForm(f => ({ ...f, depositAmount: v, withdrawAmount: v > 0 ? 0 : f.withdrawAmount }))} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">출금액 (원)</Label>
                <CurrencyInput value={form.withdrawAmount} onChange={v => setForm(f => ({ ...f, withdrawAmount: v, depositAmount: v > 0 ? 0 : f.depositAmount }))} className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">잔액 (원)</Label>
                <Input
                  value={form.balance}
                  onChange={e => {
                    const digits = e.target.value.replace(/[^0-9]/g, "");
                    setForm(f => ({ ...f, balance: digits ? Number(digits).toLocaleString("ko-KR") : "" }));
                  }}
                  placeholder="선택"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">카테고리</Label>
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">선택 안 함</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div>
              <Label className="text-xs">비고</Label>
              <Input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="메모" className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>취소</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
              {editingId !== null ? "수정" : "추가"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 업로드 미리보기 다이얼로그 */}
      <Dialog open={uploadOpen} onOpenChange={open => { if (!open) { setUploadOpen(false); setUploadRows([]); } }}>
        <DialogContent className="w-[95vw] max-w-[95vw] max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>통장내역 가져오기 ({uploadRows.filter(r => !r.skip).length}건 선택)</DialogTitle>
          </DialogHeader>
          <div className="overflow-auto flex-1">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background z-10">
                <tr className="border-b">
                  <th className="text-center py-2 px-2 font-medium w-10">포함</th>
                  <th className="text-left py-2 px-2 font-medium whitespace-nowrap">거래일</th>
                  <th className="text-center py-2 px-2 font-medium whitespace-nowrap">구분</th>
                  <th className="text-left py-2 px-2 font-medium">적요/내용</th>
                  <th className="text-left py-2 px-2 font-medium">거래처</th>
                  <th className="text-right py-2 px-2 font-medium whitespace-nowrap">입금액</th>
                  <th className="text-right py-2 px-2 font-medium whitespace-nowrap">출금액</th>
                  <th className="text-left py-2 px-2 font-medium">메모</th>
                  <th className="text-left py-2 px-2 font-medium whitespace-nowrap">카테고리</th>
                </tr>
              </thead>
              <tbody>
                {uploadRows.map((row, i) => (
                  <tr key={i} className={`border-b ${row.skip ? "opacity-40" : ""}`}>
                    <td className="py-1.5 px-2 text-center">
                      <input type="checkbox" checked={!row.skip}
                        onChange={e => setUploadRows(rows => rows.map((r, j) => j === i ? { ...r, skip: !e.target.checked } : r))} />
                    </td>
                    <td className="py-1.5 px-2 whitespace-nowrap text-muted-foreground text-xs">{row.transactionDate}</td>
                    <td className="py-1.5 px-2 text-center">
                      <select className="h-6 text-xs rounded border border-input bg-background px-1"
                        value={row.transactionType}
                        onChange={e => setUploadRows(rows => rows.map((r, j) => j === i ? { ...r, transactionType: e.target.value as TxType } : r))}>
                        <option value="입금">입금</option>
                        <option value="출금">출금</option>
                      </select>
                    </td>
                    <td className="py-1.5 px-2">
                      <Input className="h-7 text-xs w-44" value={row.description}
                        onChange={e => setUploadRows(rows => rows.map((r, j) => j === i ? { ...r, description: e.target.value } : r))} />
                    </td>
                    <td className="py-1.5 px-2">
                      <Input className="h-7 text-xs w-32" value={row.counterparty}
                        onChange={e => setUploadRows(rows => rows.map((r, j) => j === i ? { ...r, counterparty: e.target.value } : r))} />
                    </td>
                    <td className="py-1.5 px-2 text-right text-xs font-semibold text-emerald-600 whitespace-nowrap">
                      {row.depositAmount > 0 ? row.depositAmount.toLocaleString("ko-KR") : "—"}
                    </td>
                    <td className="py-1.5 px-2 text-right text-xs font-semibold text-red-500 whitespace-nowrap">
                      {row.withdrawAmount > 0 ? row.withdrawAmount.toLocaleString("ko-KR") : "—"}
                    </td>
                    <td className="py-1.5 px-2">
                      <Input className="h-7 text-xs w-36" value={row.note}
                        onChange={e => setUploadRows(rows => rows.map((r, j) => j === i ? { ...r, note: e.target.value } : r))} />
                    </td>
                    <td className="py-1.5 px-2">
                      <select className="h-7 text-xs rounded border border-input bg-background px-2" value={row.category}
                        onChange={e => setUploadRows(rows => rows.map((r, j) => j === i ? { ...r, category: e.target.value } : r))}>
                        <option value="">선택</option>
                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => { setUploadOpen(false); setUploadRows([]); }}>취소</Button>
            <Button onClick={handleBulkSave} disabled={bulkCreateMutation.isPending}>
              {uploadRows.filter(r => !r.skip).length}건 저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 삭제 확인 */}
      <Dialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>내역 삭제</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">이 항목을 삭제하시겠습니까?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>취소</Button>
            <Button variant="destructive" onClick={() => deleteId !== null && deleteMutation.mutate({ id: deleteId })}>삭제</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
