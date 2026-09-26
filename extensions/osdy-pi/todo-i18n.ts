// Locale resources adapted from @juicesharp/rpiv-todo@2.11.0 (MIT); see root LICENSE.
import type { TodoStatus } from "./todo-domain.js";

export const I18N_NAMESPACE = "@osdy/pi-todo";
type Scope = (key: string, fallback: string) => string;
type Loader = { registerLocalesFromDir(namespace: string, packageUrl: string, options?: { label?: string }): void };
type SDK = { scope(namespace: string): Scope };

const english: Record<TodoStatus, string> = {
 pending: "pending", in_progress: "in progress", completed: "completed", deleted: "deleted",
};

export function createTodoI18n(scope: Scope = (_key, fallback) => fallback) {
 return {
  t: (key: string, fallback: string) => scope(key, fallback),
  status: (value: TodoStatus) => scope(`status.${value}`, english[value]),
 };
}

export type TodoI18n = ReturnType<typeof createTodoI18n>;

export async function initTodoI18n(
 loadLoader: () => Promise<Loader>,
 loadSDK: () => Promise<SDK>,
): Promise<TodoI18n> {
 try {
  const loader = await loadLoader();
  loader.registerLocalesFromDir(I18N_NAMESPACE, import.meta.url, { label: "osdy-todo" });
  const sdk = await loadSDK();
  return createTodoI18n(sdk.scope(I18N_NAMESPACE));
 } catch {
  return createTodoI18n();
 }
}

// The variable specifier keeps the SDK optional without a compile-time peer dependency.
// Top-level await resolves registration and scope before importers render synchronously.
const loaderSpecifier = "@juicesharp/rpiv-i18n/loader";
const sdkSpecifier = "@juicesharp/rpiv-i18n";
export const todoI18n = await initTodoI18n(
 () => import(loaderSpecifier) as Promise<Loader>,
 () => import(sdkSpecifier) as Promise<SDK>,
);
