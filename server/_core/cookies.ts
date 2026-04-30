// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getSessionCookieOptions(req: any) {
  const isSecure = (() => {
    if (req?.protocol === "https") return true;
    const proto = req?.headers?.["x-forwarded-proto"];
    if (!proto) return false;
    const list = Array.isArray(proto) ? proto : proto.split(",");
    return list.some((p: string) => p.trim().toLowerCase() === "https");
  })();

  return {
    httpOnly: true,
    path: "/",
    sameSite: "none" as const,
    secure: isSecure,
  };
}
