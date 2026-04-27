import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { formatAmount } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Building2 } from "lucide-react";

const EMPTY_FORM = {
  district: "", dong: "", aptName: "", builtYear: "", households: "", areaSize: "", floor: "", direction: "",
  salePrice: "", leasePrice: "", currentPrice: "", price201912: "", price202112: "",
  monthlyMaintenance: "", note: "",
};

type RealEstateRow = {
  id: number;
  district: string | null;
  dong: string | null;
  aptName: string;
  builtYear: string | null;
  households: number | null;
  areaSize: string | null;
  floor: string | null;
  direction: string | null;
  salePrice: number | null;
  leasePrice: number | null;
  leaseRatio: string | null;
  gap: number | null;
  pricePerPyeong: string | null;
  price201912: number | null;
  price202112: number | null;
  currentPrice: number | null;
  riseFrom201912: string | null;
  riseFrom202112: string | null;
  note: string | null;
};

export default function RealEstate() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RealEstateRow | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const utils = trpc.useUtils();
  const { data: properties = [], isLoading } = trpc.realEstate.list.useQuery();

  const createMutation = trpc.realEstate.create.useMutation({
    onSuccess: () => { utils.realEstate.list.invalidate(); toast.success("추가되었습니다"); setDialogOpen(false); },
    onError: () => toast.error("추가 실패"),
  });
  const updateMutation = trpc.realEstate.update.useMutation({
    onSuccess: () => { utils.realEstate.list.invalidate(); toast.success("수정되었습니다"); setDialogOpen(false); },
    onError: () => toast.error("수정 실패"),
  });
  const deleteMutation = trpc.realEstate.delete.useMutation({
    onSuccess: () => { utils.realEstate.list.invalidate(); toast.success("삭제되었습니다"); },
    onError: () => toast.error("삭제 실패"),
  });

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setDialogOpen(true);
  };

  const openEdit = (p: RealEstateRow) => {
    setEditing(p);
    setForm({
      district: p.district ?? "",
      dong: p.dong ?? "",
      aptName: p.aptName,
      builtYear: p.builtYear ?? "",
      households: String(p.households ?? ""),
      areaSize: p.areaSize ?? "",
      floor: p.floor ?? "",
      direction: p.direction ?? "",
      salePrice: String(p.salePrice ?? ""),
      leasePrice: String(p.leasePrice ?? ""),
      currentPrice: String(p.currentPrice ?? ""),
      price201912: String(p.price201912 ?? ""),
      price202112: String(p.price202112 ?? ""),
      monthlyMaintenance: "",
      note: p.note ?? "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    const data = {
      district: form.district || undefined,
      dong: form.dong || undefined,
      aptName: form.aptName,
      builtYear: form.builtYear || undefined,
      households: form.households ? Number(form.households) : undefined,
      areaSize: form.areaSize || undefined,
      floor: form.floor || undefined,
      direction: form.direction || undefined,
      salePrice: form.salePrice ? Number(form.salePrice) : undefined,
      leasePrice: form.leasePrice ? Number(form.leasePrice) : undefined,
      currentPrice: form.currentPrice ? Number(form.currentPrice) : undefined,
      price201912: form.price201912 ? Number(form.price201912) : undefined,
      price202112: form.price202112 ? Number(form.price202112) : undefined,
      note: form.note || undefined,
    };
    if (editing) {
      updateMutation.mutate({ id: editing.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>부동산 정보 관리</h1>
          <p className="text-sm text-muted-foreground mt-0.5">아파트 정보 및 시세 기록</p>
        </div>
        <Button onClick={openCreate} size="sm" className="gap-1.5">
          <Plus className="w-4 h-4" /> 부동산 추가
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-10 text-muted-foreground text-sm">로딩 중...</div>
      ) : properties.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <Building2 className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">등록된 부동산이 없습니다</p>
          <Button onClick={openCreate} size="sm" className="mt-4 gap-1.5">
            <Plus className="w-4 h-4" /> 부동산 추가
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {properties.map(p => {
            const gain = p.currentPrice && p.salePrice ? p.currentPrice - p.salePrice : null;
            const gainRate = gain && p.salePrice ? (gain / p.salePrice) * 100 : null;
            return (
              <div key={p.id} className="bg-card border border-border rounded-xl p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-base font-bold">{p.aptName}</h3>
                    <p className="text-sm text-muted-foreground">
                      {[p.district, p.dong].filter(Boolean).join(" ")}
                      {p.builtYear && ` · ${p.builtYear}년식`}
                      {p.areaSize && ` · ${p.areaSize}평`}
                      {p.floor && ` · ${p.floor}층`}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(p as RealEstateRow)} className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => deleteMutation.mutate({ id: p.id })} className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-muted-foreground hover:text-red-500">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-muted/30 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground mb-0.5">매매가 (취득)</p>
                    <p className="text-sm font-semibold">₩{formatAmount(p.salePrice)}</p>
                  </div>
                  <div className="bg-muted/30 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground mb-0.5">현재 시세</p>
                    <p className="text-sm font-semibold">₩{formatAmount(p.currentPrice)}</p>
                  </div>
                  <div className="bg-muted/30 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground mb-0.5">전세가</p>
                    <p className="text-sm font-semibold">₩{formatAmount(p.leasePrice)}</p>
                  </div>
                  <div className="bg-muted/30 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground mb-0.5">시세 차익</p>
                    {gain !== null ? (
                      <p className={`text-sm font-semibold ${gain >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
                        {gain >= 0 ? "+" : ""}₩{formatAmount(gain)}
                        {gainRate !== null && ` (${gainRate >= 0 ? "+" : ""}${gainRate.toFixed(1)}%)`}
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground">-</p>
                    )}
                  </div>
                </div>
                {(p.price201912 || p.price202112) && (
                  <div className="mt-3 pt-3 border-t border-border grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    {p.price201912 && <span>19.12 실거래가: ₩{formatAmount(p.price201912)}</span>}
                    {p.price202112 && <span>21.12 실거래가: ₩{formatAmount(p.price202112)}</span>}
                  </div>
                )}
                {p.note && (
                  <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border">{p.note}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "부동산 수정" : "부동산 추가"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">아파트명 *</Label>
              <Input value={form.aptName} onChange={e => setForm(f => ({ ...f, aptName: e.target.value }))} placeholder="예: 래미안 퍼스티지" className="mt-1" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">구</Label>
                <Input value={form.district} onChange={e => setForm(f => ({ ...f, district: e.target.value }))} placeholder="예: 서초구" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">동</Label>
                <Input value={form.dong} onChange={e => setForm(f => ({ ...f, dong: e.target.value }))} placeholder="예: 반포동" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">년식</Label>
                <Input value={form.builtYear} onChange={e => setForm(f => ({ ...f, builtYear: e.target.value }))} placeholder="예: 2009" className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">평수</Label>
                <Input value={form.areaSize} onChange={e => setForm(f => ({ ...f, areaSize: e.target.value }))} placeholder="예: 34" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">층수</Label>
                <Input value={form.floor} onChange={e => setForm(f => ({ ...f, floor: e.target.value }))} placeholder="예: 15" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">세대수</Label>
                <Input type="number" value={form.households} onChange={e => setForm(f => ({ ...f, households: e.target.value }))} placeholder="예: 600" className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">매매가 취득가 (만원)</Label>
                <Input type="number" value={form.salePrice} onChange={e => setForm(f => ({ ...f, salePrice: e.target.value }))} placeholder="0" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">전세가 (만원)</Label>
                <Input type="number" value={form.leasePrice} onChange={e => setForm(f => ({ ...f, leasePrice: e.target.value }))} placeholder="0" className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">현재 시세 (만원)</Label>
                <Input type="number" value={form.currentPrice} onChange={e => setForm(f => ({ ...f, currentPrice: e.target.value }))} placeholder="0" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">19.12 실거래가</Label>
                <Input type="number" value={form.price201912} onChange={e => setForm(f => ({ ...f, price201912: e.target.value }))} placeholder="0" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">21.12 실거래가</Label>
                <Input type="number" value={form.price202112} onChange={e => setForm(f => ({ ...f, price202112: e.target.value }))} placeholder="0" className="mt-1" />
              </div>
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
