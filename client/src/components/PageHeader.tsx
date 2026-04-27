import { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

/**
 * 모든 페이지에서 공통으로 사용하는 헤더 컴포넌트.
 * - 제목(h1) + 설명(p) 좌측, 액션 버튼 우측 정렬
 * - 하단 border로 컨텐츠 영역과 시각적 분리
 */
export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 pb-4 border-b border-border">
      <div className="min-w-0">
        <h1 className="text-xl font-bold text-foreground tracking-tight">{title}</h1>
        {description && (
          <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}
