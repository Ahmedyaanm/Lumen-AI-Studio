import { type ReactNode, useEffect, useRef } from "react";
import {
  ClerkProvider,
  RedirectToSignIn,
  Show,
  SignIn,
  SignUp,
  UserProfile,
  useClerk,
} from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { ErrorBoundary } from "@/components/error-boundary";
import LumenWorkspace from "@/components/lumen-workspace";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Redirect, Route, Switch, useLocation, Router as WouterRouter } from "wouter";

const queryClient = new QueryClient();
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "#f65d3d",
    colorForeground: "#2d2039",
    colorMutedForeground: "#806f69",
    colorDanger: "#b14b37",
    colorBackground: "#fffaf2",
    colorInput: "#f5f0e7",
    colorInputForeground: "#2d2039",
    colorNeutral: "#dfd5c9",
    fontFamily: "DM Sans, sans-serif",
    borderRadius: "0.75rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-[#fffaf2] rounded-2xl w-[440px] max-w-full overflow-hidden shadow-[0_12px_0_#dfd5c9]",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-[#2d2039] font-display",
    headerSubtitle: "text-[#806f69]",
    socialButtonsBlockButtonText: "text-[#2d2039]",
    formFieldLabel: "text-[#5d4e63]",
    footerActionLink: "text-[#b94231]",
    footerActionText: "text-[#806f69]",
    dividerText: "text-[#806f69]",
    identityPreviewEditButton: "text-[#b94231]",
    formFieldSuccessText: "text-[#587060]",
    alertText: "text-[#883f31]",
    logoBox: "mb-3",
    logoImage: "max-h-10",
    socialButtonsBlockButton: "border-[#dfd5c9] bg-[#f5f0e7]",
    formButtonPrimary: "bg-[#f65d3d] text-[#2d2039] hover:bg-[#ff7657]",
    formFieldInput: "border-[#dfd5c9] bg-[#f5f0e7] text-[#2d2039]",
    footerAction: "bg-transparent",
    dividerLine: "bg-[#dfd5c9]",
    alert: "border-[#e8b9ac] bg-[#fff0eb]",
    otpCodeFieldInput: "border-[#dfd5c9] bg-[#f5f0e7]",
    formFieldRow: "mb-3",
    main: "gap-4",
  },
};

function LandingPage() {
  return (
    <main className="grain studio-grid flex min-h-[100dvh] items-center justify-center bg-[#f5f0e7] px-5 py-10 text-[#2d2039]">
      <div className="w-full max-w-5xl">
        <div className="grid items-end gap-10 lg:grid-cols-[1.2fr_.8fr]">
          <div>
            <div className="mb-7 flex items-center gap-3 font-mono-ui text-[11px] uppercase tracking-[0.2em] text-[#f65d3d]">
              <span className="size-2 rounded-full bg-[#f65d3d]" /> Lumen / build studio
            </div>
            <h1 className="max-w-4xl font-display text-[clamp(4rem,10vw,9rem)] leading-[0.86] tracking-[-0.06em]">
              Make the idea <em className="text-[#f65d3d]">real.</em>
            </h1>
            <p className="mt-8 max-w-xl text-lg leading-8 text-[#806f69]">
              A thinking desk and controlled build room for turning a prompt into files, packages, and a runnable project.
            </p>
          </div>
          <div className="rounded-[22px] border border-[#dfd5c9] bg-[#fffaf2] p-6 shadow-[0_8px_0_#dfd5c9]">
            <div className="mb-5 flex items-center justify-between">
              <span className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[#806f69]">Your build desk</span>
              <span className="size-2 rounded-full bg-[#f3ca62]" />
            </div>
            <div className="space-y-3 font-mono-ui text-[11px] text-[#5d4e63]">
              <div className="flex justify-between border-b border-[#e9dfd2] pb-3"><span>FILES</span><span className="text-[#f65d3d]">GENERATED</span></div>
              <div className="flex justify-between border-b border-[#e9dfd2] pb-3"><span>PACKAGES</span><span className="text-[#f65d3d]">CONTROLLED</span></div>
              <div className="flex justify-between"><span>SERVERS</span><span className="text-[#f65d3d]">YOUR CALL</span></div>
            </div>
            <div className="mt-7 grid gap-2 sm:grid-cols-2">
              <a href={`${basePath}/sign-in`} className="rounded-xl bg-[#2d2039] px-4 py-3 text-center text-sm font-bold text-[#fff8ea] transition-transform hover:-translate-y-0.5" data-testid="link-sign-in">Sign in</a>
              <a href={`${basePath}/sign-up`} className="rounded-xl bg-[#f65d3d] px-4 py-3 text-center text-sm font-bold text-[#2d2039] shadow-[0_3px_0_#b94231] transition-transform hover:-translate-y-0.5" data-testid="link-sign-up">Create account</a>
            </div>
            <p className="mt-4 text-center text-xs leading-5 text-[#9d8e8d]">One AI project per day, saved to your account.</p>
          </div>
        </div>
      </div>
    </main>
  );
}

function SignInPage() {
  return <div className="grain flex min-h-[100dvh] items-center justify-center bg-[#f5f0e7] px-4"><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /></div>;
}

function SignUpPage() {
  return <div className="grain flex min-h-[100dvh] items-center justify-center bg-[#f5f0e7] px-4"><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /></div>;
}

function AccountPage() {
  return <div className="grain min-h-[100dvh] bg-[#f5f0e7] px-4 py-10"><UserProfile routing="path" path={`${basePath}/account`} /></div>;
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in"><Redirect to="/studio" /></Show>
      <Show when="signed-out"><LandingPage /></Show>
    </>
  );
}

function StudioRoute() {
  return (
    <>
      <Show when="signed-in"><LumenWorkspace /></Show>
      <Show when="signed-out"><RedirectToSignIn /></Show>
    </>
  );
}

function LogoutButton() {
  const { signOut } = useClerk();
  return <button type="button" onClick={() => signOut({ redirectUrl: basePath || "/" })}>Log out</button>;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const client = useQueryClient();
  const previousUserId = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (previousUserId.current !== undefined && previousUserId.current !== userId) client.clear();
      previousUserId.current = userId;
    });
    return unsubscribe;
  }, [addListener, client]);
  return null;
}

function Router() {
  const [location] = useLocation();
  return (
    <ErrorBoundary resetKey={location}>
      <Switch>
        <Route path="/" component={HomeRedirect} />
        <Route path="/studio" component={StudioRoute} />
        <Route path="/sign-in/*?" component={SignInPage} />
        <Route path="/sign-up/*?" component={SignUpPage} />
        <Route path="/account/*?" component={AccountPage} />
        <Route component={NotFound} />
      </Switch>
    </ErrorBoundary>
  );
}

function ClerkShell({ children }: { children: ReactNode }) {
  const [, setLocation] = useLocation();
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: { start: { title: "Welcome back", subtitle: "Return to your build desk" } },
        signUp: { start: { title: "Create your desk", subtitle: "Start building with Lumen" } },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        {children}
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  if (!clerkPubKey) throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY.");
  return (
    <TooltipProvider>
      <WouterRouter base={basePath}>
        <ClerkShell><Router /></ClerkShell>
      </WouterRouter>
      <Toaster />
    </TooltipProvider>
  );
}

export default App;