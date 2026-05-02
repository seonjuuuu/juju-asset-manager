import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { CheckCircle2, Circle, Lightbulb, Plus, Trash2 } from "lucide-react";

const formatDate = (value: string | Date) => {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
};

export default function FeatureRequests() {
  const utils = trpc.useUtils();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const { data: requests = [], isLoading } = trpc.featureRequest.list.useQuery();

  const counts = useMemo(() => {
    const done = requests.filter((item) => item.isDone).length;
    return { total: requests.length, pending: requests.length - done, done };
  }, [requests]);

  const create = trpc.featureRequest.create.useMutation({
    onSuccess: () => {
      utils.featureRequest.list.invalidate();
      toast.success("요청사항이 등록되었습니다");
      setDialogOpen(false);
      setTitle("");
      setContent("");
    },
    onError: (error) => toast.error(error.message),
  });

  const setDone = trpc.featureRequest.setDone.useMutation({
    onSuccess: () => utils.featureRequest.list.invalidate(),
    onError: (error) => toast.error(error.message),
  });

  const remove = trpc.featureRequest.delete.useMutation({
    onSuccess: () => {
      utils.featureRequest.list.invalidate();
      toast.success("삭제되었습니다");
    },
    onError: (error) => toast.error(error.message),
  });

  const handleSubmit = () => {
    if (!title.trim()) {
      toast.error("제목을 입력해주세요");
      return;
    }
    if (!content.trim()) {
      toast.error("요청 내용을 입력해주세요");
      return;
    }
    create.mutate({ title: title.trim(), content: content.trim() });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">기능 요청 게시판</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">모든 사용자가 함께 보는 요청사항 목록입니다</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" /> 요청 작성
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">전체 요청</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{counts.total}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">처리 대기</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold text-amber-600">{counts.pending}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">처리 완료</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold text-emerald-600">{counts.done}</CardContent>
        </Card>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {isLoading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">로딩 중...</div>
        ) : requests.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <Lightbulb className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="font-medium">등록된 요청사항이 없습니다</p>
              <p className="mt-1 text-sm text-muted-foreground">필요한 기능이나 개선점을 남겨주세요</p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {requests.map((item) => (
              <div key={item.id} className="grid gap-3 p-4 md:grid-cols-[1fr_auto]">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={item.isDone ? "default" : "secondary"}>{item.isDone ? "처리완료" : "요청"}</Badge>
                    <h2 className={`text-base font-semibold ${item.isDone ? "text-muted-foreground line-through" : "text-foreground"}`}>
                      {item.title}
                    </h2>
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{item.content}</p>
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span>{item.authorName ?? "사용자"}</span>
                    <span>·</span>
                    <span>{formatDate(item.createdAt)}</span>
                    {item.checkedAt ? (
                      <>
                        <span>·</span>
                        <span>처리 {formatDate(item.checkedAt)}</span>
                      </>
                    ) : null}
                  </div>
                </div>
                <div className="flex items-center gap-2 md:justify-end">
                  <Button
                    variant={item.isDone ? "secondary" : "outline"}
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setDone.mutate({ id: item.id, isDone: !item.isDone })}
                    disabled={setDone.isPending}
                  >
                    {item.isDone ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                    {item.isDone ? "완료됨" : "처리 체크"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => remove.mutate({ id: item.id })}
                    disabled={remove.isPending}
                    aria-label="요청 삭제"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>요청사항 작성</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>제목</Label>
              <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="예: 대시보드 알림 필터 추가" />
            </div>
            <div className="space-y-1.5">
              <Label>내용</Label>
              <Textarea
                value={content}
                onChange={(event) => setContent(event.target.value)}
                rows={6}
                placeholder="필요한 기능이나 불편한 점을 적어주세요"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>취소</Button>
            <Button onClick={handleSubmit} disabled={create.isPending}>등록</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
