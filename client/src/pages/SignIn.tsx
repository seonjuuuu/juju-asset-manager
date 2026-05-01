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

export default function SignInPage() {
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
    if (!email.trim() || !password) {
      toast.error("이메일과 비밀번호를 입력하세요");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setLocation("/", { replace: true });
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
          <CardTitle className="text-xl">로그인</CardTitle>
          <CardDescription>Supabase 계정으로 로그인합니다</CardDescription>
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
            {googleBusy ? "이동 중…" : "Google로 계속하기"}
          </Button>
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">또는 이메일</span>
            </div>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="signin-email">이메일</Label>
              <Input
                id="signin-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="signin-password">비밀번호</Label>
              <Input
                id="signin-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy || googleBusy}>
              {busy ? "진행 중…" : "로그인"}
            </Button>
            <p className="text-sm text-center text-muted-foreground">
              계정이 없으면{" "}
              <Link href="/sign-up" className="text-primary underline underline-offset-2 hover:no-underline">
                회원가입
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
