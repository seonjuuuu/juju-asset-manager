import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight, Tag, Layers, Lock } from "lucide-react";

const PROTECTED_SUB_NAMES = ["구독서비스", "보험"];

type CategoryType = "expense" | "income" | "both";

const TYPE_LABEL: Record<CategoryType, string> = {
  expense: "지출",
  income: "수입",
  both: "공통",
};
const TYPE_COLOR: Record<CategoryType, string> = {
  expense: "destructive",
  income: "default",
  both: "secondary",
};

// ─── 대분류 다이얼로그 ────────────────────────────────────────────────────────
function MainCategoryDialog({
  open,
  onClose,
  onSave,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (data: { name: string; type: CategoryType }) => void;
  initial?: { name: string; type: CategoryType } | null;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState<CategoryType>(initial?.type ?? "expense");

  // initial 변경 시 폼 초기화
  useState(() => {
    setName(initial?.name ?? "");
    setType(initial?.type ?? "expense");
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{initial ? "대분류 수정" : "대분류 추가"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>대분류명 *</Label>
            <Input
              placeholder="예: 식비"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && name.trim() && onSave({ name: name.trim(), type })}
            />
          </div>
          <div className="space-y-1">
            <Label>유형 *</Label>
            <Select value={type} onValueChange={(v) => setType(v as CategoryType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="expense">지출</SelectItem>
                <SelectItem value="income">수입</SelectItem>
                <SelectItem value="both">공통 (지출+수입)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button
            onClick={() => {
              if (!name.trim()) { toast.error("대분류명을 입력하세요"); return; }
              onSave({ name: name.trim(), type });
            }}
          >저장</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── 중분류 다이얼로그 ────────────────────────────────────────────────────────
function SubCategoryDialog({
  open,
  onClose,
  onSave,
  parentName,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (name: string) => void;
  parentName: string;
  initial?: string | null;
}) {
  const [name, setName] = useState(initial ?? "");

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{initial ? "중분류 수정" : `중분류 추가 — ${parentName}`}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>중분류명 *</Label>
            <Input
              placeholder="예: 외식"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && name.trim() && onSave(name.trim())}
              autoFocus
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button
            onClick={() => {
              if (!name.trim()) { toast.error("중분류명을 입력하세요"); return; }
              onSave(name.trim());
            }}
          >저장</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── 메인 페이지 ──────────────────────────────────────────────────────────────
export default function Categories() {
  const utils = trpc.useUtils();
  const { data: categoryList = [], isLoading } = trpc.categories.list.useQuery();

  // 대분류 뮤테이션
  const addMain = trpc.categories.addMain.useMutation({
    onSuccess: () => { utils.categories.list.invalidate(); toast.success("대분류가 추가되었습니다"); setMainDialog(null); },
    onError: () => toast.error("추가 실패"),
  });
  const updateMain = trpc.categories.updateMain.useMutation({
    onSuccess: () => { utils.categories.list.invalidate(); toast.success("수정되었습니다"); setMainDialog(null); },
    onError: () => toast.error("수정 실패"),
  });
  const deleteMain = trpc.categories.deleteMain.useMutation({
    onSuccess: () => { utils.categories.list.invalidate(); toast.success("삭제되었습니다"); },
    onError: () => toast.error("삭제 실패"),
  });

  // 중분류 뮤테이션
  const addSub = trpc.categories.addSub.useMutation({
    onSuccess: () => { utils.categories.list.invalidate(); toast.success("중분류가 추가되었습니다"); setSubDialog(null); },
    onError: () => toast.error("추가 실패"),
  });
  const updateSub = trpc.categories.updateSub.useMutation({
    onSuccess: () => { utils.categories.list.invalidate(); toast.success("수정되었습니다"); setSubDialog(null); },
    onError: () => toast.error("수정 실패"),
  });
  const deleteSub = trpc.categories.deleteSub.useMutation({
    onSuccess: () => { utils.categories.list.invalidate(); toast.success("삭제되었습니다"); },
    onError: () => toast.error("삭제 실패"),
  });

  // 다이얼로그 상태
  const [mainDialog, setMainDialog] = useState<null | { mode: "add" } | { mode: "edit"; id: number; name: string; type: CategoryType }>(null);
  const [subDialog, setSubDialog] = useState<null | { mode: "add"; categoryId: number; parentName: string } | { mode: "edit"; id: number; name: string; parentName: string }>(null);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: "main" | "sub"; id: number; name: string } | null>(null);

  const toggleExpand = (id: number) => setExpanded((p) => ({ ...p, [id]: !p[id] }));

  // 유형별 분리
  const expenseCategories = categoryList.filter((c) => c.type === "expense" || c.type === "both");
  const incomeCategories = categoryList.filter((c) => c.type === "income" || c.type === "both");

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">카테고리 관리</h1>
            <p className="text-muted-foreground text-sm mt-1">불러오는 중...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">카테고리 관리</h1>
          <p className="text-muted-foreground text-sm mt-1">대분류와 중분류를 설정합니다. 가계부 입력 시 이 목록이 사용됩니다.</p>
        </div>
        <Button onClick={() => setMainDialog({ mode: "add" })}>
          <Plus className="w-4 h-4 mr-2" /> 대분류 추가
        </Button>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10"><Layers className="w-5 h-5 text-primary" /></div>
              <div>
                <p className="text-xs text-muted-foreground">전체 대분류</p>
                <p className="text-xl font-bold text-foreground">{categoryList.length}개</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-destructive/10"><Tag className="w-5 h-5 text-destructive" /></div>
              <div>
                <p className="text-xs text-muted-foreground">지출 대분류</p>
                <p className="text-xl font-bold text-foreground">{expenseCategories.length}개</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10"><Tag className="w-5 h-5 text-emerald-500" /></div>
              <div>
                <p className="text-xs text-muted-foreground">수입 대분류</p>
                <p className="text-xl font-bold text-foreground">{incomeCategories.length}개</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 지출 카테고리 */}
      <div>
        <h2 className="text-base font-semibold mb-3 text-foreground">지출 카테고리</h2>
        {expenseCategories.length === 0 ? (
          <Card><CardContent className="py-10 text-center text-muted-foreground text-sm">지출 카테고리가 없습니다.</CardContent></Card>
        ) : (
          <div className="space-y-2">
            {expenseCategories.map((cat) => (
              <Card key={cat.id} className="overflow-hidden">
                <div
                  className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => toggleExpand(cat.id)}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground">
                      {expanded[cat.id] ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </span>
                    <span className="font-medium text-sm">{cat.name}</span>
                    <Badge variant={TYPE_COLOR[cat.type] as any} className="text-xs">{TYPE_LABEL[cat.type]}</Badge>
                    <span className="text-xs text-muted-foreground">중분류 {cat.subCategories.length}개</span>
                  </div>
                  <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                      onClick={() => setMainDialog({ mode: "edit", id: cat.id, name: cat.name, type: cat.type as CategoryType })}>
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                      onClick={() => setDeleteConfirm({ type: "main", id: cat.id, name: cat.name })}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
                {expanded[cat.id] && (
                  <div className="border-t border-border bg-muted/20 px-4 py-3">
                    <div className="flex flex-wrap gap-2 mb-3">
                      {cat.subCategories.map((sub) => (
                        <div key={sub.id} className="flex items-center gap-1 bg-background border border-border rounded-full px-3 py-1 text-xs">
                          <span>{sub.name}</span>
                          <button
                            className="ml-1 text-muted-foreground hover:text-foreground"
                            onClick={() => setSubDialog({ mode: "edit", id: sub.id, name: sub.name, parentName: cat.name })}
                          ><Pencil className="w-3 h-3" /></button>
                          {PROTECTED_SUB_NAMES.includes(sub.name) ? (
                            <span className="text-muted-foreground/40 cursor-not-allowed" title="삭제할 수 없는 중분류입니다">
                              <Lock className="w-3 h-3" />
                            </span>
                          ) : (
                            <button
                              className="text-muted-foreground hover:text-destructive"
                              onClick={() => setDeleteConfirm({ type: "sub", id: sub.id, name: sub.name })}
                            ><Trash2 className="w-3 h-3" /></button>
                          )}
                        </div>
                      ))}
                      <button
                        className="flex items-center gap-1 border border-dashed border-border rounded-full px-3 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
                        onClick={() => setSubDialog({ mode: "add", categoryId: cat.id, parentName: cat.name })}
                      >
                        <Plus className="w-3 h-3" /> 중분류 추가
                      </button>
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* 수입 카테고리 */}
      <div>
        <h2 className="text-base font-semibold mb-3 text-foreground">수입 카테고리</h2>
        {incomeCategories.length === 0 ? (
          <Card><CardContent className="py-10 text-center text-muted-foreground text-sm">수입 카테고리가 없습니다.</CardContent></Card>
        ) : (
          <div className="space-y-2">
            {incomeCategories.map((cat) => (
              <Card key={cat.id} className="overflow-hidden">
                <div
                  className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => toggleExpand(cat.id)}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground">
                      {expanded[cat.id] ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </span>
                    <span className="font-medium text-sm">{cat.name}</span>
                    <Badge variant={TYPE_COLOR[cat.type] as any} className="text-xs">{TYPE_LABEL[cat.type]}</Badge>
                    <span className="text-xs text-muted-foreground">중분류 {cat.subCategories.length}개</span>
                  </div>
                  <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                      onClick={() => setMainDialog({ mode: "edit", id: cat.id, name: cat.name, type: cat.type as CategoryType })}>
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                      onClick={() => setDeleteConfirm({ type: "main", id: cat.id, name: cat.name })}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
                {expanded[cat.id] && (
                  <div className="border-t border-border bg-muted/20 px-4 py-3">
                    <div className="flex flex-wrap gap-2 mb-3">
                      {cat.subCategories.map((sub) => (
                        <div key={sub.id} className="flex items-center gap-1 bg-background border border-border rounded-full px-3 py-1 text-xs">
                          <span>{sub.name}</span>
                          <button
                            className="ml-1 text-muted-foreground hover:text-foreground"
                            onClick={() => setSubDialog({ mode: "edit", id: sub.id, name: sub.name, parentName: cat.name })}
                          ><Pencil className="w-3 h-3" /></button>
                          {PROTECTED_SUB_NAMES.includes(sub.name) ? (
                            <span className="text-muted-foreground/40 cursor-not-allowed" title="삭제할 수 없는 중분류입니다">
                              <Lock className="w-3 h-3" />
                            </span>
                          ) : (
                            <button
                              className="text-muted-foreground hover:text-destructive"
                              onClick={() => setDeleteConfirm({ type: "sub", id: sub.id, name: sub.name })}
                            ><Trash2 className="w-3 h-3" /></button>
                          )}
                        </div>
                      ))}
                      <button
                        className="flex items-center gap-1 border border-dashed border-border rounded-full px-3 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
                        onClick={() => setSubDialog({ mode: "add", categoryId: cat.id, parentName: cat.name })}
                      >
                        <Plus className="w-3 h-3" /> 중분류 추가
                      </button>
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* 대분류 다이얼로그 */}
      {mainDialog && (
        <MainCategoryDialog
          open={true}
          onClose={() => setMainDialog(null)}
          initial={mainDialog.mode === "edit" ? { name: mainDialog.name, type: mainDialog.type } : null}
          onSave={(data) => {
            if (mainDialog.mode === "add") {
              addMain.mutate({ ...data, sortOrder: categoryList.length });
            } else {
              updateMain.mutate({ id: mainDialog.id, ...data });
            }
          }}
        />
      )}

      {/* 중분류 다이얼로그 */}
      {subDialog && (
        <SubCategoryDialog
          open={true}
          onClose={() => setSubDialog(null)}
          parentName={subDialog.parentName}
          initial={subDialog.mode === "edit" ? subDialog.name : null}
          onSave={(name) => {
            if (subDialog.mode === "add") {
              addSub.mutate({ categoryId: subDialog.categoryId, name, sortOrder: 0 });
            } else {
              updateSub.mutate({ id: subDialog.id, name });
            }
          }}
        />
      )}

      {/* 삭제 확인 다이얼로그 */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>삭제 확인</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            <span className="font-semibold text-foreground">"{deleteConfirm?.name}"</span>을(를) 삭제하시겠습니까?
            {deleteConfirm?.type === "main" && (
              <span className="block mt-1 text-destructive text-xs">대분류를 삭제하면 하위 중분류도 모두 삭제됩니다.</span>
            )}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>취소</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!deleteConfirm) return;
                if (deleteConfirm.type === "main") {
                  deleteMain.mutate({ id: deleteConfirm.id });
                } else {
                  deleteSub.mutate({ id: deleteConfirm.id });
                }
                setDeleteConfirm(null);
              }}
            >삭제</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
