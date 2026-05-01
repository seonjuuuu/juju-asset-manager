import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { signInWithGoogle, supabase } from "@/lib/supabase";
import { useAuthSession } from "@/contexts/AuthSessionContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { GoogleIcon } from "@/components/GoogleIcon";

export default function SignUpPage() {
  const [, setLocation] = useLocation();
  const { session, isReady } = useAuthSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  useEffect(() => {
    if (!isReady) return;
    if (session) setLocation("/", { replace: true });
  }, [session, isReady, setLocation]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password || password.length < 6) {
      toast.error("이메일을 입력하고 비밀번호는 6자 이상으로 설정하세요");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: typeof window !== "undefined" ? `${window.location.origin}/` : undefined,
      },
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (data.session) {
      toast.success("가입되었습니다");
      setLocation("/", { replace: true });
      return;
    }
    toast.message("이메일을 확인하세요", {
      description: "Supabase에서 이메일 확인을 켜 두었다면 인증 링크를 열어 주세요.",
    });
  }

  async function handleGoogle() {
    setGoogleBusy(true);
    const { error } = await signInWithGoogle();
    setGoogleBusy(false);
    if (error) toast.error(error.message);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-xl">회원가입</CardTitle>
          <CardDescription>이메일과 비밀번호로 계정을 만듭니다</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            type="button"
            variant="outline"
            className="w-full gap-2"
            disabled={googleBusy || busy}
            onClick={() => void handleGoogle()}
          >
            <GoogleIcon />
            {googleBusy ? "이동 중…" : "Google로 가입·로그인"}
          </Button>
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">또는 이메일 가입</span>
            </div>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="signup-email">이메일</Label>
              <Input
                id="signup-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="signup-password">비밀번호 (6자 이상)</Label>
              <Input
                id="signup-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy || googleBusy}>
              {busy ? "진행 중…" : "가입하기"}
            </Button>
            <p className="text-sm text-center text-muted-foreground">
              이미 계정이 있으면{" "}
              <Link href="/sign-in" className="text-primary underline underline-offset-2 hover:no-underline">
                로그인
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
