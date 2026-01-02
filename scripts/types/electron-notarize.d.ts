declare module '@electron/notarize' {
  export type NotarizeOptions = {
    tool: string;
    appBundleId: string;
    appPath: string;
    appleId: string;
    appleIdPassword: string;
    teamId?: string;
  };

  export function notarize(options: NotarizeOptions): Promise<void>;
}
