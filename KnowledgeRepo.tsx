import { useRef, useEffect, useCallback } from "react";
import { Box } from "@mui/material";
import { useStore } from "../store";
import { useLocation } from "react-router-dom";

export default function KnowledgeRepo({ isActive = true }: { isActive?: boolean }) {
  const darkMode = useStore((s) => s.darkMode);
  const location = useLocation();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const requestedSection = new URLSearchParams(location.search).get("section");
  const iframeSrc = requestedSection
    ? `/knowledge-repo/index.html#${encodeURIComponent(requestedSection)}`
    : "/knowledge-repo/index.html";

  const sendTheme = useCallback((dark: boolean) => {
    iframeRef.current?.contentWindow?.postMessage(
      dark ? "theme:dark" : "theme:light",
      "*"
    );
  }, []);

  const focusFrame = useCallback(() => {
    iframeRef.current?.focus();
    iframeRef.current?.contentWindow?.focus();
  }, []);

  useEffect(() => {
    sendTheme(darkMode);
  }, [darkMode, sendTheme]);

  useEffect(() => {
    if (!isActive) return;
    const id = setTimeout(focusFrame, 50);
    return () => clearTimeout(id);
  }, [isActive, focusFrame]);

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
        src={iframeSrc}
        title="Knowledge Repository"
        onLoad={() => {
          sendTheme(darkMode);
          focusFrame();
        }}
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
