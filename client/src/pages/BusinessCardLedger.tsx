import { useState, useMemo, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ChevronLeft, ChevronRight, Upload, CreditCard } from "lucide-react";
import { CurrencyInput } from "@/components/ui/currency-input";
import * as XLSX from "xlsx";

const fmt = (n: number) => n.toLocaleString("ko-KR") + "원";
const todayStr = () => new Date().toISOString().slice(0, 10);

const CATEGORIES = ["광고비", "접대비", "교통비", "통신비", "소모품", "수수료", "임차료", "복리후생비", "기타"];

type UploadRow = {
  transactionDate: string;
  merchant: string;
  amount: number;
  cardName: string;
  category: string;
  note: string;
  skip: boolean;
};

type FormState = {
  transactionDate: string;
  merchant: string;
  amount: number;
  category: string;
  cardName: string;
  note: string;
};

const defaultForm = (): FormState => ({
  transactionDate: todayStr(),
  merchant: "",
  amount: 0,
  category: "",
  cardName: "",
  note: "",
});

function scoreSheet(rows: unknown[][]): number {
  const sample = rows.slice(0, 15).flat().map(c => String(c ?? ""));
  let score = 0;
  const hasDate = sample.some(c => /\d{4}[.\-/]\d{2}[.\-/]\d{2}/.test(c) || /^\d{8}$/.test(c));
  const hasAmount = sample.some(c => /^[\d,]+$/.test(c.replace(/\s/g, "")) && Number(c.replace(/,/g, "")) > 0);
  const hasKorean = sample.some(c => /[가-힣]/.test(c));
  if (hasDate) score += 3;
  if (hasAmount) score += 2;
  if (hasKorean) score += 1;
  return score;
}

function detectHeaderRow(rows: unknown[][]): number {
  const keywords = ["날짜", "일자", "거래일", "가맹점", "이용가맹점", "금액", "이용금액", "결제금액"];
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const cells = (rows[i] ?? []).map(c => String(c ?? "").trim());
    if (cells.filter(c => keywords.some(k => c.includes(k))).length >= 2) return i;
  }
  return 0;
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

function detectColumns(headers: string[]): { dateIdx: number; merchantIdx: number; amountIdx: number } {
  let dateIdx = -1, merchantIdx = -1, amountIdx = -1;
  headers.forEach((h, i) => {
    const t = h.replace(/\s/g, "");
    if (dateIdx < 0 && /날짜|일자|거래일|승인일/.test(t)) dateIdx = i;
    if (merchantIdx < 0 && /가맹점|이용가맹점|상호|거래처/.test(t)) merchantIdx = i;
    if (amountIdx < 0 && /이용금액|결제금액|금액|거래금액/.test(t)) amountIdx = i;
  });
  return { dateIdx, merchantIdx, amountIdx };
}

