import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { ArrowRight, Copy, Layers } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MediaViewerProvider } from "@/components/media-viewer";
import { copyText } from "@/lib/format";
import { App } from "./app";
import "./styles.css";

/** Opened from disk instead of the local server: how to start it. */
function Launch() {
  const command = location.pathname.includes("/store-listing/")
    ? "node store-listing/studio/server.cjs 8790"
    : "node studio/server.cjs 8790";
  return (
    <main className="grid min-h-dvh place-items-center bg-muted/30 p-6">
      <Card className="w-full max-w-xl shadow-sm">
        <CardHeader>
          <span className="mb-4 flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Layers />
          </span>
          <CardTitle className="text-3xl tracking-tight">
            Open your screenshot workspace
          </CardTitle>
          <CardDescription className="leading-relaxed">
            Connect your app projects, refine store artwork, and bring every
            language together. Start the local server from your repository.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded-lg border bg-muted p-4 text-sm">
            {command}
          </pre>
        </CardContent>
        <CardFooter className="flex-wrap gap-2">
          <Button
            onClick={() =>
              copyText(command)
                .then(() => toast.success("Launch command copied"))
                .catch(() => toast.error("Select and copy the command above."))
            }
          >
            <Copy />
            Copy command
          </Button>
          <Button asChild variant="outline">
            <a href="http://127.0.0.1:8790/studio/">
              Open local studio
              <ArrowRight />
            </a>
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <ThemeProvider
    attribute="class"
    defaultTheme="system"
    enableSystem
    disableTransitionOnChange
  >
    <TooltipProvider delayDuration={350}>
      {location.protocol === "file:" ? (
        <Launch />
      ) : (
        <BrowserRouter>
          <MediaViewerProvider>
            <App />
          </MediaViewerProvider>
        </BrowserRouter>
      )}
      <Toaster richColors position="bottom-right" />
    </TooltipProvider>
  </ThemeProvider>,
);
