import { CurrencyInput } from "@/components/ui/currency-input";
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ChevronLeft, ChevronRight, TrendingUp, Repeat, Zap } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";

const PRESET_COLORS = [
  "#5b7cfa", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6",
  "#06b6d4", "#f97316", "#84cc16", "#ec4899", "#6b7280",
];

const fmt = (n: number) => n.toLocaleString("ko-KR");

// ─── 카테고리 다이얼로그 ──────────────────────────────────────────────────────
function CategoryDialog({
  open, onClose, initial,
}: {
  open: boolean;
  onClose: () => void;
  initial?: { id: number; name: string; color: string } | null;
}) {
  const utils = trpc.useUtils();
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState(initial?.color ?? PRESET_COLORS[0]);

  const create = trpc.sideIncomeCategory.create.useMutation({
    onSuccess: () => { utils.sideIncomeCategory.list.invalidate(); toast.success("카테고리 추가 완료"); onClose(); },
    onError: (e) => toast.error(e.message),
  });
  const update = trpc.sideIncomeCategory.update.useMutation({
    onSuccess: () => { utils.sideIncomeCategory.list.invalidate(); toast.success("카테고리 수정 완료"); onClose(); },
    onError: (e) => toast.error(e.message),
  });

  const handleSave = () => {
    if (!name.trim()) { toast.error("카테고리명을 입력해주세요"); return; }
    if (initial) update.mutate({ id: initial.id, data: { name, color } });
    else create.mutate({ name, color });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{initial ? "카테고리 수정" : "카테고리 추가"}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>카테고리명</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="예: 블로그, 유튜브, 프리랜서" />
          </div>
          <div className="space-y-1.5">
            <Label>색상</Label>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className="w-7 h-7 rounded-full border-2 transition-all"
                  style={{ backgroundColor: c, borderColor: color === c ? "#1e293b" : "transparent" }}
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button onClick={handleSave} disabled={create.isPending || update.isPending}>저장</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── 부수입 입력 다이얼로그 ──────────────────────────────────────────────────
type SideIncomeForm = {
  incomeDate: string;
  categoryId: string;
  amount: number;
  description: string;
  isRegular: boolean;
  note: string;
};

const emptyForm = (): SideIncomeForm => ({
  incomeDate: new Date().toISOString().slice(0, 10),
  categoryId: "",
  amount: 0,
  description: "",
  isRegular: false,
  note: "",
});

function SideIncomeDialog({
  open, onClose, initial, year, month, categories,
}: {
  open: boolean;
  onClose: () => void;
  initial?: { id: number } & SideIncomeForm | null;
  year: number;
  month: number;
  categories: { id: number; name: string; color: string }[];
}) {
  const utils = trpc.useUtils();
  const [form, setForm] = useState<SideIncomeForm>(initial ?? emptyForm());

  const invalidate = () => {
    utils.sideIncome.list.invalidate({ year, month });
    utils.sideIncome.yearlySummary.invalidate({ year });
  };

  const create = trpc.sideIncome.create.useMutation({
    onSuccess: () => { invalidate(); toast.success("부수입 추가 완료 (가계부 자동 반영)"); onClose(); },
    onError: (e) => toast.error(e.message),
  });
  const update = trpc.sideIncome.update.useMutation({
    onSuccess: () => { invalidate(); toast.success("부수입 수정 완료"); onClose(); },
    onError: (e) => toast.error(e.message),
  });

  const set = (k: keyof SideIncomeForm, v: string | boolean | number) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = () => {
    if (!form.incomeDate) { toast.error("날짜를 입력해주세요"); return; }
    if (!form.amount || form.amount <= 0) { toast.error("금액을 입력해주세요"); return; }
    const cat = categories.find(c => c.id === Number(form.categoryId));
    const d = new Date(form.incomeDate);
    const payload = {
      incomeDate: form.incomeDate,
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      categoryId: cat?.id,
      categoryName: cat?.name,
      amount: form.amount,
      description: form.description || undefined,
      isRegular: form.isRegular,
      note: form.note || undefined,
    };
    if (initial) update.mutate({ id: initial.id, data: payload });
    else create.mutate(payload);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{initial ? "부수입 수정" : "부수입 추가"}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>날짜</Label>
              <Input type="date" value={form.incomeDate} onChange={e => set("incomeDate", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>금액 (원)</Label>
              <CurrencyInput value={form.amount} onChange={(v) => set("amount", v)} placeholder="0" suffix="원" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>카테고리</Label>
            <Select value={form.categoryId} onValueChange={v => set("categoryId", v)}>
              <SelectTrigger><SelectValue placeholder="카테고리 선택" /></SelectTrigger>
              <SelectContent>
                {categories.map(c => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    <span className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: c.color }} />
                      {c.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>내용</Label>
            <Input value={form.description} onChange={e => set("description", e.target.value)} placeholder="수입 내용" />
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={form.isRegular} onCheckedChange={v => set("isRegular", v)} id="isRegular" />
            <Label htmlFor="isRegular" className="cursor-pointer">
              정기 수입 <span className="text-muted-foreground text-xs">(정기적으로 발생하는 수입)</span>
            </Label>
          </div>
          <div className="space-y-1.5">
            <Label>비고</Label>
            <Textarea value={form.note} onChange={e => set("note", e.target.value)} rows={2} placeholder="메모" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button onClick={handleSave} disabled={create.isPending || update.isPending}>저장</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── 메인 페이지 ─────────────────────────────────────────────────────────────
export default function SideIncome() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [catDialog, setCatDialog] = useState<{ open: boolean; item?: { id: number; name: string; color: string } | null }>({ open: false });
  const [incomeDialog, setIncomeDialog] = useState<{ open: boolean; item?: ({ id: number } & SideIncomeForm) | null }>({ open: false });

  const { data: categories = [] } = trpc.sideIncomeCategory.list.useQuery();
  const { data: incomes = [], isLoading } = trpc.sideIncome.list.useQuery({ year, month });
  const { data: yearlySummary = [] } = trpc.sideIncome.yearlySummary.useQuery({ year });

  const utils = trpc.useUtils();
  const deleteIncome = trpc.sideIncome.delete.useMutation({
    onSuccess: () => {
      utils.sideIncome.list.invalidate({ year, month });
      utils.sideIncome.yearlySummary.invalidate({ year });
      toast.success("삭제 완료");
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteCat = trpc.sideIncomeCategory.delete.useMutation({
    onSuccess: () => { utils.sideIncomeCategory.list.invalidate(); toast.success("카테고리 삭제 완료"); },
    onError: (e) => toast.error(e.message),
  });

  // 이번 달 집계
  const totalAmount = incomes.reduce((s, i) => s + (i.amount ?? 0), 0);
  const regularAmount = incomes.filter(i => i.isRegular).reduce((s, i) => s + (i.amount ?? 0), 0);
  const irregularAmount = totalAmount - regularAmount;

  // 카테고리별 집계
  const categoryChart = useMemo(() => {
    const map: Record<string, { name: string; amount: number; color: string }> = {};
    for (const inc of incomes) {
      const key = inc.categoryName ?? "미분류";
      const cat = categories.find(c => c.name === key);
      if (!map[key]) map[key] = { name: key, amount: 0, color: cat?.color ?? "#6b7280" };
      map[key].amount += inc.amount ?? 0;
    }
    return Object.values(map).sort((a, b) => b.amount - a.amount);
  }, [incomes, categories]);

  // 월별 합계 (연간 차트)
  const monthlyChart = useMemo(() => {
    const map: Record<number, number> = {};
    for (let m = 1; m <= 12; m++) map[m] = 0;
    for (const inc of yearlySummary) map[inc.month] = (map[inc.month] ?? 0) + (inc.amount ?? 0);
    return Array.from({ length: 12 }, (_, i) => ({ month: `${i + 1}월`, amount: map[i + 1] ?? 0 }));
  }, [yearlySummary]);

  // 정기/비정기 파이
  const regularChart = [
    { name: "정기", value: regularAmount, color: "#5b7cfa" },
    { name: "비정기", value: irregularAmount, color: "#f59e0b" },
  ].filter(d => d.value > 0);

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  };

  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>부수입 관리</h1>
          <p className="text-sm text-muted-foreground mt-0.5">날짜별 부수입을 기록하고 가계부에 자동 반영합니다</p>
        </div>
        <Button onClick={() => setIncomeDialog({ open: true, item: null })} className="gap-1.5">
          <Plus className="w-4 h-4" /> 부수입 추가
        </Button>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10"><TrendingUp className="w-5 h-5 text-primary" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">{month}월 총 부수입</p>
                  <p className="text-xl font-bold text-foreground">₩{fmt(totalAmount)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10"><Repeat className="w-5 h-5 text-blue-500" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">정기 수입</p>
                  <p className="text-xl font-bold text-foreground">₩{fmt(regularAmount)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/10"><Zap className="w-5 h-5 text-amber-500" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">비정기 수입</p>
                  <p className="text-xl font-bold text-foreground">₩{fmt(irregularAmount)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

      <Tabs defaultValue="monthly">
          <TabsList>
            <TabsTrigger value="monthly">월별 내역</TabsTrigger>
            <TabsTrigger value="chart">그래프</TabsTrigger>
            <TabsTrigger value="categories">카테고리 관리</TabsTrigger>
          </TabsList>

          {/* ─── 월별 내역 탭 ─── */}
          <TabsContent value="monthly" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    {year}년 {month}월 부수입 내역
                  </CardTitle>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={prevMonth}><ChevronLeft className="w-4 h-4" /></Button>
                    <span className="text-sm font-medium w-20 text-center">{year}.{String(month).padStart(2, "0")}</span>
                    <Button variant="ghost" size="icon" onClick={nextMonth}><ChevronRight className="w-4 h-4" /></Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <p className="text-center text-muted-foreground py-8">불러오는 중...</p>
                ) : incomes.length === 0 ? (
                  <div className="text-center py-12">
                    <TrendingUp className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                    <p className="text-muted-foreground">이번 달 부수입 내역이 없습니다</p>
                    <Button variant="outline" size="sm" className="mt-3" onClick={() => setIncomeDialog({ open: true, item: null })}>
                      <Plus className="w-3.5 h-3.5 mr-1" /> 추가하기
                    </Button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          <th className="text-left py-2 px-3 font-medium">날짜</th>
                          <th className="text-left py-2 px-3 font-medium">카테고리</th>
                          <th className="text-left py-2 px-3 font-medium">내용</th>
                          <th className="text-right py-2 px-3 font-medium">금액</th>
                          <th className="text-center py-2 px-3 font-medium">구분</th>
                          <th className="text-left py-2 px-3 font-medium">비고</th>
                          <th className="py-2 px-3" />
                        </tr>
                      </thead>
                      <tbody>
                        {incomes.map(inc => {
                          const cat = categories.find(c => c.name === inc.categoryName);
                          return (
                            <tr key={inc.id} className="border-b hover:bg-muted/30 transition-colors">
                              <td className="py-2.5 px-3 text-muted-foreground">{String(inc.incomeDate)}</td>
                              <td className="py-2.5 px-3">
                                {inc.categoryName ? (
                                  <span className="flex items-center gap-1.5">
                                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cat?.color ?? "#6b7280" }} />
                                    {inc.categoryName}
                                  </span>
                                ) : <span className="text-muted-foreground">-</span>}
                              </td>
                              <td className="py-2.5 px-3">{inc.description ?? "-"}</td>
                              <td className="py-2.5 px-3 text-right font-semibold text-emerald-600">+₩{fmt(inc.amount ?? 0)}</td>
                              <td className="py-2.5 px-3 text-center">
                                <Badge variant={inc.isRegular ? "default" : "secondary"} className="text-xs">
                                  {inc.isRegular ? "정기" : "비정기"}
                                </Badge>
                              </td>
                              <td className="py-2.5 px-3 text-muted-foreground text-xs max-w-[120px] truncate">{inc.note ?? "-"}</td>
                              <td className="py-2.5 px-3">
                                <div className="flex gap-1">
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIncomeDialog({
                                    open: true,
                                    item: {
                                      id: inc.id,
                                      incomeDate: String(inc.incomeDate),
                                      categoryId: inc.categoryId ? String(inc.categoryId) : "",
                                      amount: inc.amount ?? 0,
                                      description: inc.description ?? "",
                                      isRegular: inc.isRegular ?? false,
                                      note: inc.note ?? "",
                                    },
                                  })}>
                                    <Pencil className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                                    onClick={() => { if (confirm("삭제하시겠습니까? 가계부 연동 항목도 함께 삭제됩니다.")) deleteIncome.mutate({ id: inc.id }); }}>
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-muted/30">
                          <td colSpan={3} className="py-2.5 px-3 font-semibold text-right">합계</td>
                          <td className="py-2.5 px-3 text-right font-bold text-emerald-600">+₩{fmt(totalAmount)}</td>
                          <td colSpan={3} />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── 그래프 탭 ─── */}
          <TabsContent value="chart" className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {/* 연간 월별 바 차트 */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{year}년 월별 부수입</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={monthlyChart} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={v => `${(v / 10000).toFixed(0)}만`} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: number) => [`₩${fmt(v)}`, "부수입"]} />
                      <Bar dataKey="amount" fill="#5b7cfa" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* 정기/비정기 파이 차트 */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{month}월 정기 / 비정기 비율</CardTitle>
                </CardHeader>
                <CardContent>
                  {regularChart.length === 0 ? (
                    <div className="flex items-center justify-center h-[220px] text-muted-foreground text-sm">데이터 없음</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie data={regularChart} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                          {regularChart.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                        </Pie>
                        <Tooltip formatter={(v: number) => `₩${fmt(v)}`} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* 카테고리별 바 차트 */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{month}월 카테고리별 부수입</CardTitle>
              </CardHeader>
              <CardContent>
                {categoryChart.length === 0 ? (
                  <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">데이터 없음</div>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={categoryChart} layout="vertical" margin={{ top: 5, right: 30, left: 60, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis type="number" tickFormatter={v => `${(v / 10000).toFixed(0)}만`} tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} />
                      <Tooltip formatter={(v: number) => [`₩${fmt(v)}`, "금액"]} />
                      <Bar dataKey="amount" radius={[0, 4, 4, 0]}>
                        {categoryChart.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── 카테고리 관리 탭 ─── */}
          <TabsContent value="categories" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">카테고리 관리</CardTitle>
                  <Button size="sm" onClick={() => setCatDialog({ open: true, item: null })}>
                    <Plus className="w-3.5 h-3.5 mr-1" /> 카테고리 추가
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {categories.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground">
                    <p>카테고리가 없습니다. 추가해주세요.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {categories.map(cat => (
                      <div key={cat.id} className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors">
                        <div className="flex items-center gap-2.5">
                          <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color ?? undefined }} />
                          <span className="font-medium text-sm">{cat.name}</span>
                        </div>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7"
                            onClick={() => setCatDialog({ open: true, item: { id: cat.id, name: cat.name, color: cat.color ?? "#5b7cfa" } as { id: number; name: string; color: string } })}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => { if (confirm(`"${cat.name}" 카테고리를 삭제하시겠습니까?`)) deleteCat.mutate({ id: cat.id }); }}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      {/* 다이얼로그 */}
      <CategoryDialog
        key={catDialog.item?.id ?? "new-cat"}
        open={catDialog.open}
        onClose={() => setCatDialog({ open: false })}
        initial={catDialog.item}
      />
      <SideIncomeDialog
        key={incomeDialog.item?.id ?? "new-income"}
        open={incomeDialog.open}
        onClose={() => setIncomeDialog({ open: false })}
        initial={incomeDialog.item}
        year={year}
        month={month}
        categories={categories as { id: number; name: string; color: string }[]}
      />
    </div>
  );
}
