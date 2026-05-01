/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  /** 레거시 anon 키 (Publishable 과 택1) */
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** Supabase 대시보드 Publishable 키 (anon 과 택1) */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
