import React, { useCallback, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { Editor } from "ketcher-react";
import { StandaloneStructServiceProvider } from "ketcher-standalone";
import type { Ketcher } from "ketcher-core";
import "ketcher-react/dist/index.css";
import "./mobile.css";

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage: (message: string) => void };
    ketcher?: Ketcher;
  }
}

type HostMessage =
  | { type: "set_molecule"; value: string }
  | { type: "get_smiles"; requestId: string }
  | { type: "clear" };

function send(message: Record<string, unknown>) {
  window.ReactNativeWebView?.postMessage(JSON.stringify(message));
}

function EditorShell() {
  const provider = useMemo(() => new StandaloneStructServiceProvider(), []);

  const onInit = useCallback((ketcher: Ketcher) => {
    window.ketcher = ketcher;

    const receive = async (rawEvent: Event) => {
      const event = rawEvent as MessageEvent<string>;
      let message: HostMessage;
      try {
        message = JSON.parse(event.data) as HostMessage;
      } catch {
        return;
      }

      try {
        if (message.type === "set_molecule") {
          await ketcher.setMolecule(message.value || "");
          send({ type: "molecule_set" });
        } else if (message.type === "get_smiles") {
          const smiles = await ketcher.getSmiles();
          send({ type: "smiles", requestId: message.requestId, value: smiles });
        } else if (message.type === "clear") {
          await ketcher.setMolecule("");
        }
      } catch (error) {
        send({
          type: "error",
          requestId: "requestId" in message ? message.requestId : undefined,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    };

    window.addEventListener("message", receive);
    document.addEventListener("message", receive);
    send({ type: "ready", version: "3.17.2" });
  }, []);

  return (
    <Editor
      staticResourcesUrl="."
      structServiceProvider={provider}
      onInit={onInit}
      errorHandler={(message) => send({ type: "error", message })}
      disableMacromoleculesEditor
    />
  );
}

createRoot(document.getElementById("root")!).render(<EditorShell />);