function parseCardXls(file: File): Promise<UploadRow[]> {
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
          const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false });
          const score = scoreSheet(rows as unknown[][]);
          if (score > bestScore) { bestScore = score; bestSheet = name; }
        }

        const ws = wb.Sheets[bestSheet];
        const allRows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false }) as unknown[][];
        const headerIdx = detectHeaderRow(allRows);
        const headers = (allRows[headerIdx] ?? []).map(c => String(c ?? "").trim());
        const { dateIdx, merchantIdx, amountIdx } = detectColumns(headers);

        const rows: UploadRow[] = [];
        for (let i = headerIdx + 1; i < allRows.length; i++) {
          const row = allRows[i] ?? [];
          const dateRaw = dateIdx >= 0 ? String(row[dateIdx] ?? "") : "";
          const merchantRaw = merchantIdx >= 0 ? String(row[merchantIdx] ?? "").trim() : "";
          const amountRaw = amountIdx >= 0 ? row[amountIdx] : 0;

          const date = parseDate(dateRaw);
          const amount = parseAmount(amountRaw);
          if (!date || !merchantRaw || amount <= 0) continue;

          rows.push({
            transactionDate: date,
            merchant: merchantRaw,
            amount,
            cardName: "",
            category: "",
            note: "",
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

export default function BusinessCardLedger() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(now.getFullYear());

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm());
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const [uploadRows, setUploadRows] = useState<UploadRow[]>([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [defaultCardName, setDefaultCardName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();
  const { data: entries = [], isLoading } = trpc.businessCardLedger.list.useQuery({ year, month });

  const createMutation = trpc.businessCardLedger.create.useMutation({
    onSuccess: () => { utils.businessCardLedger.list.invalidate(); toast.success("추가되었습니다"); setDialogOpen(false); },
    onError: () => toast.error("추가 실패"),
  });
  const bulkCreateMutation = trpc.businessCardLedger.bulkCreate.useMutation({
    onSuccess: (data) => {
      utils.businessCardLedger.list.invalidate();
      toast.success(`${data.count}건 가져왔습니다`);
      setUploadOpen(false);
      setUploadRows([]);
    },
    onError: () => toast.error("가져오기 실패"),
  });
  const updateMutation = trpc.businessCardLedger.update.useMutation({
    onSuccess: () => { utils.businessCardLedger.list.invalidate(); toast.success("수정되었습니다"); setDialogOpen(false); },
    onError: () => toast.error("수정 실패"),
  });
  const deleteMutation = trpc.businessCardLedger.delete.useMutation({
    onSuccess: () => { utils.businessCardLedger.list.invalidate(); toast.success("삭제되었습니다"); setDeleteId(null); },
    onError: () => toast.error("삭제 실패"),
  });

  const monthTotal = useMemo(() => entries.reduce((s, e) => s + e.amount, 0), [entries]);

  const byCategory = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of entries) {
      const cat = e.category || "미분류";
      map[cat] = (map[cat] ?? 0) + e.amount;
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [entries]);

  const prevMonth = () => { if (month === 1) { setYear(y => y - 1); setMonth(12); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 12) { setYear(y => y + 1); setMonth(1); } else setMonth(m => m + 1); };

  function openCreate() {
    setEditingId(null);
    setForm({ ...defaultForm(), transactionDate: `${year}-${String(month).padStart(2, "0")}-01` });
    setDialogOpen(true);
  }

  function openEdit(e: typeof entries[number]) {
    setEditingId(e.id);
    setForm({
      transactionDate: e.transactionDate,
      merchant: e.merchant,
      amount: e.amount,
      category: e.category ?? "",
      cardName: e.cardName ?? "",
      note: e.note ?? "",
    });
    setDialogOpen(true);
  }

  function handleSubmit() {
    if (!form.merchant.trim()) { toast.error("가맹점명을 입력하세요"); return; }
    if (form.amount <= 0) { toast.error("금액을 입력하세요"); return; }
    const [y, m] = form.transactionDate.split("-").map(Number);
    const payload = { ...form, year: y, month: m, category: form.category || null, cardName: form.cardName || null, note: form.note || null };
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
      const rows = await parseCardXls(file);
      if (rows.length === 0) { toast.error("인식된 거래 내역이 없습니다"); return; }
      setUploadRows(rows.map(r => ({ ...r, cardName: defaultCardName })));
      setUploadOpen(true);
    } catch {
      toast.error("파일 파싱 실패");
    }
    e.target.value = "";
  }

  function handleBulkSave() {
    const valid = uploadRows.filter(r => !r.skip && r.merchant && r.amount > 0);
    if (valid.length === 0) { toast.error("저장할 항목이 없습니다"); return; }
    const rows = valid.map(r => {
      const [y, m] = r.transactionDate.split("-").map(Number);
      return { transactionDate: r.transactionDate, year: y, month: m, merchant: r.merchant, amount: r.amount, category: r.category || null, cardName: r.cardName || null, note: r.note || null };
    });
    bulkCreateMutation.mutate(rows);
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">사업자 카드 내역</h1>
          <p className="text-sm text-muted-foreground mt-0.5">월별 사업자 카드 사용 내역을 관리합니다</p>
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept=".xls,.xlsx" className="hidden" onChange={handleFileChange} />
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} className="gap-1.5">
            <Upload className="w-4 h-4" /> 카드명세서 업로드
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
            <p className="text-xs text-muted-foreground">이번 달 합계</p>
            <p className="text-xl font-bold text-red-500">{fmt(monthTotal)}</p>
          </div>
          <div className="h-9 w-px bg-border" />
          <div>
            <p className="text-xs text-muted-foreground">거래 건수</p>
            <p className="text-lg font-bold">{entries.length}건</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {(year !== now.getFullYear() || month !== now.getMonth() + 1) && (
            <Button variant="outline" size="sm" className="h-7 text-xs px-2 mr-1"
              onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth() + 1); }}>
              오늘
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={prevMonth}><ChevronLeft className="w-4 h-4" /></Button>
          <Popover open={pickerOpen} onOpenChange={open => { setPickerOpen(open); if (open) setPickerYear(year); }}>
            <PopoverTrigger asChild>
              <button className="text-sm font-medium w-20 text-center hover:bg-muted rounded px-2 py-1 transition-colors">
                {year}.{String(month).padStart(2, "0")}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3" align="center">
              <div className="flex items-center justify-between mb-3">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPickerYear(y => y - 1)}><ChevronLeft className="w-4 h-4" /></Button>
                <span className="text-sm font-semibold">{pickerYear}년</span>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPickerYear(y => y + 1)}><ChevronRight className="w-4 h-4" /></Button>
              </div>
              <div className="grid grid-cols-4 gap-1">
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
                  const isSelected = pickerYear === year && m === month;
                  return (
                    <button key={m} onClick={() => { setYear(pickerYear); setMonth(m); setPickerOpen(false); }}
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
      </div>

      {/* 카테고리 요약 */}
      {byCategory.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          {byCategory.slice(0, 4).map(([cat, total]) => (
            <Card key={cat}>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground">{cat}</p>
                <p className="text-base font-bold text-foreground mt-0.5">{fmt(total)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 내역 테이블 */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-muted/50">
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">날짜</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">가맹점</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">카테고리</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">카드</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">금액</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">비고</th>
              <th className="px-4 py-3 w-16"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="text-center py-10 text-muted-foreground text-sm">로딩 중...</td></tr>
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-14">
                  <CreditCard className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">이번 달 카드 내역이 없습니다</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={openCreate}>
                    <Plus className="w-3.5 h-3.5 mr-1" /> 직접 추가
                  </Button>
                </td>
              </tr>
            ) : (
              <>
                {entries.map(e => (
                  <tr key={e.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">{e.transactionDate}</td>
                    <td className="px-4 py-3 text-sm font-medium">{e.merchant}</td>
                    <td className="px-4 py-3">
                      {e.category ? (
                        <Badge variant="secondary" className="text-xs">{e.category}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{e.cardName ?? "—"}</td>
                    <td className="px-4 py-3 text-sm text-right font-semibold text-red-500">{fmt(e.amount)}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{e.note ?? "—"}</td>
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
                  <td colSpan={4} className="px-4 py-3 text-sm font-semibold text-right">합계</td>
                  <td className="px-4 py-3 text-sm font-bold text-right text-red-500">{fmt(monthTotal)}</td>
                  <td colSpan={2} />
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* 추가/수정 다이얼로그 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingId !== null ? "내역 수정" : "내역 추가"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">거래일 *</Label>
                <Input type="date" value={form.transactionDate} onChange={e => setForm(f => ({ ...f, transactionDate: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">카드명</Label>
                <Input value={form.cardName} onChange={e => setForm(f => ({ ...f, cardName: e.target.value }))} placeholder="예: 현대카드 M" className="mt-1" />
              </div>
            </div>
            <div>
              <Label className="text-xs">가맹점 *</Label>
              <Input value={form.merchant} onChange={e => setForm(f => ({ ...f, merchant: e.target.value }))} placeholder="예: 스타벅스" className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">금액 (원) *</Label>
                <CurrencyInput value={form.amount} onChange={v => setForm(f => ({ ...f, amount: v }))} className="mt-1" />
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
        <DialogContent className="max-w-5xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>카드명세서 가져오기 ({uploadRows.filter(r => !r.skip).length}건 선택)</DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <Label className="text-xs whitespace-nowrap">카드명 일괄 적용</Label>
            <Input
              className="h-8 text-sm max-w-48"
              placeholder="예: 현대카드 M"
              value={defaultCardName}
              onChange={e => {
                setDefaultCardName(e.target.value);
                setUploadRows(rows => rows.map(r => ({ ...r, cardName: e.target.value })));
              }}
            />
          </div>
          <div className="overflow-auto flex-1">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b">
                  <th className="text-center py-2 px-2 font-medium w-12">포함</th>
                  <th className="text-left py-2 px-2 font-medium">거래일</th>
                  <th className="text-left py-2 px-2 font-medium">가맹점</th>
                  <th className="text-right py-2 px-2 font-medium">금액</th>
                  <th className="text-left py-2 px-2 font-medium">카드명</th>
                  <th className="text-left py-2 px-2 font-medium">카테고리</th>
                  <th className="text-left py-2 px-2 font-medium">비고</th>
                </tr>
              </thead>
              <tbody>
                {uploadRows.map((row, i) => (
                  <tr key={i} className={`border-b ${row.skip ? "opacity-40" : ""}`}>
                    <td className="py-1.5 px-2 text-center">
                      <input type="checkbox" checked={!row.skip}
                        onChange={e => setUploadRows(rows => rows.map((r, j) => j === i ? { ...r, skip: !e.target.checked } : r))} />
                    </td>
                    <td className="py-1.5 px-2 whitespace-nowrap text-muted-foreground">{row.transactionDate}</td>
                    <td className="py-1.5 px-2">
                      <Input className="h-7 text-xs" value={row.merchant}
                        onChange={e => setUploadRows(rows => rows.map((r, j) => j === i ? { ...r, merchant: e.target.value } : r))} />
                    </td>
                    <td className="py-1.5 px-2 text-right font-semibold text-red-500">{row.amount.toLocaleString("ko-KR")}</td>
                    <td className="py-1.5 px-2">
                      <Input className="h-7 text-xs w-28" value={row.cardName}
                        onChange={e => setUploadRows(rows => rows.map((r, j) => j === i ? { ...r, cardName: e.target.value } : r))} />
                    </td>
                    <td className="py-1.5 px-2">
                      <select className="h-7 text-xs rounded border border-input bg-background px-2" value={row.category}
                        onChange={e => setUploadRows(rows => rows.map((r, j) => j === i ? { ...r, category: e.target.value } : r))}>
                        <option value="">선택</option>
                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </td>
                    <td className="py-1.5 px-2">
                      <Input className="h-7 text-xs w-32" value={row.note}
                        onChange={e => setUploadRows(rows => rows.map((r, j) => j === i ? { ...r, note: e.target.value } : r))} />
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
