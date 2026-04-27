import { CurrencyInput } from "@/components/ui/currency-input";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { formatAmount } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, CheckCircle2, Circle } from "lucide-react";

const CAMPAIGN_TYPES = ["방문형", "배송형", "원고형", "기타"];
const CATEGORIES = ["카페", "맛집", "숙소", "뷰티", "생활용품", "식품", "기타"];

const EMPTY_FORM = {
  platform: "", campaignType: "방문형", category: "카페", businessName: "",
  amount: 0, startDate: "", endDate: "", visitDate: "", reviewDone: false, completed: false, note: "",
};

type Campaign = {
  id: number;
  platform: string | null;
  campaignType: string | null;
  category: string | null;
  businessName: string | null;
  amount: number | null;
  startDate: string | null;
  endDate: string | null;
  visitDate: string | null;
  reviewDone: boolean;
  completed: boolean;
  note: string | null;
};

export default function BlogCampaigns() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [filterCompleted, setFilterCompleted] = useState<"전체" | "진행중" | "완료">("전체");

  const utils = trpc.useUtils();
  const { data: campaigns = [], isLoading } = trpc.blogCampaign.list.useQuery();

  const createMutation = trpc.blogCampaign.create.useMutation({
    onSuccess: () => { utils.blogCampaign.list.invalidate(); toast.success("추가되었습니다"); setDialogOpen(false); },
    onError: () => toast.error("추가 실패"),
  });
  const updateMutation = trpc.blogCampaign.update.useMutation({
    onSuccess: () => { utils.blogCampaign.list.invalidate(); toast.success("수정되었습니다"); setDialogOpen(false); },
    onError: () => toast.error("수정 실패"),
  });
  const deleteMutation = trpc.blogCampaign.delete.useMutation({
    onSuccess: () => { utils.blogCampaign.list.invalidate(); toast.success("삭제되었습니다"); },
    onError: () => toast.error("삭제 실패"),
  });
  const toggleReviewMutation = trpc.blogCampaign.update.useMutation({
    onSuccess: () => utils.blogCampaign.list.invalidate(),
  });

  const filtered = campaigns.filter(c => {
    if (filterCompleted === "진행중") return !c.completed;
    if (filterCompleted === "완료") return c.completed;
    return true;
  });

  const totalAmount = campaigns.reduce((s, c) => s + (c.amount ?? 0), 0);
  const completedCount = campaigns.filter(c => c.completed).length;
  const reviewDoneCount = campaigns.filter(c => c.reviewDone).length;

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setDialogOpen(true);
  };

  const openEdit = (c: Campaign) => {
    setEditing(c);
    setForm({
      platform: c.platform ?? "",
      campaignType: c.campaignType ?? "방문형",
      category: c.category ?? "카페",
      businessName: c.businessName ?? "",
      amount: c.amount ?? 0,
      startDate: c.startDate ?? "",
      endDate: c.endDate ?? "",
      visitDate: c.visitDate ?? "",
      reviewDone: c.reviewDone,
      completed: c.completed,
      note: c.note ?? "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    const data = {
      platform: form.platform || undefined,
      campaignType: form.campaignType || undefined,
      category: form.category || undefined,
      businessName: form.businessName || undefined,
      amount: form.amount || undefined,
      startDate: form.startDate || undefined,
      endDate: form.endDate || undefined,
      visitDate: form.visitDate || undefined,
      reviewDone: form.reviewDone,
      completed: form.completed,
      note: form.note || undefined,
    };
    if (editing) {
      updateMutation.mutate({ id: editing.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const typeColors: Record<string, string> = {
    "방문형": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    "배송형": "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
    "원고형": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    "기타": "bg-muted text-muted-foreground",
  };

  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>블로그 체험단</h1>
          <p className="text-sm text-muted-foreground mt-0.5">체험단 활동 기록 및 관리</p>
        </div>
        <Button onClick={openCreate} size="sm" className="gap-1.5">
          <Plus className="w-4 h-4" /> 체험단 추가
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">총 체험단 수</p>
          <p className="text-xl font-bold">{campaigns.length}건</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">완료 / 리뷰 완료</p>
          <p className="text-xl font-bold">{completedCount} / {reviewDoneCount}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">총 혜택 금액</p>
          <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">₩{formatAmount(totalAmount)}</p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {(["전체", "진행중", "완료"] as const).map(f => (
          <button key={f} onClick={() => setFilterCompleted(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filterCompleted === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
            {f}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">플랫폼</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">타입</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">업체명</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">금액</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">기간</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">리뷰</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">완료</th>
                <th className="px-4 py-3 w-16"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={8} className="text-center py-10 text-muted-foreground text-sm">로딩 중...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-10 text-muted-foreground text-sm">체험단 내역이 없습니다</td></tr>
              ) : (
                filtered.map(c => (
                  <tr key={c.id} className={`border-t border-border hover:bg-muted/30 transition-colors ${c.completed ? "opacity-60" : ""}`}>
                    <td className="px-4 py-3 text-sm">{c.platform ?? "-"}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeColors[c.campaignType ?? "기타"] ?? typeColors["기타"]}`}>
                        {c.campaignType ?? "-"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-sm font-medium">{c.businessName ?? "-"}</p>
                        {c.category && <p className="text-xs text-muted-foreground">{c.category}</p>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-medium">
                      {c.amount ? `₩${formatAmount(c.amount)}` : "-"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {c.startDate && c.endDate ? `${c.startDate} ~ ${c.endDate}` : c.startDate ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => toggleReviewMutation.mutate({ id: c.id, data: { reviewDone: !c.reviewDone } })}
                        className={`transition-colors ${c.reviewDone ? "text-emerald-500" : "text-muted-foreground hover:text-emerald-400"}`}
                      >
                        {c.reviewDone ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => toggleReviewMutation.mutate({ id: c.id, data: { completed: !c.completed } })}
                        className={`transition-colors ${c.completed ? "text-blue-500" : "text-muted-foreground hover:text-blue-400"}`}
                      >
                        {c.completed ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => openEdit(c as Campaign)} className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => deleteMutation.mutate({ id: c.id })} className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-muted-foreground hover:text-red-500">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? "체험단 수정" : "체험단 추가"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">플랫폼</Label>
                <Input value={form.platform} onChange={e => setForm(f => ({ ...f, platform: e.target.value }))} placeholder="예: 디너의여왕" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">타입</Label>
                <Select value={form.campaignType} onValueChange={v => setForm(f => ({ ...f, campaignType: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{CAMPAIGN_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">업체명</Label>
                <Input value={form.businessName} onChange={e => setForm(f => ({ ...f, businessName: e.target.value }))} placeholder="업체명" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">카테고리</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">금액 (원)</Label>
              <CurrencyInput value={form.amount} onChange={(v) => setForm(f => ({ ...f, amount: v }))} placeholder="0" suffix="원" className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">시작일</Label>
                <Input value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} placeholder="예: 2026-01-01" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">마감일</Label>
                <Input value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} placeholder="예: 2026-01-15" className="mt-1" />
              </div>
            </div>
            <div>
              <Label className="text-xs">방문/수령일</Label>
              <Input value={form.visitDate} onChange={e => setForm(f => ({ ...f, visitDate: e.target.value }))} placeholder="예: 2026-01-10" className="mt-1" />
            </div>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.reviewDone} onChange={e => setForm(f => ({ ...f, reviewDone: e.target.checked }))} className="rounded" />
                리뷰 완료
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.completed} onChange={e => setForm(f => ({ ...f, completed: e.target.checked }))} className="rounded" />
                체험단 완료
              </label>
            </div>
            <div>
              <Label className="text-xs">비고</Label>
              <Input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="비고" className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>취소</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>{editing ? "수정" : "추가"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
