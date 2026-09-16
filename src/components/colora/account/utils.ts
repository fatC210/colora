/** 从邮箱取头像首字母，用作 Avatar 的 fallback 文本。 */
export function getUserInitial(user: string) {
  return user.trim().charAt(0).toUpperCase() || "U";
}
