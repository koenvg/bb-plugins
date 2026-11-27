import type { ReactNode } from "react";

type Handler = (input: never) => unknown;

const rpc = {
  call: async (method: string, input: unknown) => {
    const handler = (globalThis as unknown as { __rpc: Record<string, Handler> }).__rpc[method];
    if (handler === undefined) {
      throw new Error(`Unexpected RPC ${method}`);
    }
    return handler(input as never);
  },
};

export const useRpc = () => rpc;
export const useBbNavigate = () => ({ experimental_openFilePreview: () => true });
export const experimental_useCodeTheme = () => THEME;
export const experimental_Icon = ({ className }: { name: string; className?: string }) => (
  <span className={className} />
);
export const definePluginApp = (setup: unknown) => setup;
export type ExperimentalIconProps = { name: string; className?: string; children?: ReactNode };

const THEME = { name: "pierre-dark", mode: "dark" as const };
