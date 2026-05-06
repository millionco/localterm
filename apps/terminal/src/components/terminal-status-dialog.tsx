import { Check, Copy } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { COPY_FEEDBACK_MS, RESTART_COMMAND, RETRY_BUTTON_FEEDBACK_MS } from "@/lib/constants";

interface TerminalStatusDialogProps {
  exitCode: number | null | undefined;
  isShellDead: boolean;
  isDisconnected: boolean;
  onReconnect: () => void;
}

export const TerminalStatusDialog = ({
  exitCode,
  isShellDead,
  isDisconnected,
  onReconnect,
}: TerminalStatusDialogProps) => {
  const retryFeedbackTimerRef = useRef<number | null>(null);
  const copyFeedbackTimerRef = useRef<number | null>(null);
  const [hasCopiedRestartCommand, setHasCopiedRestartCommand] = useState(false);
  const [isRetryingConnection, setIsRetryingConnection] = useState(false);

  const triggerManualReconnect = useCallback(() => {
    setIsRetryingConnection(true);
    onReconnect();
    if (retryFeedbackTimerRef.current !== null)
      window.clearTimeout(retryFeedbackTimerRef.current);
    retryFeedbackTimerRef.current = window.setTimeout(() => {
      retryFeedbackTimerRef.current = null;
      setIsRetryingConnection(false);
    }, RETRY_BUTTON_FEEDBACK_MS);
  }, [onReconnect]);

  const copyRestartCommand = useCallback(() => {
    void navigator.clipboard
      .writeText(RESTART_COMMAND)
      .then(() => {
        setHasCopiedRestartCommand(true);
        if (copyFeedbackTimerRef.current !== null)
          window.clearTimeout(copyFeedbackTimerRef.current);
        copyFeedbackTimerRef.current = window.setTimeout(() => {
          copyFeedbackTimerRef.current = null;
          setHasCopiedRestartCommand(false);
        }, COPY_FEEDBACK_MS);
      })
      .catch(() => {});
  }, []);

  useEffect(
    () => () => {
      if (retryFeedbackTimerRef.current !== null) window.clearTimeout(retryFeedbackTimerRef.current);
      if (copyFeedbackTimerRef.current !== null) window.clearTimeout(copyFeedbackTimerRef.current);
    },
    [],
  );

  const isOpen = isShellDead || isDisconnected;

  return (
    <AlertDialog open={isOpen}>
      <AlertDialogContent>
        {isShellDead ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Shell ended</AlertDialogTitle>
              <AlertDialogDescription>
                {exitCode === null || exitCode === 0
                  ? "Open a new shell to keep going, or close this tab."
                  : `Exit code ${exitCode}. Open a new shell to keep going.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogAction
                onClick={() =>
                  window.open(window.location.origin, "_blank", "noopener,noreferrer")
                }
              >
                New shell
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        ) : (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <Spinner aria-hidden="true" role="presentation" aria-label={undefined} />
                Lost connection
              </AlertDialogTitle>
              <AlertDialogDescription>
                The localterm server isn't responding. Start it again from your terminal, then
                retry.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <InputGroup>
              <InputGroupInput
                readOnly
                value={RESTART_COMMAND}
                aria-label="restart command"
                className="font-mono"
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  size="icon-xs"
                  onClick={copyRestartCommand}
                  aria-label={hasCopiedRestartCommand ? "Copied" : "Copy restart command"}
                >
                  {hasCopiedRestartCommand ? <Check /> : <Copy />}
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
            <AlertDialogFooter>
              <AlertDialogAction onClick={triggerManualReconnect} disabled={isRetryingConnection}>
                {isRetryingConnection ? <Spinner data-icon="inline-start" /> : null}
                Retry
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
};
