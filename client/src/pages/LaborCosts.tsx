import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Users, AlertCircle, ExternalLink, ArrowUpFromLine } from "lucide-react";
import ExcelJS from "exceljs";
import { CurrencyInput } from "@/components/ui/currency-input";

const fmt = (n: number) => n.toLocaleString("ko-KR") + "원";
const todayStr = () => new Date().toISOString().slice(0, 10);

type LaborCost = {
  id: number;
  freelancerName: string;
  description: string | null;
  grossAmount: number;
  withholdingRate: string;
  withholdingAmount: number;
  netAmount: number;
  paymentDate: string | null;
  reportDate: string | null;
  taxPaymentDate: string | null;
  taxPaymentAccount: string | null;
  linkedExpenseId: number | null;
  note: string | null;
};

type AccountRow = {
  id: number;
  bankName: string;
  accountType: string;
  accountNumber: string | null;
};

type FormState = {
  freelancerName: string;
  description: string;
  grossAmount: number;
  withholdingRateStr: string;
  paymentDate: string;
  reportDate: string;
  taxPaymentDate: string;
  taxPaymentAccount: string;
  note: string;
};

const defaultForm = (): FormState => ({
  freelancerName: "",
  description: "",
  grossAmount: 0,
  withholdingRateStr: "3.3",
  paymentDate: todayStr(),
  reportDate: "",
  taxPaymentDate: "",
  taxPaymentAccount: "",
  note: "",
});

function calcWithholding(gross: number, rateStr: string) {
  const rate = parseFloat(rateStr) || 0;
  const incomeTax = Math.round(gross * 3 / 100);
  const localTax = Math.round(gross * 0.3 / 100);
  const withholding = Math.round(gross * rate / 100);
  return { withholdingAmount: withholding, netAmount: gross - withholding, incomeTax, localTax };
}

function StatusBadge({ paymentDate, reportDate, taxPaymentDate }: Pick<LaborCost, "paymentDate" | "reportDate" | "taxPaymentDate">) {
  if (taxPaymentDate) return <Badge className="bg-emerald-500 hover:bg-emerald-500 text-xs">납부완료</Badge>;
  if (reportDate) return <Badge className="bg-blue-500 hover:bg-blue-500 text-xs">신고완료</Badge>;
  if (paymentDate) return <Badge variant="secondary" className="text-xs">지급완료</Badge>;
  return <Badge variant="outline" className="text-xs text-muted-foreground">미지급</Badge>;
}

