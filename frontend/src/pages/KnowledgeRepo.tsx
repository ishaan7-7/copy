import { useRef, useEffect, useCallback } from "react";
import { Box } from "@mui/material";
import { useStore } from "../store";

export default function KnowledgeRepo() {
  const darkMode = useStore((s) => s.darkMode);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const sendTheme = useCallback((dark: boolean) => {
    iframeRef.current?.contentWindow?.postMessage(
      dark ? "theme:dark" : "theme:light",
      "*"
    );
  }, []);

  useEffect(() => {
    sendTheme(darkMode);
  }, [darkMode, sendTheme]);

  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        minHeight: 0,
        display: "flex",
        overflow: "hidden",
      }}
    >
      <iframe
        ref={iframeRef}
        src="/knowledge-repo/index.html"
        title="Knowledge Repository"
        onLoad={() => sendTheme(darkMode)}
        style={{
          width: "100%",
          height: "100%",
          display: "block",
          border: "none",
        }}
      />
    </Box>
  );
}
