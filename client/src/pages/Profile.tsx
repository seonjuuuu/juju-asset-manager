import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useUser } from "@clerk/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { UserCircle, CalendarIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

function isValidDate(value: string): boolean {
  if (!value) return false;
  return !isNaN(new Date(value).getTime()) && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function calcAge(birthDate: string): number {
  const [by, bm, bd] = birthDate.split("-").map(Number);
  const now = new Date();
  let age = now.getFullYear() - by;
  if (now.getMonth() + 1 < bm || (now.getMonth() + 1 === bm && now.getDate() < bd)) {
    age -= 1;
  }
  return age;
}

export default function Profile() {
  const { user } = useUser();
  const utils = trpc.useUtils();

  const dbUser = trpc.auth.me.useQuery().data as { name?: string | null; birthDate?: string | null } | null;
  const [name, setName] = useState(dbUser?.name ?? user?.fullName ?? "");
  const [birthDate, setBirthDate] = useState(dbUser?.birthDate ?? "");
  const [calOpen, setCalOpen] = useState(false);

  const updateMutation = trpc.auth.updateProfile.useMutation({
    onSuccess: () => {
      utils.auth.me.invalidate();
      toast.success("프로필이 저장되었습니다");
    },
    onError: (e) => toast.error(e.message),
  });

  const invalid = birthDate !== "" && !isValidDate(birthDate);
  const currentAge = birthDate && isValidDate(birthDate) ? calcAge(birthDate) : null;

  function handleSave() {
    if (birthDate && !isValidDate(birthDate)) {
      toast.error("생년월일 형식이 올바르지 않습니다 (YYYY-MM-DD)");
      return;
    }
    updateMutation.mutate({ name: name || null, birthDate: birthDate || null });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">내 정보</h1>
        <p className="text-muted-foreground text-sm mt-1">프로필 정보를 관리합니다</p>
      </div>

      <Card className="max-w-md">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <UserCircle className="w-4 h-4" /> 기본 정보
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 이름 */}
          <div className="space-y-1">
            <Label>이름</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="이름 입력" />
          </div>

          {/* 이메일 (읽기 전용) */}
          <div className="space-y-1">
            <Label>이메일</Label>
            <Input value={user?.primaryEmailAddress?.emailAddress ?? ""} disabled className="bg-muted" />
          </div>

          {/* 생년월일 */}
          <div className="space-y-1">
            <Label>생년월일</Label>
            <div className="flex gap-2">
              <Input
                value={birthDate}
                onChange={(e) => {
                  const raw = e.target.value;
                  const digits = raw.replace(/\D/g, "");
                  if (digits.length === 8) {
                    setBirthDate(`${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`);
                  } else {
                    setBirthDate(raw);
                  }
                }}
                placeholder="YYYY-MM-DD"
                className={invalid ? "border-destructive" : ""}
              />
              <Popover open={calOpen} onOpenChange={setCalOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="icon" className="flex-shrink-0">
                    <CalendarIcon className="w-4 h-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar
                    mode="single"
                    selected={isValidDate(birthDate) ? new Date(birthDate) : undefined}
                    onSelect={(d) => {
                      if (d) {
                        setBirthDate(d.toISOString().slice(0, 10));
                        setCalOpen(false);
                      }
                    }}
                    captionLayout="dropdown"
                    fromYear={1930}
                    toYear={new Date().getFullYear()}
                  />
                </PopoverContent>
              </Popover>
            </div>
            {invalid && (
              <p className="text-xs text-destructive">날짜 형식이 올바르지 않습니다 (YYYY-MM-DD)</p>
            )}
            {currentAge !== null && (
              <p className="text-xs text-muted-foreground">현재 나이: <span className="font-semibold text-foreground">{currentAge}세</span></p>
            )}
          </div>

          <Button onClick={handleSave} disabled={updateMutation.isPending} className="w-full">
            {updateMutation.isPending ? "저장 중..." : "저장"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