function LaborCostDialog({
  open, onClose, editing, onSave, accountList,
}: {
  open: boolean;
  onClose: () => void;
  editing: LaborCost | null;
  onSave: (form: FormState) => void;
  accountList: AccountRow[];
}) {
  const [form, setForm] = useState<FormState>(
    editing
      ? {
          freelancerName: editing.freelancerName,
          description: editing.description ?? "",
          grossAmount: editing.grossAmount,
          withholdingRateStr: editing.withholdingRate,
          paymentDate: editing.paymentDate ?? "",
          reportDate: editing.reportDate ?? "",
          taxPaymentDate: editing.taxPaymentDate ?? "",
          taxPaymentAccount: editing.taxPaymentAccount ?? "",
          note: editing.note ?? "",
        }
      : defaultForm()
  );
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm(f => ({ ...f, [k]: v }));

  const { withholdingAmount, netAmount, incomeTax, localTax } = calcWithholding(form.grossAmount, form.withholdingRateStr);

  const accountOptions = accountList.map(a =>
    `${a.bankName} ${a.accountType}${a.accountNumber ? ` (${a.accountNumber.slice(-4)})` : ""}`
  );

  function handleTaxPaymentDateChange(val: string) {
    if (val && form.reportDate && val < form.reportDate) {
      toast.error("납부일은 신고일보다 이전일 수 없습니다");
      return;
    }
    set("taxPaymentDate", val);
  }

  function handleReportDateChange(val: string) {
    if (val && form.taxPaymentDate && val > form.taxPaymentDate) {
      toast.error("신고일은 납부일보다 이후일 수 없습니다");
      return;
    }
    set("reportDate", val);
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "인건비 수정" : "인건비 추가"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>프리랜서 이름 *</Label>
              <Input placeholder="예: 홍길동" value={form.freelancerName} onChange={e => set("freelancerName", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>업무 내용</Label>
              <Input placeholder="예: 디자인 작업, 영상 편집" value={form.description} onChange={e => set("description", e.target.value)} />
            </div>
          </div>

          <div className="space-y-1">
            <Label>총 지급액 (세전) *</Label>
            <CurrencyInput value={form.grossAmount} onChange={v => set("grossAmount", v)} placeholder="세전 금액 입력" />
          </div>

          <div className="space-y-1">
            <Label>원천징수율 (%)</Label>
            <div className="flex items-center gap-2">
              <Input
                value={form.withholdingRateStr}
                onChange={e => set("withholdingRateStr", e.target.value)}
                className="w-24"
                placeholder="3.3"
              />
              <span className="text-sm text-muted-foreground">%</span>
              <span className="text-xs text-muted-foreground ml-1">(소득세 3% + 지방소득세 0.3%)</span>
            </div>
          </div>

          {form.grossAmount > 0 && (
            <div className="rounded-lg bg-muted/50 p-3 space-y-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">원천징수액 합계</p>
                  <p className="font-bold text-red-500">{fmt(withholdingAmount)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">실지급액</p>
                  <p className="font-bold text-emerald-600">{fmt(netAmount)}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border/50">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">소득세 (3%)</p>
                  <p className="text-sm font-semibold text-red-400">{fmt(incomeTax)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">지방소득세 (0.3%)</p>
                  <p className="text-sm font-semibold text-red-400">{fmt(localTax)}</p>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-3 rounded-lg border border-border p-3">
            <p className="text-xs font-semibold text-foreground">처리 일자</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">지급일</Label>
                <Input type="date" value={form.paymentDate} onChange={e => set("paymentDate", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">신고일</Label>
                <Input type="date" value={form.reportDate} onChange={e => handleReportDateChange(e.target.value)} />
                <p className="text-[10px] text-muted-foreground">원천징수이행상황신고서</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">납부일</Label>
                <Input
                  type="date"
                  value={form.taxPaymentDate}
                  min={form.reportDate || undefined}
                  onChange={e => handleTaxPaymentDateChange(e.target.value)}
                />
                {form.reportDate && <p className="text-[10px] text-muted-foreground">신고일({form.reportDate}) 이후만 선택 가능</p>}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">납부 계좌</Label>
                <select
                  value={form.taxPaymentAccount}
                  onChange={e => set("taxPaymentAccount", e.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  disabled={!form.taxPaymentDate}
                >
                  <option value="">선택 안 함</option>
                  {accountOptions.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
                {!form.taxPaymentDate && (
                  <p className="text-[10px] text-muted-foreground">납부일 입력 후 선택 가능</p>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <Label>메모</Label>
            <Input placeholder="참고사항" value={form.note} onChange={e => set("note", e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button
            onClick={() => {
              if (!form.freelancerName.trim()) { toast.error("이름을 입력하세요"); return; }
              if (form.grossAmount <= 0) { toast.error("지급액을 입력하세요"); return; }
              if (form.reportDate && form.taxPaymentDate && form.taxPaymentDate < form.reportDate) {
                toast.error("납부일은 신고일보다 이전일 수 없습니다");
                return;
              }
              onSave(form);
            }}
          >
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function LaborCosts() {
  const utils = trpc.useUtils();
  const { data: list = [], isLoading } = trpc.laborCost.list.useQuery();
  const { data: accountList = [] } = trpc.account.list.useQuery();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<LaborCost | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [filterStatus, setFilterStatus] = useState<"전체" | "미신고" | "미납부">("전체");

  const createMutation = trpc.laborCost.create.useMutation({
    onSuccess: () => { utils.laborCost.list.invalidate(); toast.success("인건비가 추가되었습니다"); setDialogOpen(false); },
    onError: e => toast.error(e.message),
  });
  const updateMutation = trpc.laborCost.update.useMutation({
    onSuccess: () => { utils.laborCost.list.invalidate(); toast.success("수정되었습니다"); setDialogOpen(false); setEditing(null); },
    onError: e => toast.error(e.message),
  });
  const deleteMutation = trpc.laborCost.delete.useMutation({
    onSuccess: () => { utils.laborCost.list.invalidate(); toast.success("삭제되었습니다"); setDeleteId(null); },
    onError: e => toast.error(e.message),
  });

  function handleSave(form: FormState) {
    const { withholdingAmount, netAmount } = calcWithholding(form.grossAmount, form.withholdingRateStr);
    const payload = {
      freelancerName: form.freelancerName,
      description: form.description || null,
      grossAmount: form.grossAmount,
      withholdingRate: form.withholdingRateStr,
      withholdingAmount,
      netAmount,
      paymentDate: form.paymentDate || null,
      reportDate: form.reportDate || null,
      taxPaymentDate: form.taxPaymentDate || null,
      taxPaymentAccount: form.taxPaymentAccount || null,
      note: form.note || null,
    };
    if (editing) updateMutation.mutate({ id: editing.id, data: payload });
    else createMutation.mutate(payload);
  }

  const rows = list as LaborCost[];

  const filtered = useMemo(() => {
    if (filterStatus === "미신고") return rows.filter(r => r.paymentDate && !r.reportDate);
    if (filterStatus === "미납부") return rows.filter(r => r.reportDate && !r.taxPaymentDate);
    return rows;
  }, [rows, filterStatus]);

  const totalGross = rows.reduce((s, r) => s + r.grossAmount, 0);
  const totalWithholding = rows.reduce((s, r) => s + r.withholdingAmount, 0);
  const totalNet = rows.reduce((s, r) => s + r.netAmount, 0);
  const unreportedCount = rows.filter(r => r.paymentDate && !r.reportDate).length;
  const unpaidCount = rows.filter(r => r.reportDate && !r.taxPaymentDate).length;

  async function handleExport() {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("인건비");

    const columns = [
      { header: "이름", key: "name", width: 14 },
      { header: "업무 내용", key: "desc", width: 22 },
      { header: "총 지급액(세전)", key: "gross", width: 16 },
      { header: "원천징수율(%)", key: "rate", width: 14 },
      { header: "소득세(3%)", key: "income", width: 14 },
      { header: "지방소득세(0.3%)", key: "local", width: 16 },
      { header: "원천징수액 합계", key: "withholding", width: 16 },
      { header: "실지급액", key: "net", width: 14 },
      { header: "지급일", key: "payDate", width: 13 },
      { header: "신고일", key: "reportDate", width: 13 },
      { header: "납부일", key: "taxDate", width: 13 },
      { header: "납부계좌", key: "account", width: 22 },
      { header: "상태", key: "status", width: 10 },
      { header: "메모", key: "note", width: 22 },
    ];
    ws.columns = columns;

    // 헤더 행 스타일
    const headerRow = ws.getRow(1);
    headerRow.eachCell(cell => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } };
      cell.font = { bold: true, size: 10 };
      cell.alignment = { vertical: "middle", horizontal: "center" };
      cell.border = {
        bottom: { style: "thin", color: { argb: "FFB0B0B0" } },
      };
    });
    headerRow.height = 20;

    const numFmt = "#,##0";
    const numCols = ["gross", "income", "local", "withholding", "net"];

    filtered.forEach(r => {
      const row = ws.addRow({
        name: r.freelancerName,
        desc: r.description ?? "",
        gross: r.grossAmount,
        rate: r.withholdingRate,
        income: Math.round(r.grossAmount * 3 / 100),
        local: Math.round(r.grossAmount * 0.3 / 100),
        withholding: r.withholdingAmount,
        net: r.netAmount,
        payDate: r.paymentDate ?? "",
        reportDate: r.reportDate ?? "",
        taxDate: r.taxPaymentDate ?? "",
        account: r.taxPaymentAccount ?? "",
        status: r.taxPaymentDate ? "납부완료" : r.reportDate ? "신고완료" : r.paymentDate ? "지급완료" : "미지급",
        note: r.note ?? "",
      });
      // 숫자 컬럼 콤마 포맷
      numCols.forEach(key => {
        const col = columns.findIndex(c => c.key === key) + 1;
        const cell = row.getCell(col);
        cell.numFmt = numFmt;
        cell.alignment = { horizontal: "right" };
      });
    });

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `인건비_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">인건비 관리</h1>
          <p className="text-sm text-muted-foreground mt-0.5">프리랜서 지급·신고·납부 현황을 관리합니다</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExport} disabled={filtered.length === 0}>
            <ArrowUpFromLine className="w-3.5 h-3.5" />
            엑셀 내보내기
          </Button>
          <a
            href="https://www.hometax.go.kr"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="outline" size="sm" className="gap-1.5">
              <ExternalLink className="w-3.5 h-3.5" />
              홈택스
            </Button>
          </a>
          <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Plus className="w-4 h-4 mr-2" /> 인건비 추가
          </Button>
        </div>
      </div>

      {/* 미처리 알림 배너 */}
      {(unreportedCount > 0 || unpaidCount > 0) && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4 space-y-2">
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-semibold text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            처리가 필요한 인건비 항목이 있습니다
          </div>
          <div className="flex flex-col gap-1.5 pl-6">
            {unreportedCount > 0 && (
              <div className="text-sm text-amber-700 dark:text-amber-400">
                <span className="font-semibold">미신고 {unreportedCount}건</span>
                <span className="text-amber-600 dark:text-amber-500 ml-2">— 지급 완료 후 신고가 이루어지지 않은 건입니다. 홈택스에서 원천징수이행상황신고서를 제출하세요.</span>
              </div>
            )}
            {unpaidCount > 0 && (
              <div className="text-sm text-red-600 dark:text-red-400">
                <span className="font-semibold">미납부 {unpaidCount}건</span>
                <span className="text-red-500 dark:text-red-400 ml-2">— 신고 후 세금 납부가 완료되지 않은 건입니다. 홈택스에서 납부하세요.</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">총 지급액 (세전)</p>
            <p className="text-xl font-bold mt-1">{fmt(totalGross)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">총 원천징수액</p>
            <p className="text-xl font-bold text-red-500 mt-1">{fmt(totalWithholding)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">총 실지급액</p>
            <p className="text-xl font-bold text-emerald-600 mt-1">{fmt(totalNet)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start gap-2">
              {(unreportedCount > 0 || unpaidCount > 0) && (
                <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
              )}
              <div>
                <p className="text-xs text-muted-foreground">미처리</p>
                <p className="text-sm font-semibold mt-1">
                  {unreportedCount > 0 && <span className="text-amber-500">미신고 {unreportedCount}건</span>}
                  {unreportedCount > 0 && unpaidCount > 0 && " · "}
                  {unpaidCount > 0 && <span className="text-red-500">미납부 {unpaidCount}건</span>}
                  {unreportedCount === 0 && unpaidCount === 0 && <span className="text-muted-foreground">없음</span>}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 필터 */}
      <div className="flex gap-2">
        {(["전체", "미신고", "미납부"] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilterStatus(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filterStatus === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {f}
            {f === "미신고" && unreportedCount > 0 && (
              <span className="ml-1.5 bg-amber-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{unreportedCount}</span>
            )}
            {f === "미납부" && unpaidCount > 0 && (
              <span className="ml-1.5 bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{unpaidCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* 테이블 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-4 h-4" /> 인건비 내역 ({filtered.length}건)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-center text-muted-foreground py-8">불러오는 중...</p>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-muted-foreground">인건비 내역이 없습니다</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => { setEditing(null); setDialogOpen(true); }}>
                <Plus className="w-3.5 h-3.5 mr-1" /> 추가하기
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2 px-3 font-medium">이름</th>
                    <th className="text-left py-2 px-3 font-medium">업무 내용</th>
                    <th className="text-right py-2 px-3 font-medium">총 지급액</th>
                    <th className="text-right py-2 px-3 font-medium">원천징수</th>
                    <th className="text-right py-2 px-3 font-medium">실지급액</th>
                    <th className="text-center py-2 px-3 font-medium">지급일</th>
                    <th className="text-center py-2 px-3 font-medium">신고일</th>
                    <th className="text-center py-2 px-3 font-medium">납부일</th>
                    <th className="text-left py-2 px-3 font-medium">납부계좌</th>
                    <th className="text-center py-2 px-3 font-medium">상태</th>
                    <th className="py-2 px-3" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => (
                    <tr key={r.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 px-3 font-medium">{r.freelancerName}</td>
                      <td className="py-2.5 px-3 text-muted-foreground">{r.description ?? "—"}</td>
                      <td className="py-2.5 px-3 text-right">{fmt(r.grossAmount)}</td>
                      <td className="py-2.5 px-3 text-right text-red-500">
                        <div>{fmt(r.withholdingAmount)}<span className="text-xs text-muted-foreground ml-1">({r.withholdingRate}%)</span></div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          소득세 {fmt(Math.round(r.grossAmount * 3 / 100))} · 지방 {fmt(Math.round(r.grossAmount * 0.3 / 100))}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-semibold text-emerald-600">
                        <div>{fmt(r.netAmount)}</div>
                        {r.linkedExpenseId && (
                          <div className="text-[10px] text-blue-500 font-normal mt-0.5">사업비용 반영됨</div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center text-muted-foreground">{r.paymentDate ?? "—"}</td>
                      <td className="py-2.5 px-3 text-center text-muted-foreground">{r.reportDate ?? "—"}</td>
                      <td className="py-2.5 px-3 text-center text-muted-foreground">{r.taxPaymentDate ?? "—"}</td>
                      <td className="py-2.5 px-3 text-muted-foreground text-xs">{r.taxPaymentAccount ?? "—"}</td>
                      <td className="py-2.5 px-3 text-center">
                        <StatusBadge paymentDate={r.paymentDate} reportDate={r.reportDate} taxPaymentDate={r.taxPaymentDate} />
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex gap-1 justify-end">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditing(r); setDialogOpen(true); }}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteId(r.id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-muted/30">
                    <td colSpan={2} className="py-2 px-3 font-semibold text-muted-foreground">합계</td>
                    <td className="py-2 px-3 text-right font-bold">{fmt(filtered.reduce((s, r) => s + r.grossAmount, 0))}</td>
                    <td className="py-2 px-3 text-right font-bold text-red-500">{fmt(filtered.reduce((s, r) => s + r.withholdingAmount, 0))}</td>
                    <td className="py-2 px-3 text-right font-bold text-emerald-600">{fmt(filtered.reduce((s, r) => s + r.netAmount, 0))}</td>
                    <td colSpan={6} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {dialogOpen && (
        <LaborCostDialog
          key={editing ? `edit-${editing.id}` : "new"}
          open={dialogOpen}
          onClose={() => { setDialogOpen(false); setEditing(null); }}
          editing={editing}
          onSave={handleSave}
          accountList={accountList as AccountRow[]}
        />
      )}

      <Dialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>인건비 삭제</DialogTitle></DialogHeader>
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
